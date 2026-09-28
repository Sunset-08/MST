import { and, count, countDistinct, desc, eq, gt, gte, ne, sql } from "drizzle-orm";
import { ref } from "../utils/sql.js";
import { challengeAttempts, challenges, organizationMembers, organizations, reputationEvents, rewards, submissions, users, verifications, wallets } from "../db/schema.js";
import { iso } from "../utils/dates.js";
import { notFound } from "../utils/http.js";
import { CHALLENGE_TYPE_LABEL, DIFFICULTY_LABEL, REWARD_STATUS_LABEL } from "../utils/labels.js";
import { displayedStreak, levelInfo } from "./gamification.rules.js";
import { VERIFIED_EVENT } from "./gamification.service.js";
import type { ServiceDeps } from "./deps.js";

type User = typeof users.$inferSelect;

export class UsersService {
  constructor(private readonly deps: ServiceDeps) {}

  async globalRank(user: Pick<User, "points">): Promise<number> {
    const [row] = await this.deps.db.select({ n: count() }).from(users)
      .where(and(eq(users.role, "participant"), gt(users.points, user.points)));
    return Number(row?.n ?? 0) + 1;
  }

  async solvedCount(userId: string): Promise<number> {
    const [row] = await this.deps.db.select({ n: countDistinct(submissions.challengeId) }).from(submissions)
      .where(and(eq(submissions.userId, userId), eq(submissions.status, "verified")));
    return Number(row?.n ?? 0);
  }

