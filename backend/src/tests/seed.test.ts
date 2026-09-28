import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { githubOrganizations, organizationMembers, repositories, users } from "../db/schema.js";
import { provisionSeedData } from "../seed/provision.js";
import { startTestApp, type TestContext } from "./harness.js";

let ctx: TestContext;
before(async () => { ctx = await startTestApp(); });
after(async () => { await ctx.close(); });

describe("seed provisioning", () => {
  test("promotes the admin, creates the organization once, and can link + sync GitHub", async () => {
    const admin = await ctx.user("seedadmin");
    const owner = await ctx.user("seedowner");
    ctx.github.installations.set("777", {
      id: "777", account: { id: "31", login: "seed-org", type: "Organization", name: "Seed Org", htmlUrl: null },
      repositorySelection: "all", permissions: { issues: "read", metadata: "read" }, createdAt: "2026-01-01T00:00:00Z", suspendedAt: null,
    });
    ctx.github.repos.set("777", [{ id: "9", name: "r", fullName: "seed-org/r", owner: "seed-org", url: "https://github.com/seed-org/r", defaultBranch: "main", archived: false, private: false }]);
    ctx.github.issues.set("seed-org/r", [{ id: "90", number: 1, title: "Issue", body: null, author: "a", url: "https://github.com/seed-org/r/issues/1", state: "open", labels: [], createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z" }]);

    const first = await provisionSeedData(ctx.services, { admin, orgOwner: owner, organizationName: "Seed Security", githubInstallationId: "777" });
    assert.equal(first.organizationCreated, true);
    assert.deepEqual(first.github, { linked: true, repositoriesSynced: 1, issuesSynced: 1 });
    const [a] = await ctx.db.select().from(users).where(eq(users.id, admin.id));
    assert.equal(a!.role, "platform_admin");
    const [m] = await ctx.db.select().from(organizationMembers).where(eq(organizationMembers.userId, owner.id));
    assert.equal(m!.role, "owner");

    const second = await provisionSeedData(ctx.services, { admin, orgOwner: owner, organizationName: "Seed Security", githubInstallationId: "777" });
    assert.equal(second.organizationCreated, false);
    assert.equal(second.organizationId, first.organizationId);
    assert.equal((await ctx.db.select().from(githubOrganizations)).length, 1);
    assert.equal((await ctx.db.select().from(repositories)).length, 1);

    const me = await ctx.api("GET", "/api/admin/dashboard", { token: admin.token });
    assert.equal(me.status, 200, "seeded admin can use the admin console");
  });

  test("GitHub linking is skipped, not faked, when the App is not configured", async () => {
    ctx.github.configured = false;
    const admin = await ctx.user("seedadmin2");
    const owner = await ctx.user("seedowner2");
    const r = await provisionSeedData(ctx.services, { admin, orgOwner: owner, organizationName: "Second Org", githubInstallationId: "999" });
    assert.equal(r.github?.linked, false);
    ctx.github.configured = true;
  });
});
