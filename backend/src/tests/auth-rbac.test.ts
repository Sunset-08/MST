import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { seedOrgWithChallenge, startTestApp, type TestContext } from "./harness.js";

let ctx: TestContext;
before(async () => { ctx = await startTestApp(); });
after(async () => { await ctx.close(); });

describe("auth", () => {
  test("register validates input and never echoes passwords", async () => {
    const bad = await ctx.api("POST", "/api/auth/register", { body: { email: "nope", password: "Sup3r-secret-value" } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, "VALIDATION_ERROR");
    assert.equal(JSON.stringify(bad.body).includes("Sup3r-secret-value"), false);
    const good = await ctx.api("POST", "/api/auth/register", {
      body: { email: "new@example.test", password: "long-enough-pw", username: "new_user", displayName: "New" },
    });
    assert.equal(good.status, 202);
  });

  test("login rejects bad credentials with 401 and accepts valid ones", async () => {
    const bad = await ctx.api("POST", "/api/auth/login", { body: { email: "a@example.test", password: "wrong" } });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error.code, "AUTH_INVALID_CREDENTIALS");
    const good = await ctx.api("POST", "/api/auth/login", { body: { email: "a@example.test", password: "correct-password" } });
    assert.equal(good.status, 200);
  });

  test("protected route requires a valid bearer token", async () => {
    assert.equal((await ctx.api("GET", "/api/users/me")).status, 401);
    const invalid = await ctx.api("GET", "/api/users/me", { token: "forged" });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.error.code, "AUTH_INVALID_TOKEN");
    const u = await ctx.user("alice");
    const me = await ctx.api("GET", "/api/users/me", { token: u.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.username, "alice");
    assert.equal(me.body.data.globalRank, 1);
    assert.equal(me.body.data.level, 1);
  });

  test("auth /me keeps working through the preserved Supabase router", async () => {
    const u = await ctx.user("bob");
    const me = await ctx.api("GET", "/api/auth/me", { token: u.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.username, "bob");
  });
});

describe("RBAC", () => {
  test("participants are rejected from every admin endpoint; platform admins are allowed", async () => {
    const p = await ctx.user("carol");
    const admin = await ctx.user("root", "platform_admin");
    for (const path of ["dashboard", "users", "organizations", "challenges", "submissions", "rewards", "github", "analytics", "settings"]) {
      const denied = await ctx.api("GET", `/api/admin/${path}`, { token: p.token });
      assert.equal(denied.status, 403, path);
      assert.equal(denied.body.error.code, "ADMIN_REQUIRED");
      assert.equal((await ctx.api("GET", `/api/admin/${path}`, { token: admin.token })).status, 200, path);
    }
  });

  test("organization owners cannot reach admin endpoints", async () => {
    const { owner } = await seedOrgWithChallenge(ctx);
    assert.equal((await ctx.api("GET", "/api/admin/dashboard", { token: owner.token })).status, 403);
  });

  test("org members cannot access another organization (no enumeration)", async () => {
    const a = await seedOrgWithChallenge(ctx);
    const b = await seedOrgWithChallenge(ctx);
    const other = await ctx.api("GET", `/api/organizations/${b.orgId}`, { token: a.owner.token });
    assert.equal(other.status, 404);
    const missing = await ctx.api("GET", "/api/organizations/00000000-0000-4000-8000-000000000000", { token: a.owner.token });
    assert.equal(missing.status, 404);
    const cross = await ctx.api("GET", "/api/org/stats", { token: a.owner.token, headers: { "X-Organization-Id": b.orgId } });
    assert.equal(cross.status, 403);
    const crossEdit = await ctx.api("PUT", `/api/org/challenges/${b.challengeId}`, {
      token: a.owner.token, headers: { "X-Organization-Id": a.orgId }, body: { title: "Hijacked title" },
    });
    assert.equal(crossEdit.status, 404);
    const crossDelete = await ctx.api("DELETE", `/api/organizations/${b.orgId}`, { token: a.owner.token });
    assert.equal(crossDelete.status, 404);
  });

  test("organization member roles: members cannot create challenges or manage roles", async () => {
    const { owner, orgId } = await seedOrgWithChallenge(ctx);
    const m = await ctx.user("member_mo");
    assert.equal((await ctx.api("POST", `/api/organizations/${orgId}/members`, { token: owner.token, body: { username: m.username } })).status, 201);
    const hdr = { "X-Organization-Id": orgId };
    assert.equal((await ctx.api("GET", "/api/org/stats", { token: m.token, headers: hdr })).status, 200);
    const create = await ctx.api("POST", "/api/org/challenges", { token: m.token, headers: hdr, body: {} });
    assert.equal(create.status, 403);
    const promote = await ctx.api("PUT", `/api/organizations/${orgId}/members/${m.id}`, { token: m.token, body: { role: "owner" } });
    assert.equal(promote.status, 403);
    const lastOwner = await ctx.api("DELETE", `/api/organizations/${orgId}/members/${owner.id}`, { token: owner.token });
    assert.equal(lastOwner.status, 409);
    assert.equal(lastOwner.body.error.code, "LAST_OWNER");
  });

  test("participant cannot read another participant's submission result", async () => {
    const { challengeId } = await seedOrgWithChallenge(ctx);
    const p1 = await ctx.user("dave");
    const p2 = await ctx.user("erin");
    const start = await ctx.api("POST", `/api/challenges/${challengeId}/start`, { token: p1.token });
    const sub = await ctx.api("POST", `/api/attempts/${start.body.data.id}/submit`, { token: p1.token, body: { selectedAnswers: ["A"] } });
    assert.equal(sub.status, 202);
    const peek = await ctx.api("GET", `/api/submissions/${sub.body.data.submissionId}/result`, { token: p2.token });
    assert.equal(peek.status, 404);
    const hijack = await ctx.api("POST", `/api/attempts/${start.body.data.id}/submit`, { token: p2.token, body: { selectedAnswers: ["B"] } });
    assert.equal(hijack.status, 404);
  });

  test("mass assignment and malformed input are rejected", async () => {
    const u = await ctx.user("frank");
    const org = await ctx.api("POST", "/api/organizations", { token: u.token, body: { name: "Frank Org", status: "active", id: "x" } });
    assert.equal(org.status, 400);
    const bad = await fetch(`${ctx.baseUrl}/api/organizations`, {
      method: "POST", headers: { Authorization: `Bearer ${u.token}`, "Content-Type": "application/json" }, body: "{not json",
    });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json() as { error: { code: string } }).error.code, "MALFORMED_JSON");
    const huge = await ctx.api("POST", "/api/organizations", { token: u.token, body: { name: "x".repeat(40_000) } });
    assert.equal(huge.status, 413);
  });

  test("responses never include stack traces and set hardening headers", async () => {
    const r = await ctx.api("GET", "/api/challenges/not-a-uuid");
    assert.equal(r.status, 404);
    assert.equal(JSON.stringify(r.body).includes("at "), false);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("x-powered-by"), null);
  });
});
