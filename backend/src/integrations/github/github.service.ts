import { and, count, desc, eq, ilike, inArray, max, notInArray, or, sql, type SQL } from "drizzle-orm";
import { ref } from "../../utils/sql.js";
import { z } from "zod";
import type { DbOrTx } from "../../db/index.js";
import { challenges, githubEvents, githubIssues, githubOrganizations, organizations, organizationSources, repositories, sources } from "../../db/schema.js";
import type { ServiceDeps } from "../../services/deps.js";
import { signPayload, verifySignedPayload } from "../../utils/crypto.js";
import { iso } from "../../utils/dates.js";
import { conflict, forbidden, parse, unavailable } from "../../utils/http.js";
import { likePattern, offsetOf, paginated, paginationSchema } from "../../utils/pagination.js";
import type { GitHubInstallation, GitHubIssueData, GitHubRepositoryData } from "./types.js";

const INSTALL_STATE_TTL_MS = 60 * 60_000;

export const linkInstallationSchema = z.object({
  installationId: z.union([z.string().regex(/^\d{1,20}$/), z.number().int().positive()]).transform(String),
  state: z.string().max(4096).optional(),
}).strict();

export const syncSchema = z.object({ repositoryId: z.uuid().optional() }).strict();

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
    set: { githubOrganizationId, name: r.name, fullName: r.fullName, url: r.url, defaultBranch: r.defaultBranch, isActive: !r.archived, updatedAt: now },
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
      const rows = [];
      for (const r of repos) rows.push({ row: await upsertRepository(this.deps.db, inst.id, r, now), data: r });
      reposSynced += rows.length;
      const seen = rows.map((r) => r.row.id);
      await this.deps.db.update(repositories).set({ isActive: false, updatedAt: now })
        .where(and(eq(repositories.githubOrganizationId, inst.id), seen.length ? notInArray(repositories.id, seen) : undefined));
      for (const { row, data } of rows) {
        if (input.repositoryId && row.id !== input.repositoryId) continue;
        if (!row.isActive) continue;
        const [last] = await this.deps.db.select({ at: max(githubIssues.updatedAt) }).from(githubIssues).where(eq(githubIssues.repositoryId, row.id));
        const since = last?.at ? new Date(new Date(last.at).getTime() - 60_000) : undefined;
        const issues = await this.deps.github.listRepositoryIssues(inst.installationId, data.owner, data.name, since);
        for (const i of issues) await upsertIssue(this.deps.db, row.id, i, now);
        issuesSynced += issues.length;
      }
    }
    return { installations: installs.length, repositoriesSynced: reposSynced, issuesSynced, syncedAt: iso(now) };
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
