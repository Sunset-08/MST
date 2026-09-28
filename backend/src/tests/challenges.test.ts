import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { seedOrgWithChallenge, startTestApp, waitForResult, type TestContext } from "./harness.js";

let ctx: TestContext;
let seeded: Awaited<ReturnType<typeof seedOrgWithChallenge>>;
before(async () => {
  ctx = await startTestApp();
  seeded = await seedOrgWithChallenge(ctx);
  // A second, easy code challenge with admin review and an explicit maxAttempts.
  await ctx.api("POST", "/api/org/challenges", {
    token: seeded.owner.token, headers: { "X-Organization-Id": seeded.orgId },
    body: {
      title: "Patch the signer allowlist", description: "Fix the missing signer allowlist check in the treasury service.",
      category: "Backend Security", difficulty: "easy", challengeType: "Fix", verificationType: "admin_review",
      mstReward: 0, maxAttempts: 2, status: "published",
    },
  });
  await ctx.api("POST", "/api/org/challenges", {
    token: seeded.owner.token, headers: { "X-Organization-Id": seeded.orgId },
    body: { title: "Draft only", description: "Unpublished draft challenge text.", category: "Privacy", difficulty: "hard",
      challengeType: "security_report", verificationType: "admin_review", mstReward: 0 },
  });
});
after(async () => { await ctx.close(); });

