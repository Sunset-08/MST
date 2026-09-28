import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { isGithubAppConfigured, loadConfig } from "../config/env.js";
import { githubEvents, githubIssues, repositories } from "../db/schema.js";
import { OctokitGitHubAppClient } from "../integrations/github/app-client.js";
import { verifyGitHubSignature } from "../integrations/github/webhooks.js";
import { seedOrgWithChallenge, startTestApp, type TestContext } from "./harness.js";

let ctx: TestContext;
before(async () => { ctx = await startTestApp(); });
after(async () => { await ctx.close(); });

const installation = (id: string, createdAt: string) => ({
  id, account: { id: "9001", login: "acme-sec", type: "Organization", name: "Acme Security", htmlUrl: "https://github.com/acme-sec" },
  repositorySelection: "selected", permissions: { issues: "read", metadata: "read" }, createdAt, suspendedAt: null,
});
const repo = { id: "555", name: "vault", fullName: "acme-sec/vault", owner: "acme-sec", url: "https://github.com/acme-sec/vault", defaultBranch: "main", archived: false, private: true };
const issue = (n: number, title: string, state = "open") => ({
  id: String(7000 + n), number: n, title, body: "details", author: "reporter", url: `https://github.com/acme-sec/vault/issues/${n}`,
  state, labels: ["security"], createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-02T00:00:00Z",
});

describe("GitHub App configuration", () => {
  test("configuration is validated without inventing credentials", async () => {
    assert.equal(isGithubAppConfigured(loadConfig({ GITHUB_APP_ID: "5112750" })), false);
    assert.equal(isGithubAppConfigured(loadConfig({ GITHUB_APP_ID: "5112750", GITHUB_APP_PRIVATE_KEY_PATH: "/does/not/exist.pem" })), false);
    const missing = new OctokitGitHubAppClient({ ...loadConfig({}).github, appId: "5112750", privateKeyPath: "/does/not/exist.pem" });
    await assert.rejects(missing.getApp(), (e: any) => e.status === 503 && e.code === "GITHUB_NOT_CONFIGURED");
    const dir = mkdtempSync(join(tmpdir(), "securex-"));
    writeFileSync(join(dir, "bad.pem"), "not a key");
    const bad = new OctokitGitHubAppClient({ ...loadConfig({}).github, appId: "5112750", privateKeyPath: join(dir, "bad.pem") });
    await assert.rejects(bad.getApp(), (e: any) => e.code === "GITHUB_NOT_CONFIGURED" && !String(e.message).includes("not a key"));
  });
});

