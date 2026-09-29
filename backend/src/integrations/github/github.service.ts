import { and, count, desc, eq, ilike, inArray, max, notInArray, or, sql, type SQL } from "drizzle-orm";
import { ref } from "../../utils/sql.js";
import { z } from "zod";
import type { DbOrTx } from "../../db/index.js";
import { challenges, githubEvents, githubIssues, githubOrganizations, organizations, organizationSources, repositories, sources } from "../../db/schema.js";
import type { ServiceDeps } from "../../services/deps.js";
import { signPayload, verifySignedPayload } from "../../utils/crypto.js";
import { iso } from "../../utils/dates.js";
import { badRequest, conflict, forbidden, notFound, parse, unavailable } from "../../utils/http.js";
import { likePattern, offsetOf, paginated, paginationSchema } from "../../utils/pagination.js";
import type { GitHubInstallation, GitHubIssueData, GitHubRepositoryData } from "./types.js";

const INSTALL_STATE_TTL_MS = 60 * 60_000;

export const linkInstallationSchema = z.object({
  installationId: z.union([z.string().regex(/^\d{1,20}$/), z.number().int().positive()]).transform(String),
  state: z.string().max(4096).optional(),
}).strict();

export const syncSchema = z.object({
  repositoryId: z.uuid().optional(),
  /** First import after linking an installation: connect every repository the installation can access. */
  importAll: z.boolean().optional(),
}).strict();

export const connectRepositoriesSchema = z.object({
  githubRepoIds: z.array(z.union([z.string().regex(/^\d{1,20}$/), z.number().int().positive()]).transform(String)).min(1).max(100),
}).strict();

export const updateRepositorySchema = z.object({
  isActive: z.boolean().optional(),
  defaultBranch: z.string().trim().min(1).max(255).optional(),
}).strict().refine((v) => Object.keys(v).length > 0, "Provide at least one field");

export const issuesQuerySchema = paginationSchema.extend({
  repositoryId: z.uuid().optional(),
  state: z.enum(["open", "closed", "all"]).default("open"),
  search: z.string().trim().max(100).optional(),
});

interface InstallState { purpose: "github_install"; org: string; uid: string; iat: number }

async function ensureGithubSource(db: DbOrTx) {
  const [existing] = await db.select().from(sources).where(eq(sources.type, "github")).limit(1);
  if (existing) return existing;
  await db.insert(sources).values({ name: "GitHub", type: "github", baseUrl: "https://github.com" }).onConflictDoNothing();
  const [row] = await db.select().from(sources).where(eq(sources.type, "github")).limit(1);
  return row!;
}

