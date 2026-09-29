import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { formatEther, parseEther } from "ethers";
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

  /** Amounts an operator may move in one call (testnet-scale guard rail). */
  private static readonly MAX_ADMIN_MSTC = 100;
  private static readonly SIGNER_GAS_RESERVE_WEI = parseEther("1");

  private parseMstc(value: unknown): bigint {
    const { amountMstc } = parse(z.object({ amountMstc: z.string().regex(/^\d{1,6}(\.\d{1,6})?$/, "Use a decimal MSTC amount such as 5 or 0.5") }).strict(), value);
    const wei = parseEther(amountMstc);
    if (wei <= 0n || wei > parseEther(String(RewardsService.MAX_ADMIN_MSTC))) throw new AppError(400, "AMOUNT_OUT_OF_RANGE", `Amount must be between 0 and ${RewardsService.MAX_ADMIN_MSTC} MSTC`);
    return wei;
  }

  /**
   * Why rewards would or would not be payable right now: the platform signer's roles and balance, the vault's balance
   * and per-reward cap, and what the unpaid rewards need. Read-only and free of secrets.
   */
  async adminReadiness() {
    const status = this.deps.claims.status();
    if (!status.claimsConfigured) return { configured: false, problems: [status.reason ?? "blockchain not configured"], claims: status };
    const [pending] = await this.deps.db.select({
      count: sql<number>`count(*)::int`, units: sql<number>`coalesce(sum(${rewards.amount}), 0)::int`, largest: sql<number>`coalesce(max(${rewards.amount}), 0)::int`,
    }).from(rewards).where(inArray(rewards.status, ["pending", "failed", "submitted"]));
    let r;
    try {
      r = await this.deps.claims.readiness();
    } catch (e) {
      throw toAppError(e);
    }
    const perUnit = BigInt(r.rewardWeiPerUnit);
    const requiredWei = BigInt(pending?.units ?? 0) * perUnit;
    const largestWei = BigInt(pending?.largest ?? 0) * perUnit;
    const problems: string[] = [];
    if (!r.signerRoles.verifier) problems.push("The platform signer lacks VERIFIER_ROLE on the SubmissionRegistry (cannot verify claims).");
    if (!r.signerRoles.rewardDistributor) problems.push("The platform signer lacks REWARD_DISTRIBUTOR_ROLE on the RewardVault (cannot pay rewards).");
    if (!r.signerRoles.challengeAdmin) problems.push("The platform signer lacks CHALLENGE_ADMIN_ROLE on the ChallengeRegistry (cannot register challenges on-chain).");
    if (BigInt(r.vault.maxRewardWei) < largestWei) problems.push(`The vault caps a reward at ${formatEther(r.vault.maxRewardWei)} MSTC but the largest unpaid reward is ${formatEther(largestWei)} MSTC.`);
    if (BigInt(r.vault.balanceWei) < requiredWei) problems.push(`The vault holds ${formatEther(r.vault.balanceWei)} MSTC but unpaid rewards need ${formatEther(requiredWei)} MSTC.`);
    if (BigInt(r.signerBalanceWei) < parseEther("0.01")) problems.push("The platform signer wallet is almost out of MSTC for gas.");
    return {
      configured: true, ready: problems.length === 0, problems,
      signer: { address: r.signer, balance: formatEther(r.signerBalanceWei), roles: r.signerRoles },
      vault: { address: r.vault.address, balance: formatEther(r.vault.balanceWei), maxReward: formatEther(r.vault.maxRewardWei), totalDistributed: formatEther(r.vault.totalDistributedWei) },
      rewardWeiPerUnit: r.rewardWeiPerUnit,
      unpaid: { count: pending?.count ?? 0, units: pending?.units ?? 0, requiredMstc: formatEther(requiredWei) },
      explorerUrl: this.deps.config.mst.explorerUrl ?? null,
    };
  }

  /** Moves MSTC from the platform signer wallet into the RewardVault so rewards can be paid. */
  async fundVault(body: unknown) {
    const amount = this.parseMstc(body);
    const before = await this.readinessOrThrow();
    if (BigInt(before.signerBalanceWei) < amount + RewardsService.SIGNER_GAS_RESERVE_WEI) {
      throw new AppError(409, "SIGNER_BALANCE_TOO_LOW", `The platform signer holds ${formatEther(before.signerBalanceWei)} MSTC; it must keep 1 MSTC for gas after funding`);
    }
    try {
      const tx = await this.deps.claims.fundVault(amount);
      return { funded: formatEther(amount), ...tx, explorerUrl: explorerTxUrl(this.deps.config.mst.explorerUrl, tx.transactionHash), readiness: await this.adminReadiness() };
    } catch (e) {
      throw toAppError(e);
    }
  }

  /** Raises or lowers the vault's per-reward cap (the signer must be the vault admin). */
  async setMaxReward(body: unknown) {
    const { maxRewardMstc } = parse(z.object({ maxRewardMstc: z.string().regex(/^\d{1,6}(\.\d{1,6})?$/) }).strict(), body);
    const wei = parseEther(maxRewardMstc);
    if (wei <= 0n || wei > parseEther(String(RewardsService.MAX_ADMIN_MSTC))) throw new AppError(400, "AMOUNT_OUT_OF_RANGE", `Cap must be between 0 and ${RewardsService.MAX_ADMIN_MSTC} MSTC`);
    const before = await this.readinessOrThrow();
    if (!before.signerRoles.vaultAdmin) throw new AppError(403, "SIGNER_NOT_VAULT_ADMIN", "The platform signer is not the vault admin; change the cap from the admin wallet");
    try {
      const tx = await this.deps.claims.setMaxReward(wei);
      return { maxRewardMstc, ...tx, explorerUrl: explorerTxUrl(this.deps.config.mst.explorerUrl, tx.transactionHash), readiness: await this.adminReadiness() };
    } catch (e) {
      throw toAppError(e);
    }
  }

  private async readinessOrThrow() {
    try {
      return await this.deps.claims.readiness();
    } catch (e) {
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