describe("GitHub organization flow", () => {
  let seeded: Awaited<ReturnType<typeof seedOrgWithChallenge>>;
  const hdr = () => ({ "X-Organization-Id": seeded.orgId });

  test("install URL carries signed state; linking requires that state and a fresh installation", async () => {
    seeded = await seedOrgWithChallenge(ctx);
    const url = await ctx.api("GET", "/api/org/github/install-url", { token: seeded.owner.token, headers: hdr() });
    assert.equal(url.status, 200);
    assert.match(url.body.data.installUrl, /^https:\/\/github\.com\/apps\/securexmst\/installations\/new\?state=/);
    const state = url.body.data.state;

    ctx.github.installations.set("111", installation("111", "2026-01-01T00:00:00Z"));
    const noState = await ctx.api("POST", "/api/org/github/installations", { token: seeded.owner.token, headers: hdr(), body: { installationId: "111" } });
    assert.equal(noState.status, 403);
    const oldInstall = await ctx.api("POST", "/api/org/github/installations", { token: seeded.owner.token, headers: hdr(), body: { installationId: "111", state } });
    assert.equal(oldInstall.body.error.code, "GITHUB_INSTALLATION_NOT_FROM_FLOW");

    ctx.github.installations.set("222", installation("222", ctx.clock.now.toISOString()));
    const linked = await ctx.api("POST", "/api/org/github/installations", { token: seeded.owner.token, headers: hdr(), body: { installationId: "222", state } });
    assert.equal(linked.status, 201, JSON.stringify(linked.body));
    assert.equal(linked.body.data.login, "acme-sec");
    assert.deepEqual(linked.body.data.permissions, { issues: "read", metadata: "read" });

    const other = await seedOrgWithChallenge(ctx);
    const admin = await ctx.user("ghadmin", "platform_admin");
    const [otherMember] = [other.owner];
    await ctx.api("POST", `/api/organizations/${other.orgId}/members`, { token: otherMember.token, body: { userId: admin.id, role: "admin" } });
    const steal = await ctx.api("POST", "/api/org/github/installations", {
      token: admin.token, headers: { "X-Organization-Id": other.orgId }, body: { installationId: "222" },
    });
    assert.equal(steal.status, 409);
    assert.equal(steal.body.error.code, "GITHUB_INSTALLATION_LINKED");
  });

  test("repository and issue sync upserts without duplicates and skips pull requests", async () => {
    ctx.github.repos.set("222", [repo]);
    ctx.github.issues.set("acme-sec/vault", [issue(1, "Signer key exposed"), issue(2, "RPC not verified", "closed")]);
    const first = await ctx.api("POST", "/api/org/github/sync", { token: seeded.owner.token, headers: hdr(), body: {} });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.repositoriesSynced, 1);
    assert.equal(first.body.data.issuesSynced, 2, JSON.stringify({ body: first.body, calls: ctx.github.calls }));
    ctx.github.issues.set("acme-sec/vault", [issue(1, "Signer key exposed (updated)")]);
    await ctx.api("POST", "/api/org/github/sync", { token: seeded.owner.token, headers: hdr(), body: {} });
    assert.equal((await ctx.db.select().from(repositories)).length, 1);
    const issues = await ctx.db.select().from(githubIssues);
    assert.equal(issues.length, 2);
    assert.equal(issues.find((i) => i.issueNumber === 1)!.title, "Signer key exposed (updated)");
    const listed = await ctx.api("GET", "/api/org/github/issues?state=all", { token: seeded.owner.token, headers: hdr() });
    assert.equal(listed.body.data.total, 2);
    const overview = await ctx.api("GET", "/api/org/github", { token: seeded.owner.token, headers: hdr() });
    assert.equal(overview.body.data.repositories[0].issueCount, 2, JSON.stringify(overview.body));
  });

  test("issues are not auto-converted; an org can link one of its own issues to a challenge, others cannot", async () => {
    assert.equal((await ctx.api("GET", "/api/challenges?search=Signer%20key")).body.data.total, 0);
    const [i1] = await ctx.db.select().from(githubIssues).where(eq(githubIssues.issueNumber, 1));
    const body = { title: "Rotate the exposed signer", description: "Investigate the exposed signer key described in the linked issue.",
      category: "Authentication", difficulty: "hard", challengeType: "security_report", verificationType: "admin_review", mstReward: 3,
      status: "published", githubIssueId: i1!.id };
    const created = await ctx.api("POST", "/api/org/challenges", { token: seeded.owner.token, headers: hdr(), body });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const pub = await ctx.api("GET", `/api/challenges/${created.body.data.id}`);
    assert.equal(pub.body.data.githubRepo, "acme-sec/vault");
    assert.equal(pub.body.data.githubIssueNumber, 1);
    const other = await seedOrgWithChallenge(ctx);
    const foreign = await ctx.api("POST", "/api/org/challenges", { token: other.owner.token, headers: { "X-Organization-Id": other.orgId }, body });
    assert.equal(foreign.status, 400);
    assert.equal(foreign.body.error.code, "INVALID_GITHUB_ISSUE");
  });

  test("scoring fields lock once submissions exist", async () => {
    const u = await ctx.user("locker");
    const start = await ctx.api("POST", `/api/challenges/${seeded.challengeId}/start`, { token: u.token });
    await ctx.api("POST", `/api/attempts/${start.body.data.id}/submit`, { token: u.token, body: { selectedAnswers: ["A"] } });
    const change = await ctx.api("PUT", `/api/org/challenges/${seeded.challengeId}`, { token: seeded.owner.token, headers: hdr(), body: { pointsReward: 9999 } });
    assert.equal(change.status, 409);
    assert.equal(change.body.error.code, "CHALLENGE_LOCKED");
    const title = await ctx.api("PUT", `/api/org/challenges/${seeded.challengeId}`, { token: seeded.owner.token, headers: hdr(), body: { title: "The Poisoned Node v2" } });
    assert.equal(title.status, 200);
    // Regression: correlated counts must be computed per challenge (single-table select).
    const list = await ctx.api("GET", "/api/org/challenges", { token: seeded.owner.token, headers: hdr() });
    const row = list.body.data.data.find((c: any) => c.id === seeded.challengeId);
    assert.equal(row.submissions, 1);
    assert.equal(row.attempts, 1);
    const admin = await ctx.user("countadmin", "platform_admin");
    const orgs = await ctx.api("GET", "/api/admin/organizations?limit=100", { token: admin.token });
    const mine = orgs.body.data.data.find((o: any) => o.id === seeded.orgId);
    assert.equal(mine.members, 1);
    assert.ok(mine.challenges >= 2);
  });
});