export async function upsertRepository(db: DbOrTx, githubOrganizationId: string, r: GitHubRepositoryData, now: Date) {
  const [row] = await db.insert(repositories).values({
    githubOrganizationId, githubRepoId: r.id, name: r.name, fullName: r.fullName, url: r.url,
    defaultBranch: r.defaultBranch, isActive: !r.archived, createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({
    target: repositories.githubRepoId,
    // Syncs and webhooks refresh metadata but never re-enable a repository the organization disabled.
    set: { githubOrganizationId, name: r.name, fullName: r.fullName, url: r.url, defaultBranch: r.defaultBranch, updatedAt: now, ...(r.archived ? { isActive: false } : {}) },
  }).returning();
  return row!;
}

export async function upsertIssue(db: DbOrTx, repositoryId: string, i: GitHubIssueData, now: Date) {
  const values = {
    repositoryId, githubIssueId: i.id, issueNumber: i.number, title: i.title, body: i.body, author: i.author, url: i.url,
    state: i.state, labels: i.labels, createdAt: new Date(i.createdAt), updatedAt: new Date(i.updatedAt), syncedAt: now,
  };
  const [row] = await db.insert(githubIssues).values(values).onConflictDoUpdate({
    target: githubIssues.githubIssueId,
    set: { repositoryId, issueNumber: i.number, title: i.title, body: i.body, author: i.author, url: i.url, state: i.state,
      labels: i.labels, updatedAt: new Date(i.updatedAt), syncedAt: now },
  }).returning();
  return row!;
}

export class GitHubService {
  constructor(private readonly deps: ServiceDeps) {}

  private requireConfigured() {
    if (!this.deps.github.isConfigured()) throw unavailable("GITHUB_NOT_CONFIGURED", "GitHub App is not configured");
  }

  /** URL to install the securexMST app, carrying a signed state bound to this organization and user. */
  async installUrl(organizationId: string, userId: string) {
    this.requireConfigured();
    const secret = this.deps.config.signingSecret;
    if (!secret) throw unavailable("SIGNING_NOT_CONFIGURED", "APP_SIGNING_SECRET is required for the GitHub install flow");
    const app = await this.deps.github.getApp();
    const state = signPayload(secret, { purpose: "github_install", org: organizationId, uid: userId, iat: this.deps.now().getTime() });
    return { installUrl: `${app.htmlUrl.replace(/\/$/, "")}/installations/new?state=${encodeURIComponent(state)}`, appSlug: app.slug, state };
  }

  /**
   * Associates a GitHub App installation with a SECUREX organization. Org owners/admins must present the
   * signed state from `installUrl` and the installation must have been created after that flow started, so a
   * pre-existing installation of someone else cannot be claimed. Platform admins may link directly.
   */
  async linkInstallation(organizationId: string, user: { id: string; role: string }, body: unknown) {
    this.requireConfigured();
    const input = parse(linkInstallationSchema, body);
    const installation = await this.deps.github.getInstallation(input.installationId);
    if (user.role !== "platform_admin") this.assertInstallState(organizationId, user.id, input.state, installation);
    if (installation.suspendedAt) throw conflict("GITHUB_INSTALLATION_SUSPENDED", "This GitHub App installation is suspended");
    const now = this.deps.now();
    const account = installation.account;

    const linked = await this.deps.db.transaction(async (tx) => {
      const [byInstallation] = await tx.select().from(githubOrganizations).where(eq(githubOrganizations.installationId, installation.id)).limit(1);
      const [byAccount] = await tx.select().from(githubOrganizations).where(eq(githubOrganizations.githubOrgId, account.id)).limit(1);
      const existing = byInstallation ?? byAccount;
      if (existing && existing.organizationId !== organizationId) {
        throw conflict("GITHUB_INSTALLATION_LINKED", "This GitHub account is already linked to another SECUREX organization");
      }
      let row;
      if (existing) {
        [row] = await tx.update(githubOrganizations).set({ githubOrgId: account.id, login: account.login, name: account.name, installationId: installation.id, updatedAt: now })
          .where(eq(githubOrganizations.id, existing.id)).returning();
      } else {
        [row] = await tx.insert(githubOrganizations).values({
          organizationId, githubOrgId: account.id, login: account.login, name: account.name, installationId: installation.id, createdAt: now, updatedAt: now,
        }).returning();
      }
      const source = await ensureGithubSource(tx);
      await tx.insert(organizationSources).values({
        organizationId, sourceId: source.id, externalId: account.id, externalName: account.login, externalUrl: account.htmlUrl,
        metadata: { installationId: installation.id, accountType: account.type, repositorySelection: installation.repositorySelection }, isActive: true,
      }).onConflictDoUpdate({
        target: [organizationSources.organizationId, organizationSources.sourceId],
        set: { externalId: account.id, externalName: account.login, externalUrl: account.htmlUrl, isActive: true, updatedAt: now,
          metadata: { installationId: installation.id, accountType: account.type, repositorySelection: installation.repositorySelection } },
      });
      return row!;
    });
    return {
      id: linked.id, installationId: linked.installationId, login: linked.login, name: linked.name, accountType: account.type,
      permissions: installation.permissions, repositorySelection: installation.repositorySelection,
    };
  }

  private assertInstallState(organizationId: string, userId: string, state: string | undefined, installation: GitHubInstallation) {
    const secret = this.deps.config.signingSecret;
    if (!secret) throw unavailable("SIGNING_NOT_CONFIGURED", "APP_SIGNING_SECRET is required for the GitHub install flow");
    const payload = state ? verifySignedPayload<InstallState>(secret, state) : null;
    if (!payload || payload.purpose !== "github_install" || payload.org !== organizationId || payload.uid !== userId) {
      throw forbidden("A valid install state from this organization's install link is required", "GITHUB_INSTALL_STATE_INVALID");
    }
    const now = this.deps.now().getTime();
    if (now - payload.iat > INSTALL_STATE_TTL_MS) throw forbidden("Install state expired; start the GitHub install again", "GITHUB_INSTALL_STATE_EXPIRED");
    const created = installation.createdAt ? Date.parse(installation.createdAt) : NaN;
    if (!Number.isFinite(created) || created < payload.iat - 5 * 60_000) {
      throw forbidden("Only an installation created from this organization's install link can be linked", "GITHUB_INSTALLATION_NOT_FROM_FLOW");
    }
  }

  private async installationsFor(organizationId: string) {
    return this.deps.db.select().from(githubOrganizations).where(eq(githubOrganizations.organizationId, organizationId));
  }

  /** Pulls repositories and issues through the installation token and upserts them (no duplicates). */
  async sync(organizationId: string, body: unknown) {
    this.requireConfigured();
    const input = parse(syncSchema, body ?? {});
    const installs = await this.installationsFor(organizationId);
    if (installs.length === 0) throw conflict("GITHUB_NOT_LINKED", "Link a GitHub App installation first");
    const now = this.deps.now();
    let reposSynced = 0;
    let issuesSynced = 0;
    for (const inst of installs) {
      const repos = await this.deps.github.listInstallationRepositories(inst.installationId);
      const known = new Map((await this.deps.db.select().from(repositories).where(eq(repositories.githubOrganizationId, inst.id))).map((r) => [r.githubRepoId, r]));
      // Only repositories the organization connected are refreshed; everything else is added via connectRepositories.
      const wanted = repos.filter((r) => input.importAll || known.has(r.id));
      const rows = [];
      for (const r of wanted) rows.push({ row: await upsertRepository(this.deps.db, inst.id, r, now), data: r });
      reposSynced += rows.length;
      const accessible = new Set(repos.map((r) => r.id));
      const lost = [...known.values()].filter((r) => !accessible.has(r.githubRepoId)).map((r) => r.id);
      if (lost.length) await this.deps.db.update(repositories).set({ isActive: false, updatedAt: now }).where(inArray(repositories.id, lost));
      for (const { row, data } of rows) {
        if (input.repositoryId && row.id !== input.repositoryId) continue;
        issuesSynced += await this.syncIssues(inst.installationId, row, data, now);
      }
    }
    return { installations: installs.length, repositoriesSynced: reposSynced, issuesSynced, syncedAt: iso(now) };
  }

  /** Imports (incrementally) the issues of one active repository. */
  private async syncIssues(installationId: string, row: typeof repositories.$inferSelect, data: GitHubRepositoryData, now: Date) {
    if (!row.isActive) return 0;
    const [last] = await this.deps.db.select({ at: max(githubIssues.updatedAt) }).from(githubIssues).where(eq(githubIssues.repositoryId, row.id));
    const since = last?.at ? new Date(new Date(last.at).getTime() - 60_000) : undefined;
    const issues = await this.deps.github.listRepositoryIssues(installationId, data.owner, data.name, since);
    for (const i of issues) await upsertIssue(this.deps.db, row.id, i, now);
    return issues.length;
  }

  /** Repositories the organization's installations can access, flagged with whether each is already connected. */
  async availableRepositories(organizationId: string) {
    this.requireConfigured();
    const installs = await this.installationsFor(organizationId);
    const out = [];
    for (const inst of installs) {
      const [accessible, details, connectedRows] = await Promise.all([
        this.deps.github.listInstallationRepositories(inst.installationId),
        this.deps.github.getInstallation(inst.installationId),
        this.deps.db.select().from(repositories).where(eq(repositories.githubOrganizationId, inst.id)),
      ]);
      const connected = new Set(connectedRows.filter((r) => r.isActive).map((r) => r.githubRepoId));
      const login = encodeURIComponent(inst.login);
      out.push({
        id: inst.id, installationId: inst.installationId, login: inst.login,
        repositorySelection: details.repositorySelection,
        // Where the account owner grants the app access to more repositories.
        manageUrl: details.account.type === "Organization"
          ? `https://github.com/organizations/${login}/settings/installations/${inst.installationId}`
          : `https://github.com/settings/installations/${inst.installationId}`,
        repositories: accessible.map((r) => ({
          githubRepoId: r.id, name: r.name, fullName: r.fullName, url: r.url, private: r.private, archived: r.archived,
          connected: connected.has(r.id),
        })).sort((a, b) => a.fullName.localeCompare(b.fullName)),
      });
    }
    return { installations: out };
  }

  /** Connects the selected repositories (from the org's own installations) and imports their issues. */
  async connectRepositories(organizationId: string, body: unknown) {
    this.requireConfigured();
    const { githubRepoIds } = parse(connectRepositoriesSchema, body);
    const installs = await this.installationsFor(organizationId);
    if (installs.length === 0) throw conflict("GITHUB_NOT_LINKED", "Link a GitHub App installation first");
    const wanted = new Set(githubRepoIds);
    const now = this.deps.now();
    const connected: { id: string; fullName: string }[] = [];
    let issuesSynced = 0;
    for (const inst of installs) {
      const accessible = (await this.deps.github.listInstallationRepositories(inst.installationId)).filter((r) => wanted.has(r.id));
      for (const data of accessible) {
        if (data.archived) throw badRequest("GITHUB_REPOSITORY_ARCHIVED", `${data.fullName} is archived and cannot be connected`);
        const row = await upsertRepository(this.deps.db, inst.id, data, now);
        const [active] = await this.deps.db.update(repositories).set({ isActive: true, updatedAt: now }).where(eq(repositories.id, row.id)).returning();
        connected.push({ id: row.id, fullName: row.fullName });
        wanted.delete(data.id);
        issuesSynced += await this.syncIssues(inst.installationId, active!, data, now);
      }
    }
    if (wanted.size) throw badRequest("GITHUB_REPOSITORY_NOT_ACCESSIBLE", "Some repositories are not accessible to this organization's GitHub App installation");
    return { connected, issuesSynced, syncedAt: iso(now) };
  }

  private async ownRepository(organizationId: string, repositoryId: string) {
    if (!z.uuid().safeParse(repositoryId).success) throw notFound("Repository");
    const [row] = await this.deps.db.select({ r: repositories }).from(repositories)
      .innerJoin(githubOrganizations, eq(githubOrganizations.id, repositories.githubOrganizationId))
      .where(and(eq(repositories.id, repositoryId), eq(githubOrganizations.organizationId, organizationId))).limit(1);
    if (!row) throw notFound("Repository");
    return row.r;
  }

  async updateRepository(organizationId: string, repositoryId: string, body: unknown) {
    const input = parse(updateRepositorySchema, body);
    const repo = await this.ownRepository(organizationId, repositoryId);
    const [row] = await this.deps.db.update(repositories).set({ ...input, updatedAt: this.deps.now() }).where(eq(repositories.id, repo.id)).returning();
    return { id: row!.id, fullName: row!.fullName, defaultBranch: row!.defaultBranch, isActive: row!.isActive, updatedAt: iso(row!.updatedAt) };
  }

  /** Disconnects a repository and its imported issues. Refused while challenges are based on its issues. */
  async removeRepository(organizationId: string, repositoryId: string) {
    const repo = await this.ownRepository(organizationId, repositoryId);
    const [{ used } = { used: 0 }] = await this.deps.db.select({ used: count() }).from(challenges)
      .innerJoin(githubIssues, eq(githubIssues.id, challenges.githubIssueId)).where(eq(githubIssues.repositoryId, repo.id));
    if (Number(used) > 0) {
      throw conflict("GITHUB_REPOSITORY_IN_USE", `${Number(used)} challenge(s) are based on issues from this repository; disable syncing instead of removing it`);
    }
    await this.deps.db.delete(repositories).where(eq(repositories.id, repo.id));
    return { removed: true, id: repo.id };
  }

  async overview(organizationId: string) {
    const installs = await this.installationsFor(organizationId);
    const ids = installs.map((i) => i.id);
    const repos = ids.length ? await this.deps.db.select({
      r: repositories,
      issues: sql<number>`(SELECT count(*)::int FROM ${githubIssues} i WHERE i.repository_id = ${ref(repositories.id)})`,
      openIssues: sql<number>`(SELECT count(*)::int FROM ${githubIssues} i WHERE i.repository_id = ${ref(repositories.id)} AND i.state = 'open')`,
    }).from(repositories).where(inArray(repositories.githubOrganizationId, ids)).orderBy(repositories.fullName) : [];
    return {
      configured: this.deps.github.isConfigured(),
      installations: installs.map((i) => ({ id: i.id, installationId: i.installationId, login: i.login, name: i.name, linkedAt: iso(i.createdAt) })),
      repositories: repos.map(({ r, issues, openIssues }) => ({
        id: r.id, fullName: r.fullName, name: r.name, url: r.url, defaultBranch: r.defaultBranch, isActive: r.isActive,
        issueCount: Number(issues), openIssueCount: Number(openIssues), updatedAt: iso(r.updatedAt),
      })),
    };
  }

  async listIssues(organizationId: string, rawQuery: unknown) {
    const q = parse(issuesQuerySchema, rawQuery);
    const conditions: SQL[] = [eq(githubOrganizations.organizationId, organizationId)];
    if (q.repositoryId) conditions.push(eq(githubIssues.repositoryId, q.repositoryId));
    if (q.state !== "all") conditions.push(eq(githubIssues.state, q.state));
    if (q.search) conditions.push(or(ilike(githubIssues.title, likePattern(q.search)), ilike(githubIssues.body, likePattern(q.search)))!);
    const where = and(...conditions);
    const base = this.deps.db.select({ total: count() }).from(githubIssues)
      .innerJoin(repositories, eq(repositories.id, githubIssues.repositoryId))
      .innerJoin(githubOrganizations, eq(githubOrganizations.id, repositories.githubOrganizationId)).where(where);
    const [{ total } = { total: 0 }] = await base;
    const rows = await this.deps.db.select({
      i: githubIssues, repo: repositories.fullName,
      linkedChallengeId: sql<string | null>`(SELECT c.id FROM ${challenges} c WHERE c.github_issue_id = ${ref(githubIssues.id)} LIMIT 1)`,
    }).from(githubIssues)
      .innerJoin(repositories, eq(repositories.id, githubIssues.repositoryId))
      .innerJoin(githubOrganizations, eq(githubOrganizations.id, repositories.githubOrganizationId))
      .where(where).orderBy(desc(githubIssues.updatedAt)).limit(q.limit).offset(offsetOf(q));
    return paginated(rows.map(({ i, repo, linkedChallengeId }) => ({
      id: i.id, githubIssueId: i.githubIssueId, repositoryId: i.repositoryId, repository: repo, number: i.issueNumber,
      title: i.title, body: i.body, author: i.author, url: i.url, state: i.state, labels: i.labels ?? [],
      createdAt: iso(i.createdAt), updatedAt: iso(i.updatedAt), syncedAt: iso(i.syncedAt), linkedChallengeId,
    })), Number(total), q);
  }

  /** Admin overview across organizations. */
  async adminOverview() {
    const orgs = await this.deps.db.select({
      g: githubOrganizations,
      orgName: organizations.name,
      repos: sql<number>`(SELECT count(*)::int FROM ${repositories} r WHERE r.github_organization_id = ${ref(githubOrganizations.id)})`,
      lastSync: sql<Date | null>`(SELECT max(i.synced_at) FROM ${githubIssues} i JOIN ${repositories} r ON r.id = i.repository_id WHERE r.github_organization_id = ${ref(githubOrganizations.id)})`,
    }).from(githubOrganizations)
      .innerJoin(organizations, eq(organizations.id, githubOrganizations.organizationId))
      .orderBy(desc(githubOrganizations.createdAt)).limit(100);
    const [events] = await this.deps.db.select({
      total: count(), unprocessed: sql<number>`count(*) FILTER (WHERE ${githubEvents.processedAt} IS NULL)::int`,
    }).from(githubEvents);
    const recent = await this.deps.db.select({ id: githubEvents.id, eventId: githubEvents.eventId, eventType: githubEvents.eventType,
      organizationId: githubEvents.organizationId, receivedAt: githubEvents.receivedAt, processedAt: githubEvents.processedAt })
      .from(githubEvents).orderBy(desc(githubEvents.receivedAt)).limit(20);
    return {
      appConfigured: this.deps.github.isConfigured(),
      webhookSecretConfigured: Boolean(this.deps.config.github.webhookSecret),
      installations: orgs.map(({ g, repos, orgName, lastSync }) => ({ id: g.id, organizationId: g.organizationId, login: g.login, name: g.name,
        installationId: g.installationId, repositories: Number(repos), linkedAt: iso(g.createdAt),
        orgName, githubOrg: g.login, installationStatus: "connected", repositoryCount: Number(repos),
        lastSyncAt: lastSync ? iso(new Date(lastSync)) : null,
        webhookStatus: this.deps.config.github.webhookSecret ? (Number(events?.total ?? 0) > 0 ? "active" : "inactive") : "inactive" })),
      events: { total: Number(events?.total ?? 0), unprocessed: Number(events?.unprocessed ?? 0) },
      recentEvents: recent.map((e) => ({ ...e, receivedAt: iso(e.receivedAt), processedAt: iso(e.processedAt) })),
    };
  }



}
