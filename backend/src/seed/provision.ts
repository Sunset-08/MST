import { eq } from "drizzle-orm";
import { organizationMembers, organizations, users } from "../db/schema.js";
import type { Services } from "../services/index.js";

export interface ProvisionInput {
  admin: { id: string };
  orgOwner: { id: string; role?: string };
  organizationName: string;
  /** Link this GitHub App installation to the organization and sync it (real GitHub API). */
  githubInstallationId?: string;
}

export interface ProvisionResult {
  adminPromoted: boolean;
  organizationId: string;
  organizationCreated: boolean;
  github?: { linked: boolean; repositoriesSynced: number; issuesSynced: number; skipped?: string };
}

/**
 * Development seed: promotes the admin and makes sure the organization owner has an organization.
 * Idempotent. Accounts themselves must already exist as real Supabase Auth users (see scripts/seed.ts).
 */
export async function provisionSeedData(services: Services, input: ProvisionInput): Promise<ProvisionResult> {
  const { db } = services.deps;
  const [admin] = await db.update(users).set({ role: "platform_admin", updatedAt: services.deps.now() }).where(eq(users.id, input.admin.id)).returning();
  if (!admin) throw new Error("Admin profile not found; the admin must sign in once first");

  const existing = await db.select({ id: organizations.id }).from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(eq(organizationMembers.userId, input.orgOwner.id)).limit(1);
  let organizationId = existing[0]?.id;
  let organizationCreated = false;
  if (!organizationId) {
    const created = await services.organizations.create({ id: input.orgOwner.id }, { name: input.organizationName });
    organizationId = created.id;
    organizationCreated = true;
  }

  const result: ProvisionResult = { adminPromoted: true, organizationId, organizationCreated };
  if (input.githubInstallationId) {
    if (!services.deps.github.isConfigured()) {
      result.github = { linked: false, repositoriesSynced: 0, issuesSynced: 0, skipped: "GitHub App is not configured" };
    } else {
      await services.github.linkInstallation(organizationId, { id: input.admin.id, role: "platform_admin" }, { installationId: input.githubInstallationId });
      const synced = await services.github.sync(organizationId, { importAll: true });
      result.github = { linked: true, repositoriesSynced: synced.repositoriesSynced, issuesSynced: synced.issuesSynced };
    }
  }
  return result;
}
