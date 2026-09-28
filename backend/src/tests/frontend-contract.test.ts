import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";
import { seedOrgWithChallenge, startTestApp, waitForResult, type TestContext } from "./harness.js";

let ctx: TestContext;
before(async () => { ctx = await startTestApp(); });
after(async () => { await ctx.close(); });

describe("session refresh", () => {
  test("valid refresh token returns a new session; invalid is 401; malformed is 400", async () => {
    const ok = await ctx.api("POST", "/api/auth/refresh", { body: { refreshToken: "valid-refresh-token" } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.session.accessToken, "new-access");
    const bad = await ctx.api("POST", "/api/auth/refresh", { body: { refreshToken: "something-invalid" } });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error.code, "AUTH_REFRESH_FAILED");
    assert.equal((await ctx.api("POST", "/api/auth/refresh", { body: {} })).status, 400);
  });
});

describe("participant GitHub connection", () => {
  test("challenges cannot be started until a GitHub account is connected", async () => {
    const { challengeId } = await seedOrgWithChallenge(ctx);
    const u = await ctx.user("nogh", "participant", { github: false });
    const blocked = await ctx.api("POST", `/api/challenges/${challengeId}/start`, { token: u.token });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, "GITHUB_CONNECTION_REQUIRED");
    const me = await ctx.api("GET", "/api/users/me", { token: u.token });
    assert.equal(me.body.data.github.connected, false);
  });

  test("device flow: start -> pending -> connected stores the verified login; then challenges unlock", async () => {
    const { challengeId } = await seedOrgWithChallenge(ctx);
    const u = await ctx.user("connector", "participant", { github: false });
    const start = await ctx.api("POST", "/api/github/connect/start", { token: u.token });
    assert.equal(start.status, 200, JSON.stringify(start.body));
    assert.match(start.body.data.userCode, /^ABCD-/);
    assert.equal(JSON.stringify(start.body).includes("device-"), false, "device code never reaches the client");
    const { flowToken } = start.body.data;

    const pending = await ctx.api("POST", "/api/github/connect/poll", { token: u.token, body: { flowToken } });
    assert.equal(pending.body.data.status, "pending");

    ctx.githubUser.outcomes.set(`device-${ctx.githubUser.n}`, { status: "authorized", accessToken: "gho_tok" });
    ctx.githubUser.profiles.set("gho_tok", { id: "424242", login: "Real-Octocat", name: "Octo", avatarUrl: null });
    const done = await ctx.api("POST", "/api/github/connect/poll", { token: u.token, body: { flowToken } });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.data.status, "connected");
    assert.equal(done.body.data.githubUsername, "Real-Octocat");
    const [row] = await ctx.db.select().from(users).where(eq(users.id, u.id));
    assert.equal(row!.githubUsername, "Real-Octocat");
    assert.equal(JSON.stringify(done.body).includes("gho_tok"), false, "user token is never returned or stored");
    assert.equal((await ctx.api("POST", `/api/challenges/${challengeId}/start`, { token: u.token })).status, 201);
  });

  test("tokens are bound to the user, a GitHub account links to one user, expiry and denial are reported", async () => {
    const a = await ctx.user("ghA", "participant", { github: false });
    const b = await ctx.user("ghB", "participant", { github: false });
    const flowA = (await ctx.api("POST", "/api/github/connect/start", { token: a.token })).body.data.flowToken;
    const deviceA = `device-${ctx.githubUser.n}`;
    assert.equal((await ctx.api("POST", "/api/github/connect/poll", { token: b.token, body: { flowToken: flowA } })).status, 400);
    assert.equal((await ctx.api("POST", "/api/github/connect/poll", { token: a.token, body: { flowToken: "x".repeat(30) } })).status, 400);

    ctx.githubUser.outcomes.set(deviceA, { status: "denied" });
    assert.equal((await ctx.api("POST", "/api/github/connect/poll", { token: a.token, body: { flowToken: flowA } })).body.data.status, "denied");

    const flowB = (await ctx.api("POST", "/api/github/connect/start", { token: b.token })).body.data.flowToken;
    ctx.githubUser.outcomes.set(`device-${ctx.githubUser.n}`, { status: "authorized", accessToken: "tok-dup" });
    ctx.githubUser.profiles.set("tok-dup", { id: "1", login: "real-octocat", name: null, avatarUrl: null });
    const dup = await ctx.api("POST", "/api/github/connect/poll", { token: b.token, body: { flowToken: flowB } });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, "GITHUB_ACCOUNT_LINKED");

    ctx.clock.now = new Date(ctx.clock.now.getTime() + 16 * 60_000);
    assert.equal((await ctx.api("POST", "/api/github/connect/poll", { token: b.token, body: { flowToken: flowB } })).body.data.status, "expired");
    ctx.clock.now = new Date("2026-09-01T12:00:00.000Z");
  });

  test("not configured is reported, and disconnect clears the link", async () => {
    ctx.githubUser.configured = false;
    const u = await ctx.user("noclient", "participant", { github: false });
    const r = await ctx.api("POST", "/api/github/connect/start", { token: u.token });
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, "GITHUB_OAUTH_NOT_CONFIGURED");
    ctx.githubUser.configured = true;
    const v = await ctx.user("disconnector");
    assert.equal((await ctx.api("DELETE", "/api/github/connect", { token: v.token })).status, 200);
    const [row] = await ctx.db.select().from(users).where(eq(users.id, v.id));
    assert.equal(row!.githubUsername, null);
  });
});

