import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { achievements, reputationEvents, users } from "../db/schema.js";
import { levelInfo, nextStreak } from "../services/gamification.rules.js";
import { seedOrgWithChallenge, startTestApp, waitForResult, type TestContext } from "./harness.js";

let ctx: TestContext;
before(async () => { ctx = await startTestApp(); });
after(async () => { await ctx.close(); });

const correct = { selectedAnswers: ["B"], structuredAnswers: { q2: "second verifier" } };

async function solve(ctxUser: { token: string }, challengeId: string, body: object = correct) {
  const start = await ctx.api("POST", `/api/challenges/${challengeId}/start`, { token: ctxUser.token });
  assert.ok([200, 201].includes(start.status), JSON.stringify(start.body));
  const sub = await ctx.api("POST", `/api/attempts/${start.body.data.id}/submit`, { token: ctxUser.token, body });
  assert.equal(sub.status, 202, JSON.stringify(sub.body));
  return (await waitForResult(ctx, ctxUser.token, sub.body.data.submissionId)).body.data;
}

describe("gamification rules", () => {
  test("levels derive from points", () => {
    assert.equal(levelInfo(0).level, 1);
    assert.equal(levelInfo(250).level, 2);
    assert.equal(levelInfo(6000).title, "Legend");
    assert.equal(levelInfo(249).pointsToNextLevel, 1);
  });
  test("streak rules (UTC days)", () => {
    const d = (s: string) => new Date(s);
    assert.deepEqual(nextStreak({ current: 0, longest: 0, lastActivityAt: null }, d("2026-09-01T10:00:00Z")), { current: 1, longest: 1, changed: true });
    assert.equal(nextStreak({ current: 3, longest: 3, lastActivityAt: d("2026-09-01T23:59:00Z") }, d("2026-09-02T00:01:00Z")).current, 4);
    assert.equal(nextStreak({ current: 3, longest: 3, lastActivityAt: d("2026-09-02T01:00:00Z") }, d("2026-09-02T20:00:00Z")).changed, false);
    assert.deepEqual(nextStreak({ current: 4, longest: 4, lastActivityAt: d("2026-09-01T10:00:00Z") }, d("2026-09-05T10:00:00Z")), { current: 1, longest: 4, changed: true });
  });
});