describe("challenges", () => {
  test("list returns only published DB challenges with frontend labels and pagination", async () => {
    const r = await ctx.api("GET", "/api/challenges");
    assert.equal(r.status, 200);
    assert.equal(r.body.data.total, 2);
    assert.equal(r.body.data.hasMore, false);
    const c = r.body.data.data.find((x: any) => x.id === seeded.challengeId);
    assert.equal(c.difficulty, "Medium");
    assert.equal(c.type, "Investigation");
    assert.equal(c.pointsReward, 250, "default points come from backend difficulty rules");
    assert.equal(c.shortDescription, "Quarantine the poisoned RPC path");
    assert.equal(c.status, undefined, "anonymous callers get no participant status");
    const page = await ctx.api("GET", "/api/challenges?limit=1&page=2");
    assert.equal(page.body.data.data.length, 1);
    assert.equal(page.body.data.page, 2);
    assert.equal((await ctx.api("GET", "/api/challenges?limit=1000")).status, 400);
  });

  test("filters: search (literal), difficulty, category, status", async () => {
    assert.equal((await ctx.api("GET", "/api/challenges?search=poisoned")).body.data.total, 1);
    assert.equal((await ctx.api("GET", "/api/challenges?search=%25")).body.data.total, 0, "LIKE wildcards are escaped");
    assert.equal((await ctx.api("GET", "/api/challenges?difficulty=Easy")).body.data.total, 1);
    assert.equal((await ctx.api("GET", "/api/challenges?category=backend%20security")).body.data.total, 1);
    assert.equal((await ctx.api("GET", "/api/challenges?difficulty=Impossible")).status, 400);
    const u = await ctx.user("filter_user");
    assert.equal((await ctx.api("GET", "/api/challenges?status=Not%20Started", { token: u.token })).body.data.total, 2);
    assert.equal((await ctx.api("GET", "/api/challenges?status=Verified", { token: u.token })).body.data.total, 0);
  });

  test("details hide answer keys and include counts", async () => {
    const r = await ctx.api("GET", `/api/challenges/${seeded.challengeId}`);
    assert.equal(r.status, 200);
    const text = JSON.stringify(r.body);
    assert.equal(text.includes("correctAnswer"), false);
    assert.equal(text.includes("acceptedAnswers"), false);
    assert.equal(text.includes("second verifier"), false);
    assert.equal(r.body.data.questions.length, 2);
    assert.equal(r.body.data.attempts, 0);
    assert.equal(r.body.data.solved, 0);
  });

  test("start challenge creates an attempt, is idempotent while active, and enforces maxAttempts", async () => {
    const list = await ctx.api("GET", "/api/challenges?difficulty=Easy");
    const fixId = list.body.data.data[0].id;
    const u = await ctx.user("starter");
    const first = await ctx.api("POST", `/api/challenges/${fixId}/start`, { token: u.token });
    assert.equal(first.status, 201);
    assert.equal(first.body.data.status, "Attempted");
    assert.equal(first.body.data.attemptNumber, 1);
    const again = await ctx.api("POST", `/api/challenges/${fixId}/start`, { token: u.token });
    assert.equal(again.status, 200);
    assert.equal(again.body.data.id, first.body.data.id);

    // Submit, get rejected by the reviewer, retry, get rejected, then the limit applies.
    for (let i = 0; i < 2; i++) {
      const start = i === 0 ? first : await ctx.api("POST", `/api/challenges/${fixId}/start`, { token: u.token });
      assert.ok([200, 201].includes(start.status), JSON.stringify(start.body));
      const sub = await ctx.api("POST", `/api/attempts/${start.body.data.id}/submit`, { token: u.token, body: { patch: `diff --git a/x b/x ${i}` } });
      assert.equal(sub.status, 202);
      const pending = await ctx.api("POST", `/api/challenges/${fixId}/start`, { token: u.token });
      assert.equal(pending.status, 409);
      assert.equal(pending.body.error.code, "SUBMISSION_PENDING");
      const review = await ctx.api("POST", `/api/org/submissions/${sub.body.data.submissionId}/review`, {
        token: seeded.owner.token, headers: { "X-Organization-Id": seeded.orgId }, body: { decision: "reject", reason: "Patch does not fix the issue" },
      });
      assert.equal(review.status, 200, JSON.stringify(review.body));
      assert.equal(review.body.data.status, "Failed");
    }
    const blocked = await ctx.api("POST", `/api/challenges/${fixId}/start`, { token: u.token });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, "MAX_ATTEMPTS_REACHED");
  });

  test("draft and unknown challenges are not startable; org members cannot attempt their own challenges", async () => {
    const u = await ctx.user("draft_user");
    assert.equal((await ctx.api("POST", "/api/challenges/00000000-0000-4000-8000-000000000000/start", { token: u.token })).status, 404);
    const own = await ctx.api("POST", `/api/challenges/${seeded.challengeId}/start`, { token: seeded.owner.token });
    assert.equal(own.status, 403);
    assert.equal(own.body.error.code, "ORG_MEMBER_CANNOT_ATTEMPT");
    assert.equal((await ctx.api("POST", `/api/challenges/${seeded.challengeId}/start`)).status, 401);
  });
});

