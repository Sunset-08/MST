import { explorerTxUrl } from "../integrations/blockchain/mst-provider.js";
import { and, eq, ne } from "drizzle-orm";
import { challengeAttempts, challenges, reputationEvents, rewards, submissions, verifications } from "../db/schema.js";
import type { ServiceDeps } from "../services/deps.js";
import { applyVerifiedSubmission, VERIFIED_EVENT } from "../services/gamification.service.js";
import { iso } from "../utils/dates.js";
import { AppError, conflict, forbidden, notFound } from "../utils/http.js";
import { REWARD_STATUS_LABEL, SUBMISSION_STATUS_LABEL } from "../utils/labels.js";
import { createVerificationProviders } from "./providers.js";
import type { VerificationProvider, VerificationType } from "./types.js";

export interface Decision {
  status: "passed" | "failed";
  reason: string;
  score?: number;
  evidence?: Record<string, unknown>;
  verifiedBy?: string | null;
}

export class VerificationService {
  readonly providers: Record<VerificationType, VerificationProvider>;

  constructor(private readonly deps: ServiceDeps, providers = createVerificationProviders()) {
    this.providers = providers;
  }

  /** Runs the challenge's provider. Safe to call repeatedly; only a pending submission can change. */
  async process(submissionId: string): Promise<void> {
    const { db } = this.deps;
    const [row] = await db.select({ submission: submissions, challenge: challenges })
      .from(submissions).innerJoin(challenges, eq(challenges.id, submissions.challengeId))
      .where(eq(submissions.id, submissionId)).limit(1);
    if (!row || row.submission.status !== "pending") return;
    const provider = this.providers[row.challenge.verificationType as VerificationType];
    if (!provider.automatic) return;
    const outcome = await provider.verify(row);
    if (outcome.status === "pending") {
      await db.update(verifications).set({ reason: outcome.reason })
        .where(and(eq(verifications.submissionId, submissionId), eq(verifications.status, "pending")));
      return;
    }
    await this.finalize(submissionId, { ...outcome, status: outcome.status, verifiedBy: null });
  }

  /** Human decision (admin_review / peer_review, or manual fallback). Caller must have authorized the reviewer. */
  async review(submissionId: string, reviewerId: string, decision: "approve" | "reject", reason: string) {
    const [sub] = await this.deps.db.select().from(submissions).where(eq(submissions.id, submissionId)).limit(1);
    if (!sub) throw notFound("Submission");
    if (sub.userId === reviewerId) throw forbidden("Reviewers cannot review their own submission", "SELF_REVIEW_FORBIDDEN");
    if (sub.status !== "pending") throw conflict("SUBMISSION_ALREADY_REVIEWED", "Submission has already been reviewed");
    const result = await this.finalize(submissionId, {
      status: decision === "approve" ? "passed" : "failed",
      reason,
      verifiedBy: reviewerId,
    });
    if (!result.changed) throw conflict("SUBMISSION_ALREADY_REVIEWED", "Submission has already been reviewed");
    return this.result(submissionId);
  }

  /**
   * Moves a pending submission to verified/rejected exactly once. The row lock plus the status guard make
   * duplicate jobs, retries and concurrent reviewers no-ops, so points/reputation/rewards are never doubled.
   */
  async finalize(submissionId: string, decision: Decision): Promise<{ changed: boolean }> {
    const now = this.deps.now();
    const network = this.deps.config.mst.network ?? "mst-testnet";
    return this.deps.db.transaction(async (tx) => {
      const [submission] = await tx.select().from(submissions).where(eq(submissions.id, submissionId)).for("update");
      if (!submission || submission.status !== "pending") return { changed: false };
      const [challenge] = await tx.select().from(challenges).where(eq(challenges.id, submission.challengeId));
      if (!challenge) throw notFound("Challenge");

      let { status, reason } = decision;
      if (status === "passed") {
        const [other] = await tx.select({ id: submissions.id }).from(submissions).where(and(
          eq(submissions.userId, submission.userId), eq(submissions.challengeId, submission.challengeId),
          eq(submissions.status, "verified"), ne(submissions.id, submission.id),
        )).limit(1);
        if (other) {
          status = "failed";
          reason = "Challenge already solved by this participant";
        }
      }

      const [verification] = await tx.update(verifications).set({
        status: status === "passed" ? "passed" : "failed",
        reason,
        score: decision.score ?? null,
        evidence: decision.evidence ?? {},
        verifiedBy: decision.verifiedBy ?? null,
        verifiedAt: now,
      }).where(eq(verifications.submissionId, submission.id)).returning();
      if (!verification) throw new AppError(500, "VERIFICATION_MISSING", "Verification record missing for submission");

      await tx.update(submissions).set({ status: status === "passed" ? "verified" : "rejected" })
        .where(eq(submissions.id, submission.id));
      await tx.update(challengeAttempts).set({
        status: status === "passed" ? "verified" : "failed",
        completedAt: now,
        score: decision.score ?? null,
      }).where(eq(challengeAttempts.id, submission.attemptId));

      if (status === "passed") {
        await applyVerifiedSubmission(tx, { submission, challenge, verificationId: verification.id, network, now });
      }
      return { changed: true };
    });
  }

  /** VerificationResult for the frontend. Authorization is the caller's responsibility. */
  async result(submissionId: string) {
    const { db } = this.deps;
    const [row] = await db.select({ submission: submissions, verification: verifications, challenge: challenges })
      .from(submissions)
      .innerJoin(challenges, eq(challenges.id, submissions.challengeId))
      .leftJoin(verifications, eq(verifications.submissionId, submissions.id))
      .where(eq(submissions.id, submissionId)).limit(1);
    if (!row) throw notFound("Submission");
    const [event] = await db.select().from(reputationEvents)
      .where(and(eq(reputationEvents.submissionId, submissionId), eq(reputationEvents.eventType, VERIFIED_EVENT))).limit(1);
    const [reward] = await db.select().from(rewards).where(eq(rewards.submissionId, submissionId)).limit(1);
    const meta = (event?.metadata ?? {}) as Record<string, unknown>;
    const verified = row.submission.status === "verified";
    return {
      submissionId,
      attemptId: row.submission.attemptId,
      challengeId: row.submission.challengeId,
      status: SUBMISSION_STATUS_LABEL[row.submission.status],
      verificationStatus: row.verification?.status ?? "pending",
      verificationType: row.challenge.verificationType,
      pointsAwarded: event?.points ?? 0,
      reputationAwarded: event?.reputation ?? 0,
      // MSTC counts as awarded only once the on-chain transfer is confirmed; until then it is a claimable reward.
      mstAwarded: reward?.status === "confirmed" ? reward.amount : 0,
      mstPending: reward && reward.status !== "confirmed" ? reward.amount : 0,
      mstRewardStatus: reward ? REWARD_STATUS_LABEL[reward.status] : verified && row.challenge.mstReward > 0 ? "WalletRequired" : null,
      reward: reward ? {
        id: reward.id, mstAmount: reward.amount, token: reward.token, network: reward.network, walletAddress: reward.walletAddress,
        status: REWARD_STATUS_LABEL[reward.status], transactionHash: reward.transactionHash ?? undefined,
        explorerUrl: explorerTxUrl(this.deps.config.mst.explorerUrl, reward.transactionHash) ?? undefined,
      } : null,
      streakUpdated: meta.streakUpdated === true,
      reason: row.verification?.reason ?? null,
      submittedAt: iso(row.submission.submittedAt),
      verifiedAt: iso(row.verification?.verifiedAt),
    };
  }
}
