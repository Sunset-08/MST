import { and, countDistinct, eq, sql } from "drizzle-orm";
import type { Tx } from "../db/index.js";
import {
  achievements,
  challenges,
  reputationEvents,
  rewards,
  submissions,
  userAchievements,
  users,
  wallets,
} from "../db/schema.js";
import type { DbDifficulty } from "../utils/labels.js";
import { levelFromPoints, nextStreak, REPUTATION_BY_DIFFICULTY } from "./gamification.rules.js";

export const VERIFIED_EVENT = "challenge_verified";

type Challenge = typeof challenges.$inferSelect;
type Submission = typeof submissions.$inferSelect;

export interface AwardOutcome {
  pointsAwarded: number;
  reputationAwarded: number;
  streakUpdated: boolean;
  currentStreak: number;
  longestStreak: number;
  level: number;
  rewardId: string | null;
  mstRewardStatus: "created" | "wallet_required" | "none";
  achievementsEarned: string[];
}

export function reputationFor(challenge: Challenge): number {
  const override = (challenge.challengeConfig as Record<string, unknown> | null)?.reputationReward;
  if (typeof override === "number" && Number.isInteger(override) && override >= 0 && override <= 10_000) return override;
  return REPUTATION_BY_DIFFICULTY[challenge.difficulty as DbDifficulty];
}

/**
 * Applies all gamification effects of a newly verified submission. MUST run inside the transaction that
 * moved the submission from pending to verified; the unique (submission_id, event_type) constraint and the
 * locked user row make a repeated call a no-op instead of a double award.
 */
export async function applyVerifiedSubmission(
  tx: Tx,
  input: { submission: Submission; challenge: Challenge; verificationId: string; network: string; now: Date },
): Promise<AwardOutcome> {
  const { submission, challenge, now } = input;
  const [already] = await tx.select({ id: reputationEvents.id }).from(reputationEvents)
    .where(and(eq(reputationEvents.submissionId, submission.id), eq(reputationEvents.eventType, VERIFIED_EVENT)))
    .limit(1);

  const [user] = await tx.select().from(users).where(eq(users.id, submission.userId)).for("update");
  if (!user) throw new Error("Submission owner not found");

  if (already) {
    return {
      pointsAwarded: 0, reputationAwarded: 0, streakUpdated: false, currentStreak: user.currentStreak,
      longestStreak: user.longestStreak, level: user.level, rewardId: null, mstRewardStatus: "none", achievementsEarned: [],
    };
  }

  const points = challenge.pointsReward;
  const reputation = reputationFor(challenge);
  const streak = nextStreak({ current: user.currentStreak, longest: user.longestStreak, lastActivityAt: user.lastActivityAt }, now);
  let totalPoints = user.points + points;

  // Reward (MST) first so the event metadata records its state.
  let rewardId: string | null = null;
  let mstRewardStatus: AwardOutcome["mstRewardStatus"] = "none";
  if (challenge.mstReward > 0) {
    const reward = await createRewardIfWalletLinked(tx, { submission, challenge, verificationId: input.verificationId, network: input.network });
    rewardId = reward?.id ?? null;
    mstRewardStatus = reward ? "created" : "wallet_required";
  }

  await tx.insert(reputationEvents).values({
    userId: user.id,
    challengeId: challenge.id,
    submissionId: submission.id,
    eventType: VERIFIED_EVENT,
    points,
    reputation,
    metadata: {
      difficulty: challenge.difficulty,
      category: challenge.category,
      streakUpdated: streak.changed,
      currentStreak: streak.current,
      mstReward: challenge.mstReward,
      mstRewardStatus,
    },
    createdAt: now,
  });

  // Achievements whose criteria are now satisfied (awarded once via user_achievement_unique).
  const earned = await evaluateAchievements(tx, user.id, { points: totalPoints, streak: streak.current, now });
  for (const a of earned) {
    if (a.pointsReward > 0) {
      totalPoints += a.pointsReward;
      await tx.insert(reputationEvents).values({
        userId: user.id, eventType: "achievement_earned", points: a.pointsReward, reputation: 0,
        metadata: { achievementId: a.id, name: a.name }, createdAt: now,
      });
    }
  }

  const level = levelFromPoints(totalPoints);
  await tx.update(users).set({
    points: totalPoints,
    reputation: user.reputation + reputation,
    level,
    currentStreak: streak.current,
    longestStreak: streak.longest,
    lastActivityAt: now,
    updatedAt: now,
  }).where(eq(users.id, user.id));

  return {
    pointsAwarded: points,
    reputationAwarded: reputation,
    streakUpdated: streak.changed,
    currentStreak: streak.current,
    longestStreak: streak.longest,
    level,
    rewardId,
    mstRewardStatus,
    achievementsEarned: earned.map((a) => a.name),
  };
}