describe("submissions", () => {
  test("valid submission is Pending, then verified by the rule engine; result endpoint reports it", async () => {
    const u = await ctx.user("solver");
    const start = await ctx.api("POST", `/api/challenges/${seeded.challengeId}/start`, { token: u.token });
    const sub = await ctx.api("POST", `/api/attempts/${start.body.data.id}/submit`, {
      token: u.token, body: { challengeId: seeded.challengeId, type: "Investigation", selectedAnswers: ["B"], structuredAnswers: { q2: "Require a second verifier" } },
    });
    assert.equal(sub.status, 202);
    assert.equal(sub.body.data.status, "Pending");
    assert.equal(sub.body.data.pointsAwarded, 0);
    const result = await waitForResult(ctx, u.token, sub.body.data.submissionId);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.status, "Verified");
    assert.equal(result.body.data.verificationStatus, "passed");
    assert.equal(result.body.data.pointsAwarded, 250);
    assert.equal(result.body.data.reputationAwarded, 20);
    assert.equal(result.body.data.attemptId, start.body.data.id);
    const listed = await ctx.api("GET", `/api/challenges/${seeded.challengeId}`, { token: u.token });
    assert.equal(listed.body.data.status, "Verified");
    assert.equal(listed.body.data.solved, 1);
  });

  test("wrong answers fail with a reason and award nothing", async () => {
    const u = await ctx.user("guesser");
    const start = await ctx.api("POST", `/api/challenges/${seeded.challengeId}/start`, { token: u.token });
    const sub = await ctx.api("POST", `/api/attempts/${start.body.data.id}/submit`, { token: u.token, body: { selectedAnswers: ["A"], structuredAnswers: { q2: "nothing" } } });
    const result = await waitForResult(ctx, u.token, sub.body.data.submissionId);
    assert.equal(result.body.data.status, "Failed");
    assert.equal(result.body.data.pointsAwarded, 0);
    assert.match(result.body.data.reason, /0 of 2 answers correct/);
    assert.equal(result.body.data.reason.includes("B"), false, "reason does not reveal the answer key");
  });

  test("duplicate submission on the same attempt and payload/type mismatches are rejected", async () => {
    const u = await ctx.user("dup");
    const start = await ctx.api("POST", `/api/challenges/${seeded.challengeId}/start`, { token: u.token });
    const path = `/api/attempts/${start.body.data.id}/submit`;
    const wrongType = await ctx.api("POST", path, { token: u.token, body: { type: "Code", selectedAnswers: ["B"] } });
    assert.equal(wrongType.status, 400);
    assert.equal(wrongType.body.error.code, "SUBMISSION_TYPE_MISMATCH");
    const wrongFields = await ctx.api("POST", path, { token: u.token, body: { patch: "diff" } });
    assert.equal(wrongFields.status, 400);
    assert.equal(wrongFields.body.error.code, "SUBMISSION_FIELDS_INVALID");
    const unknownField = await ctx.api("POST", path, { token: u.token, body: { selectedAnswers: ["B"], points: 99999 } });
    assert.equal(unknownField.status, 400);
    assert.equal((await ctx.api("POST", path, { token: u.token, body: { selectedAnswers: ["B"] } })).status, 202);
    const dup = await ctx.api("POST", path, { token: u.token, body: { selectedAnswers: ["B"] } });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, "DUPLICATE_SUBMISSION");
  });

  test("automated_test challenges stay Pending with a configuration reason (no fake success)", async () => {
    const ch = await ctx.api("POST", "/api/org/challenges", {
      token: seeded.owner.token, headers: { "X-Organization-Id": seeded.orgId },
      body: { title: "Run the exploit tests", description: "Provide a patch that passes the hidden exploit test suite.", category: "DevSecOps",
        difficulty: "hard", challengeType: "code", verificationType: "automated_test", mstReward: 0, status: "published" },
    });
    const u = await ctx.user("tester");
    const start = await ctx.api("POST", `/api/challenges/${ch.body.data.id}/start`, { token: u.token });
    const sub = await ctx.api("POST", `/api/attempts/${start.body.data.id}/submit`, { token: u.token, body: { patch: "diff --git" } });
    const r = await ctx.api("GET", `/api/submissions/${sub.body.data.submissionId}/result`, { token: u.token });
    assert.equal(r.body.data.status, "Pending");
    assert.match(r.body.data.reason, /not configured/);
  });

  test("organization admins can read results for their challenges; other orgs cannot", async () => {
    const u = await ctx.user("visible");
    const start = await ctx.api("POST", `/api/challenges/${seeded.challengeId}/start`, { token: u.token });
    const sub = await ctx.api("POST", `/api/attempts/${start.body.data.id}/submit`, { token: u.token, body: { selectedAnswers: ["B"], structuredAnswers: { q2: "second verifier" } } });
    const id = sub.body.data.submissionId;
    assert.equal((await ctx.api("GET", `/api/submissions/${id}/result`, { token: seeded.owner.token })).status, 200);
    const other = await seedOrgWithChallenge(ctx);
    assert.equal((await ctx.api("GET", `/api/submissions/${id}/result`, { token: other.owner.token })).status, 404);
  });
});
