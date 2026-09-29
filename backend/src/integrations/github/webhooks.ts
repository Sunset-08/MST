import { createHmac } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { githubEvents, githubIssues, githubOrganizations, repositories } from "../../db/schema.js";
import type { ServiceDeps } from "../../services/deps.js";
import { safeEqual } from "../../utils/crypto.js";
import { normalizeIssue } from "./app-client.js";
import { upsertIssue, upsertRepository } from "./github.service.js";

/** Verifies `X-Hub-Signature-256` (HMAC-SHA256 of the raw body) in constant time. */
export function verifyGitHubSignature(secret: string, rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader || !/^sha256=[0-9a-f]{64}$/.test(signatureHeader)) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return safeEqual(expected, signatureHeader);
}

type AnyRecord = Record<string, unknown>;
const rec = (v: unknown): AnyRecord | undefined => (v && typeof v === "object" ? (v as AnyRecord) : undefined);

function repoData(r: AnyRecord) {
  const fullName = String(r.full_name ?? "");
  return {
    id: String(r.id), name: String(r.name ?? fullName.split("/")[1] ?? ""), fullName,
    owner: String(rec(r.owner)?.login ?? fullName.split("/")[0] ?? ""),
    url: String(r.html_url ?? `https://github.com/${fullName}`), defaultBranch: String(r.default_branch ?? "main"),
    archived: Boolean(r.archived), private: Boolean(r.private),
  };
}

export class GitHubWebhookService {
  constructor(private readonly deps: ServiceDeps) {}

  /**
   * Persists and processes one delivery. The delivery id is unique in github_events, so redeliveries of an
   * already processed event are acknowledged without reprocessing.
   */
  async handle(deliveryId: string, eventName: string, payload: AnyRecord) {
    const { db } = this.deps;
    const now = this.deps.now();
    const action = typeof payload.action === "string" ? payload.action : undefined;
    const eventType = action ? `${eventName}.${action}` : eventName;
    const inserted = await db.insert(githubEvents).values({ eventId: deliveryId, eventType, payload, receivedAt: now })
      .onConflictDoNothing().returning();
    let event = inserted[0];
    if (!event) {
      const [existing] = await db.select().from(githubEvents).where(eq(githubEvents.eventId, deliveryId)).limit(1);
      if (existing?.processedAt) return { duplicate: true, processed: false, eventType };
      event = existing!;
    }

    const installationId = rec(payload.installation)?.id;
    const [link] = installationId !== undefined
      ? await db.select().from(githubOrganizations).where(eq(githubOrganizations.installationId, String(installationId))).limit(1)
      : [];
    let repositoryId: string | null = null;

    await db.transaction(async (tx) => {
      if (link) {
        if (eventName === "installation" && action === "deleted") {
          await tx.update(repositories).set({ isActive: false, updatedAt: now }).where(eq(repositories.githubOrganizationId, link.id));
        } else if (eventName === "installation_repositories") {
          // Granting a repository to the app on GitHub is a deliberate act: connect (or re-enable) it.
          for (const r of (payload.repositories_added as AnyRecord[] | undefined) ?? []) {
            const data = repoData(r);
            const row = await upsertRepository(tx, link.id, data, now);
            if (!data.archived) await tx.update(repositories).set({ isActive: true, updatedAt: now }).where(eq(repositories.id, row.id));
          }
          const removed = ((payload.repositories_removed as AnyRecord[] | undefined) ?? []).map((r) => String(r.id));
          if (removed.length) await tx.update(repositories).set({ isActive: false, updatedAt: now }).where(inArray(repositories.githubRepoId, removed));
        } else if (eventName === "issues" && rec(payload.issue) && rec(payload.repository)) {
          // Only repositories the organization connected receive issues; a removed or disabled one is ignored.
          const [repo] = await tx.select().from(repositories)
            .where(and(eq(repositories.githubRepoId, String(rec(payload.repository)!.id)), eq(repositories.githubOrganizationId, link.id))).limit(1);
          if (repo?.isActive) {
            repositoryId = repo.id;
            const issue = normalizeIssue(rec(payload.issue)!);
            if (action === "deleted") {
              await tx.update(githubIssues).set({ state: "deleted", syncedAt: now }).where(eq(githubIssues.githubIssueId, issue.id));
            } else {
              await upsertIssue(tx, repo.id, issue, now);
            }
          }
        }
      }
      await tx.update(githubEvents).set({ processedAt: now, organizationId: link?.organizationId ?? null, repositoryId })
        .where(eq(githubEvents.id, event!.id));
    });
    return { duplicate: false, processed: true, eventType, linked: Boolean(link) };
  }
}