/** Creates the pending MST reward for a verified submission if the user has a verified wallet. Idempotent. */
export async function createRewardIfWalletLinked(
  tx: Tx,
  input: { submission: Submission; challenge: Challenge; verificationId: string; network: string },
) {
  const [existing] = await tx.select().from(rewards).where(eq(rewards.submissionId, input.submission.id)).limit(1);
  if (existing) return existing;
  const [wallet] = await tx.select().from(wallets)
    .where(and(eq(wallets.userId, input.submission.userId), eq(wallets.isVerified, true)))
    .orderBy(sql`${wallets.isPrimary} desc`, wallets.verifiedAt)
    .limit(1);
  if (!wallet) return null;
  const [reward] = await tx.insert(rewards).values({
    userId: input.submission.userId,
    organizationId: input.challenge.organizationId,
    challengeId: input.challenge.id,
    submissionId: input.submission.id,
    verificationId: input.verificationId,
    walletAddress: wallet.address,
    amount: input.challenge.mstReward,
    network: input.network,
    status: "pending",
  }).onConflictDoNothing().returning();
  if (reward) return reward;
  const [raced] = await tx.select().from(rewards).where(eq(rewards.submissionId, input.submission.id)).limit(1);
  return raced ?? null;
}

type AchievementCriteria =
  | { type: "challenges_solved"; count: number }
  | { type: "points"; min: number }
  | { type: "streak"; days: number }
  | { type: "difficulty_solved"; difficulty: DbDifficulty; count: number }
  | { type: "category_solved"; category: string; count: number };

/** Supported criteria shapes are listed above; unknown shapes are ignored rather than guessed. */
async function evaluateAchievements(tx: Tx, userId: string, state: { points: number; streak: number; now: Date }) {
  const all = await tx.select().from(achievements);
  if (all.length === 0) return [];
  const owned = new Set((await tx.select({ id: userAchievements.achievementId }).from(userAchievements)
    .where(eq(userAchievements.userId, userId))).map((r) => r.id));
  const candidates = all.filter((a) => !owned.has(a.id));
  if (candidates.length === 0) return [];

  // Verified solves including the one being recorded (its event row was inserted above).
  const solvedRows = await tx.select({ difficulty: challenges.difficulty, category: challenges.category, n: countDistinct(reputationEvents.challengeId) })
    .from(reputationEvents)
    .innerJoin(challenges, eq(challenges.id, reputationEvents.challengeId))
    .where(and(eq(reputationEvents.userId, userId), eq(reputationEvents.eventType, VERIFIED_EVENT)))
    .groupBy(challenges.difficulty, challenges.category);
  const [{ total } = { total: 0 }] = await tx.select({ total: countDistinct(reputationEvents.challengeId) }).from(reputationEvents)
    .where(and(eq(reputationEvents.userId, userId), eq(reputationEvents.eventType, VERIFIED_EVENT)));

  const earned: (typeof achievements.$inferSelect)[] = [];
  for (const a of candidates) {
    const c = a.criteria as Partial<AchievementCriteria> & Record<string, unknown>;
    let met = false;
    if (c.type === "challenges_solved" && typeof c.count === "number") met = total >= c.count;
    else if (c.type === "points" && typeof c.min === "number") met = state.points >= c.min;
    else if (c.type === "streak" && typeof c.days === "number") met = state.streak >= c.days;
    else if (c.type === "difficulty_solved" && typeof c.count === "number") {
      met = solvedRows.filter((r) => r.difficulty === c.difficulty).reduce((s, r) => s + Number(r.n), 0) >= c.count;
    } else if (c.type === "category_solved" && typeof c.count === "number") {
      met = solvedRows.filter((r) => r.category === c.category).reduce((s, r) => s + Number(r.n), 0) >= c.count;
    }
    if (!met) continue;
    const [row] = await tx.insert(userAchievements).values({ userId, achievementId: a.id, earnedAt: state.now })
      .onConflictDoNothing().returning();
    if (row) earned.push(a);
  }
  return earned;
}
