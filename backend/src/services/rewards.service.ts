import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { challenges, rewards } from "../db/schema.js";
import { explorerTxUrl } from "../integrations/blockchain/mst-provider.js";
import { BlockchainNotConfiguredError } from "../integrations/blockchain/types.js";
import { iso } from "../utils/dates.js";
import { conflict, notFound } from "../utils/http.js";
import { REWARD_STATUS_LABEL } from "../utils/labels.js";
import type { ServiceDeps } from "./deps.js";

type RewardRow = typeof rewards.$inferSelect;

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