describe("GitHub webhooks", () => {
  const secret = "whsec-test";
  const send = (body: object, opts: { sig?: string; delivery?: string; event?: string } = {}) => {
    const raw = JSON.stringify(body);
    const sig = opts.sig ?? `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    return ctx.api("POST", "/api/webhooks/github", {
      raw, headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig, "X-GitHub-Delivery": opts.delivery ?? "d-1", "X-GitHub-Event": opts.event ?? "issues" },
    });
  };

  test("signature verification rejects forged or missing signatures", async () => {
    assert.equal(verifyGitHubSignature(secret, Buffer.from("{}"), "sha256=" + "0".repeat(64)), false);
    assert.equal(verifyGitHubSignature(secret, Buffer.from("{}"), undefined), false);
    const forged = await send({ action: "opened" }, { sig: "sha256=" + "a".repeat(64) });
    assert.equal(forged.status, 401);
    assert.equal(forged.body.error.code, "INVALID_SIGNATURE");
    assert.equal((await ctx.db.select().from(githubEvents)).length, 0, "unverified payloads are not persisted");
  });

  test("valid events are persisted, processed once, and redeliveries are idempotent", async () => {
    const payload = {
      action: "opened", installation: { id: 222 },
      repository: { id: 555, name: "vault", full_name: "acme-sec/vault", html_url: "https://github.com/acme-sec/vault", default_branch: "main", owner: { login: "acme-sec" } },
      issue: { id: 7003, number: 3, title: "Webhook-created issue", body: "b", html_url: "https://github.com/acme-sec/vault/issues/3", state: "open",
        labels: [{ name: "security" }], user: { login: "reporter" }, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" },
    };
    const first = await send(payload, { delivery: "delivery-abc" });
    assert.equal(first.status, 202, JSON.stringify(first.body));
    assert.equal(first.body.data.processed, true);
    assert.equal(first.body.data.linked, true);
    const again = await send(payload, { delivery: "delivery-abc" });
    assert.equal(again.body.data.duplicate, true);
    assert.equal((await ctx.db.select().from(githubEvents)).length, 1);
    const created = await ctx.db.select().from(githubIssues).where(eq(githubIssues.githubIssueId, "7003"));
    assert.equal(created.length, 1);
    assert.equal(created[0]!.title, "Webhook-created issue");
  });

  test("webhook endpoint reports configuration state when no secret is configured", async () => {
    const bare = await startTestApp({ github: { ...ctx.config.github, webhookSecret: undefined } });
    try {
      const r = await bare.api("POST", "/api/webhooks/github", { raw: "{}", headers: { "Content-Type": "application/json" } });
      assert.equal(r.status, 503);
      assert.equal(r.body.error.code, "GITHUB_WEBHOOK_NOT_CONFIGURED");
    } finally {
      await bare.close();
    }
  });
});

describe("admin", () => {
  test("dashboard aggregates DB data; lists paginate and cap page size", async () => {
    const admin = await ctx.user("dashadmin", "platform_admin");
    const d = await ctx.api("GET", "/api/admin/dashboard", { token: admin.token });
    assert.equal(d.status, 200);
    for (const k of ["totalUsers", "organizations", "challenges", "pendingReviews", "verifiedSubmissions", "totalMstDistributed", "submissionRate"]) {
      assert.equal(typeof d.body.data[k], "number", k);
    }
    assert.equal(d.body.data.recentActivity.length, 7);
    const users = await ctx.api("GET", "/api/admin/users?limit=2", { token: admin.token });
    assert.equal(users.body.data.data.length, 2);
    assert.ok(users.body.data.total > 2);
    assert.equal((await ctx.api("GET", "/api/admin/users?limit=5000", { token: admin.token })).status, 400);
    const subs = await ctx.api("GET", "/api/admin/submissions?status=pending", { token: admin.token });
    assert.ok(subs.body.data.data.every((s: any) => s.status === "Pending"));
  });

  test("settings report configuration state and never secrets", async () => {
    const admin = await ctx.user("setadmin", "platform_admin");
    const s = await ctx.api("GET", "/api/admin/settings", { token: admin.token });
    assert.equal(s.status, 200);
    const text = JSON.stringify(s.body);
    for (const secret of [ctx.config.signingSecret!, ctx.config.github.webhookSecret!, "DATABASE_URL", "SUPABASE_ANON_KEY", "PRIVATE KEY"]) {
      assert.equal(text.includes(secret), false, `settings leaked ${secret}`);
    }
    assert.equal(s.body.data.blockchain.rewardContractConfigured, false);
    assert.equal(s.body.data.github.webhookSecretConfigured, true);
    assert.equal(s.body.data.verification.providers.automated_test.mode, "not_configured");
  });

  test("platform admin can review submissions but not their own", async () => {
    const seeded = await seedOrgWithChallenge(ctx, { verificationType: "admin_review", challengeType: "security_report", challengeConfig: {} });
    const admin = await ctx.user("reviewadmin", "platform_admin");
    const start = await ctx.api("POST", `/api/challenges/${seeded.challengeId}/start`, { token: admin.token });
    const sub = await ctx.api("POST", `/api/attempts/${start.body.data.id}/submit`, {
      token: admin.token, body: { vulnerability: "v", impact: "i", recommendedFix: "f" },
    });
    const self = await ctx.api("POST", `/api/admin/submissions/${sub.body.data.submissionId}/review`, { token: admin.token, body: { decision: "approve", reason: "self" } });
    assert.equal(self.status, 403);
    assert.equal(self.body.error.code, "SELF_REVIEW_FORBIDDEN");
  });
});
