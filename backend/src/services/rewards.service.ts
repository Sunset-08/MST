import { and, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { challenges, rewards, submissions } from "../db/schema.js";
import { ClaimError, type ClaimInput } from "../integrations/blockchain/claims.js";
import { explorerTxUrl } from "../integrations/blockchain/mst-provider.js";
import { BlockchainNotConfiguredError } from "../integrations/blockchain/types.js";
import { iso } from "../utils/dates.js";
import { AppError, conflict, notFound, parse } from "../utils/http.js";
import { REWARD_STATUS_LABEL } from "../utils/labels.js";
import type { ServiceDeps } from "./deps.js";

type RewardRow = typeof rewards.$inferSelect;

export const claimSchema = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte transaction hash") }).strict();

const toAppError = (e: unknown): AppError =>
  e instanceof ClaimError ? new AppError(e.status, e.code, e.message)
    : e instanceof AppError ? e
    : new AppError(502, "CHAIN_ERROR", "The blockchain request failed; try again shortly");

export class RewardsService {
  constructor(private readonly deps: ServiceDeps) {}

  toDto(r: RewardRow, challengeTitle: string) {
    return {
      id: r.id,
      challengeId: r.challengeId,
      challengeTitle,
      submissionId: r.submissionId,
      mstAmount: r.amount,
      token: r.token,
      network: r.network,
      walletAddress: r.walletAddress,
      status: REWARD_STATUS_LABEL[r.status],
      transactionHash: r.transactionHash ?? undefined,
      explorerUrl: explorerTxUrl(this.deps.config.mst.explorerUrl, r.transactionHash) ?? undefined,
      createdAt: iso(r.createdAt),
      paidAt: iso(r.paidAt),
      confirmedAt: r.status === "confirmed" ? iso(r.paidAt) : undefined,
    };
  }

  async listForUser(userId: string) {
    const rows = await this.deps.db.select({ reward: rewards, title: challenges.title }).from(rewards)
      .innerJoin(challenges, eq(challenges.id, rewards.challengeId))
      .where(eq(rewards.userId, userId)).orderBy(desc(rewards.createdAt)).limit(200);
    return rows.map((r) => this.toDto(r.reward, r.title));
  }

  /** Loads a reward owned by `userId` together with what the on-chain claim needs. Others get 404. */
  private async loadClaimable(userId: string, rewardId: string): Promise<{ reward: RewardRow; input: ClaimInput }> {
    if (!z.uuid().safeParse(rewardId).success) throw notFound("Reward");
    const [row] = await this.deps.db.select({ reward: rewards, challenge: challenges, submission: submissions }).from(rewards)
      .innerJoin(challenges, eq(challenges.id, rewards.challengeId))
      .innerJoin(submissions, eq(submissions.id, rewards.submissionId))
      .where(and(eq(rewards.id, rewardId), eq(rewards.userId, userId))).limit(1);
    if (!row) throw notFound("Reward");
    const { reward, challenge, submission } = row;
    if (reward.status === "confirmed") throw conflict("REWARD_ALREADY_PAID", "This reward has already been paid");
    if (reward.status === "submitted" && reward.transactionHash) throw conflict("REWARD_IN_FLIGHT", "This reward is already being processed");
    return {
      reward,
      input: {
        rewardId: reward.id, submissionId: reward.submissionId, challengeId: challenge.id, challengeTitle: challenge.title,
        challengeUpdatedAt: challenge.updatedAt.toISOString(), submissionData: submission.submissionData,
        recipientAddress: reward.walletAddress, amount: reward.amount,
      },
    };
  }

  /** What the participant's wallet must submit on-chain to claim (step 1 of the claim). */
  async claimInfo(userId: string, rewardId: string) {
    const { reward, input } = await this.loadClaimable(userId, rewardId);
    try {
      return { rewardId: reward.id, walletAddress: reward.walletAddress, ...(await this.deps.claims.prepare(input)) };
    } catch (e) {
      throw toAppError(e);
    }
  }

  /**
   * Step 2: the participant's proof transaction is confirmed, verified on-chain by the platform and paid from the
   * vault. The reward is Confirmed only after the RewardDistributed event is seen in a successful receipt.
   */
  async claim(userId: string, rewardId: string, body: unknown) {
    const { txHash } = parse(claimSchema, body);
    const { reward, input } = await this.loadClaimable(userId, rewardId);
    const [locked] = await this.deps.db.update(rewards).set({ status: "submitted" })
      .where(and(eq(rewards.id, reward.id), or(eq(rewards.status, "pending"), eq(rewards.status, "failed"), and(eq(rewards.status, "submitted"), isNull(rewards.transactionHash)))))
      .returning();
    if (!locked) throw conflict("REWARD_IN_FLIGHT", "This reward is already being processed");
    try {
      const result = await this.deps.claims.complete({ ...input, txHash });
      const [paid] = await this.deps.db.update(rewards).set({
        status: "confirmed", transactionHash: result.rewardTx, contractAddress: result.contractAddress, paidAt: this.deps.now(),
      }).where(eq(rewards.id, reward.id)).returning();
      const dto = await this.withTitle(paid!);
      return { reward: dto, onchainSubmissionId: result.onchainSubmissionId, verificationTx: result.verificationTx, proofTx: txHash, rewardTx: result.rewardTx };
    } catch (e) {
      await this.deps.db.update(rewards).set({ status: "pending" }).where(and(eq(rewards.id, reward.id), eq(rewards.status, "submitted"), isNull(rewards.transactionHash)));
      throw toAppError(e);
    }
  }

  blockchainStatus() {
    return this.deps.blockchain.status();
  }

  /**
   * Sends pending rewards through the provider. Rows are locked (SKIP LOCKED) so concurrent workers never
   * send the same reward twice. With no configured provider nothing changes and the reason is reported.
   */
  async processPending(limit = 20) {
    const status = this.deps.blockchain.status();
    if (!status.canSend) return { processed: 0, submitted: 0, failed: 0, blockchain: status };
    let submitted = 0;
    let errors = 0;
    const rows = await this.deps.db.transaction(async (tx) => {
      const pending = await tx.select().from(rewards).where(eq(rewards.status, "pending"))
        .orderBy(rewards.createdAt).limit(Math.min(limit, 100)).for("update", { skipLocked: true });
      for (const r of pending) {
        try {
          const sent = await this.deps.blockchain.sendReward({
            rewardId: r.id, submissionId: r.submissionId, challengeId: r.challengeId, recipientAddress: r.walletAddress,
            amount: r.amount, token: r.token, network: r.network,
          });
          await tx.update(rewards).set({
            status: "submitted", transactionHash: sent.transactionHash, contractAddress: sent.contractAddress ?? null,
          }).where(eq(rewards.id, r.id));
          submitted++;
        } catch (error) {
          if (error instanceof BlockchainNotConfiguredError) break;
          errors++;
          console.error(`[securex] reward ${r.id} send failed: ${(error as Error).message}`);
        }
      }
      return pending.length;
    });
    return { processed: rows, submitted, failed: errors, blockchain: status };
  }

  /** Updates a submitted reward from chain state. Confirmed only when the provider reports a successful receipt. */
  async refresh(rewardId: string) {
    if (!z.uuid().safeParse(rewardId).success) throw notFound("Reward");
    const [reward] = await this.deps.db.select().from(rewards).where(eq(rewards.id, rewardId)).limit(1);
    if (!reward) throw notFound("Reward");
    if (reward.status !== "submitted" || !reward.transactionHash) {
      throw conflict("REWARD_NOT_IN_FLIGHT", "Only rewards with a submitted transaction can be refreshed");
    }
    if (!this.deps.blockchain.status().canReadTransactions) {
      return { reward: await this.withTitle(reward), transactionStatus: "unknown", blockchain: this.deps.blockchain.status() };
    }
    const txStatus = await this.deps.blockchain.getTransactionStatus(reward.transactionHash);
    let next: RewardRow = reward;
    if (txStatus === "confirmed" || txStatus === "failed") {
      const [updated] = await this.deps.db.update(rewards).set({
        status: txStatus,
        paidAt: txStatus === "confirmed" ? this.deps.now() : null,
      }).where(and(eq(rewards.id, reward.id), eq(rewards.status, "submitted"))).returning();
      if (updated) next = updated;
    }
    return { reward: await this.withTitle(next), transactionStatus: txStatus };
  }


  private async withTitle(r: RewardRow) {
    const [c] = await this.deps.db.select({ title: challenges.title }).from(challenges).where(eq(challenges.id, r.challengeId));
    return this.toDto(r, c?.title ?? "");
  }

}