  async me(user: User) {
    const walletRows = await this.deps.db.select().from(wallets)
      .where(and(eq(wallets.userId, user.id), eq(wallets.isVerified, true)))
      .orderBy(desc(wallets.isPrimary), wallets.verifiedAt);
    const primary = walletRows[0];
    const level = levelInfo(user.points);
    const memberships = await this.deps.db.select({
      organizationId: organizations.id, name: organizations.name, slug: organizations.slug, role: organizationMembers.role,
    }).from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(and(eq(organizationMembers.userId, user.id), ne(organizations.status, "deleted")));
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      role: user.role,
      points: user.points,
      reputation: user.reputation,
      level: level.level,
      levelTitle: level.title,
      pointsToNextLevel: level.pointsToNextLevel,
      globalRank: await this.globalRank(user),
      challengesSolved: await this.solvedCount(user.id),
      currentStreak: displayedStreak(user.currentStreak, user.lastActivityAt, this.deps.now()),
      longestStreak: user.longestStreak,
      lastActivityAt: iso(user.lastActivityAt),
      walletAddress: primary?.address,
      wallets: walletRows.map((w) => ({ id: w.id, address: w.address, network: w.network, isPrimary: w.isPrimary, verifiedAt: iso(w.verifiedAt) })),
      githubUsername: user.githubUsername ?? undefined,
      github: { username: user.githubUsername, connected: Boolean(user.githubUsername) },
      organizations: memberships,
      createdAt: iso(user.createdAt),
    };
  }

  /** Public profile: no email, wallets or organization details. */
  async publicProfile(username: string) {
    const [user] = await this.deps.db.select().from(users).where(eq(users.username, username)).limit(1);
    if (!user || user.role !== "participant") throw notFound("Participant");
    const level = levelInfo(user.points);
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? undefined,
      githubUsername: user.githubUsername ?? undefined,
      level: level.level,
      levelTitle: level.title,
      points: user.points,
      reputation: user.reputation,
      globalRank: await this.globalRank(user),
      challengesSolved: await this.solvedCount(user.id),
      currentStreak: displayedStreak(user.currentStreak, user.lastActivityAt, this.deps.now()),
      longestStreak: user.longestStreak,
      createdAt: iso(user.createdAt),
    };
  }

  async stats(user: User) {
    const { db } = this.deps;
    const now = this.deps.now();
    const byDifficulty = await db.select({ difficulty: challenges.difficulty, n: countDistinct(submissions.challengeId) })
      .from(submissions).innerJoin(challenges, eq(challenges.id, submissions.challengeId))
      .where(and(eq(submissions.userId, user.id), eq(submissions.status, "verified")))
      .groupBy(challenges.difficulty);
    const solvedByDifficulty = { Easy: 0, Medium: 0, Hard: 0, Expert: 0 };
    for (const r of byDifficulty) solvedByDifficulty[DIFFICULTY_LABEL[r.difficulty]] = Number(r.n);

    const since = new Date(now.getTime() - 365 * 86_400_000);
    const days = await db.selectDistinct({ day: sql<string>`to_char(${reputationEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')` })
      .from(reputationEvents)
      .where(and(eq(reputationEvents.userId, user.id), eq(reputationEvents.eventType, VERIFIED_EVENT), gte(reputationEvents.createdAt, since)))
      .orderBy(sql`1`);

    // securityStats: share (0-100) of published challenges in each category the participant has verified.
    const perCategory = await db.select({
      category: challenges.category,
      total: count(),
      solved: sql<number>`count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${submissions} s WHERE s.challenge_id = ${ref(challenges.id)} AND s.user_id = ${user.id} AND s.status = 'verified'))::int`,
    }).from(challenges).where(eq(challenges.status, "published")).groupBy(challenges.category);

    const challengesSolved = await this.solvedCount(user.id);
    return {
      totalPoints: user.points,
      totalReputation: user.reputation,
      challengesSolved,
      solvedByDifficulty,
      globalRank: await this.globalRank(user),
      level: levelInfo(user.points),
      streak: {
        current: displayedStreak(user.currentStreak, user.lastActivityAt, now),
        longest: user.longestStreak,
        activityDays: days.map((d) => d.day),
        lastActiveDate: user.lastActivityAt ? user.lastActivityAt.toISOString().slice(0, 10) : undefined,
      },
      activityDays: days.map((d) => d.day),
      securityStats: perCategory
        .filter((c) => Number(c.total) > 0)
        .map((c) => ({ category: c.category, score: Math.round((Number(c.solved) / Number(c.total)) * 100), solved: Number(c.solved), total: Number(c.total) }))
        .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category)),
    };
  }

  /** One entry per attempted challenge (most recent first), with every submission's verification status. */
  async history(user: User) {
    const { db } = this.deps;
    const attempts = await db.select({ attempt: challengeAttempts, challenge: challenges }).from(challengeAttempts)
      .innerJoin(challenges, eq(challenges.id, challengeAttempts.challengeId))
      .where(eq(challengeAttempts.userId, user.id))
      .orderBy(desc(challengeAttempts.startedAt))
      .limit(500);
    if (attempts.length === 0) return [];
    const subs = await db.select({ submission: submissions, verification: verifications }).from(submissions)
      .leftJoin(verifications, eq(verifications.submissionId, submissions.id))
      .where(eq(submissions.userId, user.id)).orderBy(desc(submissions.submittedAt));
    const events = await db.select().from(reputationEvents)
      .where(and(eq(reputationEvents.userId, user.id), eq(reputationEvents.eventType, VERIFIED_EVENT)));
    const rewardRows = await db.select().from(rewards).where(eq(rewards.userId, user.id));

    const byChallenge = new Map<string, typeof attempts>();
    for (const a of attempts) {
      const list = byChallenge.get(a.challenge.id) ?? [];
      list.push(a);
      byChallenge.set(a.challenge.id, list);
    }
    const entries = [];
    for (const [challengeId, list] of byChallenge) {
      if (entries.length >= 100) break;
      const c = list[0]!.challenge;
      const cSubs = subs.filter((s) => s.submission.challengeId === challengeId);
      const event = events.find((e) => e.challengeId === challengeId);
      const reward = rewardRows.find((r) => r.challengeId === challengeId);
      const verifiedSub = cSubs.find((s) => s.submission.status === "verified");
      const pending = cSubs.find((s) => s.submission.status === "pending");
      const status = verifiedSub ? "Verified"
        : pending ? (c.verificationType === "admin_review" || c.verificationType === "peer_review" ? "Under Review" : "Submitted")
        : list.some((a) => a.attempt.status === "started") ? "Attempted" : "Failed";
      entries.push({
        challengeId,
        title: c.title,
        category: c.category,
        difficulty: DIFFICULTY_LABEL[c.difficulty],
        type: CHALLENGE_TYPE_LABEL[c.challengeType],
        pointsAwarded: event?.points ?? 0,
        reputationAwarded: event?.reputation ?? 0,
        status,
        attempts: list.length,
        startedAt: iso(list[list.length - 1]!.attempt.startedAt),
        completedAt: iso(verifiedSub?.verification?.verifiedAt ?? list[0]!.attempt.completedAt),
        submissions: cSubs.map((s) => ({
          submissionId: s.submission.id,
          attemptId: s.submission.attemptId,
          status: s.submission.status === "verified" ? "Verified" : s.submission.status === "rejected" ? "Failed" : "Pending",
          verificationStatus: s.verification?.status ?? "pending",
          reason: s.verification?.reason ?? null,
          submittedAt: iso(s.submission.submittedAt),
          verifiedAt: iso(s.verification?.verifiedAt),
        })),
        reward: reward ? {
          id: reward.id, challengeId, challengeTitle: c.title, mstAmount: reward.amount,
          status: REWARD_STATUS_LABEL[reward.status], transactionHash: reward.transactionHash ?? undefined,
          createdAt: iso(reward.createdAt), paidAt: iso(reward.paidAt),
        } : undefined,
      });
    }
    return entries;
  }

}