describe("verified submission awards", () => {
  test("points and reputation are awarded exactly once, even under duplicate/concurrent processing", async () => {
    const { challengeId } = await seedOrgWithChallenge(ctx);
    const u = await ctx.user("once");
    const result = await solve(u, challengeId);
    assert.equal(result.status, "Verified");
    const id = result.submissionId;
    // Duplicate jobs, retries and a late reviewer decision must not award again.
    const again = await Promise.all([
      ctx.services.verification.process(id),
      ctx.services.verification.finalize(id, { status: "passed", reason: "retry" }),
      ctx.services.verification.finalize(id, { status: "passed", reason: "retry" }),
    ]);
    assert.deepEqual(again.slice(1), [{ changed: false }, { changed: false }]);
    const [row] = await ctx.db.select().from(users).where(eq(users.id, u.id));
    assert.equal(row!.points, 250);
    assert.equal(row!.reputation, 20);
    assert.equal(row!.level, 2, "250 points reaches level 2");
    const events = await ctx.db.select().from(reputationEvents).where(and(eq(reputationEvents.userId, u.id), eq(reputationEvents.eventType, "challenge_verified")));
    assert.equal(events.length, 1);
    const restart = await ctx.api("POST", `/api/challenges/${challengeId}/start`, { token: u.token });
    assert.equal(restart.status, 409);
    assert.equal(restart.body.error.code, "CHALLENGE_ALREADY_SOLVED");
  });

  test("concurrent reviewer decisions on a manual challenge award once", async () => {
    const seeded = await seedOrgWithChallenge(ctx, {
      verificationType: "admin_review", challengeType: "security_report", challengeConfig: {}, title: "Report the RPC poisoning",
    });
    const u = await ctx.user("reported");
    const start = await ctx.api("POST", `/api/challenges/${seeded.challengeId}/start`, { token: u.token });
    const sub = await ctx.api("POST", `/api/attempts/${start.body.data.id}/submit`, {
      token: u.token, body: { vulnerability: "Poisoned RPC", impact: "Forged release", recommendedFix: "Second verifier" },
    });
    assert.equal((await ctx.api("GET", `/api/submissions/${sub.body.data.submissionId}/result`, { token: u.token })).body.data.status, "Pending");
    const path = `/api/org/submissions/${sub.body.data.submissionId}/review`;
    const hdr = { "X-Organization-Id": seeded.orgId };
    const decisions = await Promise.all([1, 2, 3].map(() =>
      ctx.api("POST", path, { token: seeded.owner.token, headers: hdr, body: { decision: "approve", reason: "Valid report" } })));
    assert.equal(decisions.filter((d) => d.status === 200).length, 1);
    assert.ok(decisions.filter((d) => d.status === 409).every((d) => d.body.error.code === "SUBMISSION_ALREADY_REVIEWED"));
    const [row] = await ctx.db.select().from(users).where(eq(users.id, u.id));
    assert.equal(row!.points, 250);
  });

  test("streaks, activity days, stats and history update from verified solves", async () => {
    const u = await ctx.user("streaker");
    const day = (d: string) => { ctx.clock.now = new Date(`${d}T12:00:00.000Z`); };
    day("2026-09-01");
    await solve(u, (await seedOrgWithChallenge(ctx)).challengeId);
    day("2026-09-02");
    await solve(u, (await seedOrgWithChallenge(ctx)).challengeId);
    let me = await ctx.api("GET", "/api/users/me", { token: u.token });
    assert.equal(me.body.data.currentStreak, 2);
    day("2026-09-06");
    const r = await solve(u, (await seedOrgWithChallenge(ctx)).challengeId);
    assert.equal(r.streakUpdated, true);
    me = await ctx.api("GET", "/api/users/me", { token: u.token });
    assert.equal(me.body.data.currentStreak, 1);
    assert.equal(me.body.data.longestStreak, 2);
    assert.equal(me.body.data.points, 750);
    assert.equal(me.body.data.challengesSolved, 3);
    const stats = await ctx.api("GET", "/api/users/me/stats", { token: u.token });
    assert.deepEqual(stats.body.data.streak.activityDays, ["2026-09-01", "2026-09-02", "2026-09-06"]);
    assert.equal(stats.body.data.solvedByDifficulty.Medium, 3);
    assert.equal(stats.body.data.totalPoints, 750);
    const infra = stats.body.data.securityStats.find((x: any) => x.category === "Cloud / Infrastructure");
    assert.equal(infra.solved, 3, "securityStats counts this participant's verified solves per category");
    assert.ok(infra.score > 0 && infra.score <= 100);
    day("2026-09-09");
    me = await ctx.api("GET", "/api/users/me", { token: u.token });
    assert.equal(me.body.data.currentStreak, 0, "a lapsed streak displays as 0");
    const history = await ctx.api("GET", "/api/users/me/history", { token: u.token });
    assert.equal(history.body.data.length, 3);
    assert.equal(history.body.data[0].status, "Verified");
    assert.equal(history.body.data[0].submissions[0].verificationStatus, "passed");
    ctx.clock.now = new Date("2026-09-01T12:00:00.000Z");
  });

  test("achievements are earned once when criteria are met", async () => {
    const [a] = await ctx.db.insert(achievements).values({ name: "First Blood", description: "Solve one challenge", pointsReward: 10, criteria: { type: "challenges_solved", count: 1 } }).returning();
    const u = await ctx.user("achiever");
    await solve(u, (await seedOrgWithChallenge(ctx)).challengeId);
    await solve(u, (await seedOrgWithChallenge(ctx)).challengeId);
    const events = await ctx.db.select().from(reputationEvents).where(and(eq(reputationEvents.userId, u.id), eq(reputationEvents.eventType, "achievement_earned")));
    assert.equal(events.length, 1);
    assert.equal((events[0]!.metadata as { achievementId: string }).achievementId, a!.id);
    const [row] = await ctx.db.select().from(users).where(eq(users.id, u.id));
    assert.equal(row!.points, 510);
  });
});

describe("leaderboard", () => {
  test("global/weekly/monthly rankings come from the database", async () => {
    const r = await ctx.api("GET", "/api/leaderboard?period=global");
    assert.equal(r.status, 200);
    const entries = r.body.data;
    assert.ok(entries.length >= 3);
    for (let i = 1; i < entries.length; i++) assert.ok(entries[i - 1].points >= entries[i].points);
    assert.equal(entries[0].rank, 1);
    assert.equal(entries[0].username, "streaker");
    assert.ok(Number(r.headers.get("x-total-count")) >= 3);
    const weekly = await ctx.api("GET", "/api/leaderboard?period=weekly");
    assert.equal(weekly.status, 200);
    assert.ok(Array.isArray(weekly.body.data));
    assert.equal((await ctx.api("GET", "/api/leaderboard?period=yearly")).status, 400);
  });

  test("organization leaderboard requires membership", async () => {
    const seeded = await seedOrgWithChallenge(ctx);
    const u = await ctx.user("orgboard");
    await solve(u, seeded.challengeId);
    const path = `/api/leaderboard?period=organization&organizationId=${seeded.orgId}`;
    assert.equal((await ctx.api("GET", path)).status, 400);
    assert.equal((await ctx.api("GET", path, { token: u.token })).status, 404);
    const own = await ctx.api("GET", path, { token: seeded.owner.token });
    assert.equal(own.status, 200);
    assert.equal(own.body.data[0].username, "orgboard");
    assert.equal(own.body.data[0].points, 250);
  });
});