describe("profile and organization status", () => {
  test("PUT /users/me updates only allowed fields", async () => {
    const u = await ctx.user("editor");
    const ok = await ctx.api("PUT", "/api/users/me", { token: u.token, body: { displayName: "Ed Itor", bio: "Security researcher" } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.displayName, "Ed Itor");
    assert.equal((await ctx.api("PUT", "/api/users/me", { token: u.token, body: { points: 99999 } })).status, 400);
    assert.equal((await ctx.api("PUT", "/api/users/me", { token: u.token, body: { role: "platform_admin" } })).status, 400);
    assert.equal((await ctx.api("PUT", "/api/users/me", { token: u.token, body: {} })).status, 400);
    const [row] = await ctx.db.select().from(users).where(eq(users.id, u.id));
    assert.equal(row!.role, "participant");
  });

  test("/users/me lists organization memberships for portal routing", async () => {
    const { owner, orgId } = await seedOrgWithChallenge(ctx);
    const me = await ctx.api("GET", "/api/users/me", { token: owner.token });
    assert.equal(me.body.data.organizations[0].organizationId, orgId);
    assert.equal(me.body.data.organizations[0].role, "owner");
  });

  test("org MST status reflects platform-vault funding by default and a configured minimum", async () => {
    const { owner, orgId } = await seedOrgWithChallenge(ctx);
    const r = await ctx.api("GET", "/api/org/mst-status", { token: owner.token, headers: { "X-Organization-Id": orgId } });
    assert.equal(r.body.data.paymentStatus, "READY_TO_PUBLISH");
    assert.equal(r.body.data.minimumRequired, 0);
    const funded = await startTestApp({ orgMinFunding: 10 });
    try {
      const s = await seedOrgWithChallenge(funded).catch(() => null);
      assert.ok(s, "publishing is not blocked server-side; the frontend reflects the status");
      const st = await funded.api("GET", "/api/org/mst-status", { token: s!.owner.token, headers: { "X-Organization-Id": s!.orgId } });
      assert.equal(st.body.data.paymentStatus, "PAYMENT_REQUIRED");
    } finally { await funded.close(); }
  });
});

describe("admin data shapes used by the frontend", () => {
  test("admin lists expose the fields the admin console renders", async () => {
    const seeded = await seedOrgWithChallenge(ctx);
    const p = await ctx.user("adminview");
    const start = await ctx.api("POST", `/api/challenges/${seeded.challengeId}/start`, { token: p.token });
    const sub = await ctx.api("POST", `/api/attempts/${start.body.data.id}/submit`, { token: p.token, body: { selectedAnswers: ["B"], structuredAnswers: { q2: "second verifier" } } });
    await waitForResult(ctx, p.token, sub.body.data.submissionId);
    const admin = await ctx.user("consoleadmin", "platform_admin");
    const get = (path: string) => ctx.api("GET", path, { token: admin.token });

    const dash = (await get("/api/admin/dashboard")).body.data;
    for (const k of ["totalUsers", "totalOrganizations", "totalChallenges", "activeChallenges", "pendingReviews", "verifiedSubmissions",
      "totalMstDistributed", "newUsersThisWeek", "newOrgsThisWeek", "newChallengesThisWeek", "submissionsThisWeek", "verifiedThisWeek"]) {
      assert.equal(typeof dash[k], "number", k);
    }
    assert.ok(dash.verifiedThisWeek >= 1);

    const users = (await get("/api/admin/users?limit=100")).body.data.data;
    const row = users.find((x: any) => x.username === "adminview");
    assert.equal(row.challengesSolved, 1);
    assert.equal(typeof row.organizationCount, "number");

    const orgs = (await get("/api/admin/organizations?limit=100")).body.data.data.find((o: any) => o.id === seeded.orgId);
    for (const k of ["repositoryCount", "challengeCount", "participantCount", "mstPaid"]) assert.equal(typeof orgs[k], "number", k);
    assert.equal(orgs.participantCount, 1);

    const ch = (await get("/api/admin/challenges?limit=100")).body.data.data.find((c: any) => c.id === seeded.challengeId);
    assert.equal(ch.submissionCount, 1);
    assert.equal(ch.solvedCount, 1);

    const sb = (await get("/api/admin/submissions?limit=100")).body.data.data.find((s: any) => s.challengeId === seeded.challengeId);
    assert.equal(sb.displayStatus, "Verified");
    assert.equal(sb.difficulty, "Medium");
    assert.ok(sb.organization);

    const an = (await get("/api/admin/analytics")).body.data;
    assert.ok(an.challengesByDifficulty.Medium >= 1);
    assert.ok(an.submissionsByStatus.Verified >= 1);
    assert.ok(an.verificationSuccessRate > 0);
    assert.ok(an.totalPointsAwarded >= 250);
    assert.ok(an.activeParticipantsLast30Days >= 1);

    const gh = (await get("/api/admin/github")).body.data;
    assert.ok(Array.isArray(gh.installations));
  });
});
