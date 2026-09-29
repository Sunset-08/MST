import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { formatEther, getAddress, isAddress, verifyMessage } from "ethers";
import { z } from "zod";
import { challenges, organizations, rewards, users, wallets } from "../db/schema.js";
import { explorerTxUrl } from "../integrations/blockchain/mst-provider.js";
import { randomToken, signPayload, verifySignedPayload } from "../utils/crypto.js";
import { iso } from "../utils/dates.js";
import { AppError, badRequest, conflict, forbidden, notFound, parse, unavailable } from "../utils/http.js";
import { REWARD_STATUS_LABEL } from "../utils/labels.js";
import type { ServiceDeps } from "./deps.js";

const CHALLENGE_TTL_MS = 10 * 60_000;
/** A payout must be mined after the reward existed (small allowance for clock skew). */
const CLOCK_SKEW_S = 5 * 60;

const addressSchema = z.object({ address: z.string().trim().max(64) }).strict();
const verifySchema = z.object({
  address: z.string().trim().max(64),
  signature: z.string().trim().regex(/^0x[0-9a-fA-F]{130}$/, "Expected a 65-byte hex signature"),
  challengeToken: z.string().trim().min(1).max(4096),
}).strict();
const paySchema = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte transaction hash") }).strict();

interface OrgWalletChallenge { v: 1; purpose: "org_wallet_link"; org: string; uid: string; address: string; nonce: string; issuedAt: string; expiresAt: string }

function checksum(address: string) {
  if (!isAddress(address)) throw badRequest("INVALID_WALLET_ADDRESS", "Invalid EVM wallet address");
  return getAddress(address);
}

const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/**
 * The organization funds its own MSTC rewards: its wallet (connected through the browser extension and proven with a
 * signature) sends MSTC directly to the solver's linked wallet. The backend never holds that wallet's key; it only
 * reads the mined transaction and marks the reward paid when sender, recipient, amount and chain all match.
 */
export class OrgRewardsService {
  constructor(private readonly deps: ServiceDeps) {}

  private secret() {
    const s = this.deps.config.signingSecret;
    if (!s) throw unavailable("WALLET_LINKING_NOT_CONFIGURED", "Wallet linking is not configured (APP_SIGNING_SECRET)");
    return s;
  }

  private weiFor(amount: number) {
    return BigInt(amount) * BigInt(this.deps.config.mst.rewardWeiPerUnit);
  }

  private async org(organizationId: string) {
    const [o] = await this.deps.db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!o) throw notFound("Organization");
    return o;
  }

  async wallet(organizationId: string) {
    const o = await this.org(organizationId);
    return {
      address: o.walletAddress ?? null, verifiedAt: iso(o.walletVerifiedAt), chainId: this.deps.config.mst.chainId ?? null,
      network: this.deps.config.mst.network ?? null, explorerUrl: this.deps.config.mst.explorerUrl ?? null,
    };
  }

  static message(c: OrgWalletChallenge, orgName: string) {
    return [
      `Link wallet ${c.address} as the reward funding wallet of the SECUREX organization "${orgName}".`,
      "This signature does not send a transaction or cost gas.",
      "",
      `Organization: ${c.org}`,
      `Nonce: ${c.nonce}`,
      `Issued At: ${c.issuedAt}`,
      `Expiration Time: ${c.expiresAt}`,
    ].join("\n");
  }

  async walletChallenge(organizationId: string, user: { id: string }, body: unknown) {
    const secret = this.secret();
    const address = checksum(parse(addressSchema, body).address);
    const o = await this.org(organizationId);
    const now = this.deps.now();
    const c: OrgWalletChallenge = {
      v: 1, purpose: "org_wallet_link", org: organizationId, uid: user.id, address, nonce: randomToken(12),
      issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString(),
    };
    return { message: OrgRewardsService.message(c, o.name), challengeToken: signPayload(secret, { ...c }), expiresAt: c.expiresAt };
  }

  async walletVerify(organizationId: string, user: { id: string }, body: unknown) {
    const input = parse(verifySchema, body);
    const address = checksum(input.address);
    const c = verifySignedPayload<OrgWalletChallenge>(this.secret(), input.challengeToken);
    if (!c || c.purpose !== "org_wallet_link" || c.org !== organizationId || c.uid !== user.id || c.address !== address) {
      throw badRequest("INVALID_WALLET_CHALLENGE", "This signature request does not belong to this organization and wallet");
    }
    if (Date.parse(c.expiresAt) < this.deps.now().getTime()) throw badRequest("WALLET_CHALLENGE_EXPIRED", "The signature request expired; try again");
    const o = await this.org(organizationId);
    let signer: string;
    try {
      signer = verifyMessage(OrgRewardsService.message(c, o.name), input.signature);
    } catch {
      throw badRequest("INVALID_WALLET_SIGNATURE", "The signature could not be verified");
    }
    if (!same(signer, address)) throw badRequest("INVALID_WALLET_SIGNATURE", "The signature was not made by this wallet");
    // A solver must never be paid by (or be) the funding wallet: refuse a wallet a participant already uses.
    const [participantWallet] = await this.deps.db.select({ id: wallets.id }).from(wallets).where(eq(wallets.address, address)).limit(1);
    if (participantWallet) throw conflict("WALLET_IN_USE_BY_PARTICIPANT", "This wallet is linked to a participant account; use a separate organization wallet");
    const now = this.deps.now();
    await this.deps.db.update(organizations).set({ walletAddress: address, walletVerifiedAt: now, updatedAt: now }).where(eq(organizations.id, organizationId));
    return this.wallet(organizationId);
  }

  async walletUnlink(organizationId: string) {
    await this.deps.db.update(organizations).set({ walletAddress: null, walletVerifiedAt: null, updatedAt: this.deps.now() })
      .where(eq(organizations.id, organizationId));
    return this.wallet(organizationId);
  }

  private dto(r: typeof rewards.$inferSelect, title: string, solver: { username: string; displayName: string }) {
    return {
      id: r.id, challengeId: r.challengeId, challengeTitle: title, submissionId: r.submissionId,
      solver: { username: solver.username, displayName: solver.displayName },
      recipientAddress: r.walletAddress, mstAmount: r.amount, amountWei: this.weiFor(r.amount).toString(),
      status: REWARD_STATUS_LABEL[r.status], transactionHash: r.transactionHash ?? undefined, funderAddress: r.funderAddress ?? undefined,
      explorerUrl: explorerTxUrl(this.deps.config.mst.explorerUrl, r.transactionHash) ?? undefined,
      createdAt: iso(r.createdAt), paidAt: iso(r.paidAt),
    };
  }

  async list(organizationId: string) {
    const rows = await this.deps.db.select({ r: rewards, title: challenges.title, username: users.username, displayName: users.displayName })
      .from(rewards).innerJoin(challenges, eq(challenges.id, rewards.challengeId)).innerJoin(users, eq(users.id, rewards.userId))
      .where(eq(challenges.organizationId, organizationId)).orderBy(desc(rewards.createdAt)).limit(200);
    const wallet = await this.wallet(organizationId);
    return { wallet, rewards: rows.map((x) => this.dto(x.r, x.title, x)) };
  }

  /**
   * Marks a reward paid by the organization wallet. The transaction is read from the chain and must be: mined and
   * successful, on the configured chain, sent FROM the organization wallet TO the solver's reward wallet, carrying
   * exactly the reward amount, mined after the reward existed, and not already used for another reward.
   */
  async pay(organizationId: string, rewardId: string, body: unknown) {
    const { txHash } = parse(paySchema, body);
    if (!z.uuid().safeParse(rewardId).success) throw notFound("Reward");
    const o = await this.org(organizationId);
    if (!o.walletAddress) throw conflict("ORG_WALLET_REQUIRED", "Connect the organization wallet first");

    const [row] = await this.deps.db.select({ r: rewards }).from(rewards).innerJoin(challenges, eq(challenges.id, rewards.challengeId))
      .where(and(eq(rewards.id, rewardId), eq(challenges.organizationId, organizationId))).limit(1);
    if (!row) throw notFound("Reward");
    const reward = row.r;
    if (reward.status === "confirmed") throw conflict("REWARD_ALREADY_PAID", "This reward has already been paid");

    const [reused] = await this.deps.db.select({ id: rewards.id }).from(rewards)
      .where(and(eq(rewards.transactionHash, txHash), ne(rewards.id, reward.id))).limit(1);
    if (reused) throw conflict("TX_ALREADY_USED", "This transaction already paid another reward");

    let transfer;
    try {
      transfer = await this.deps.blockchain.getNativeTransfer(txHash);
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(502, "CHAIN_ERROR", "The MST network could not be reached; try again shortly");
    }
    if (!transfer) throw conflict("TX_NOT_MINED", "That transaction is not mined yet; wait for confirmation and try again");
    if (!transfer.success) throw conflict("TX_REVERTED", "That transaction failed on-chain; no MSTC was transferred");
    if (this.deps.config.mst.chainId && transfer.chainId !== this.deps.config.mst.chainId) {
      throw badRequest("TX_WRONG_CHAIN", `That transaction is on chain ${transfer.chainId}, not MST Testnet (${this.deps.config.mst.chainId})`);
    }
    if (!same(transfer.from, o.walletAddress)) {
      throw forbidden(`That transaction was sent from ${transfer.from}, not from the organization wallet ${o.walletAddress}`, "TX_WRONG_FUNDER");
    }
    if (!same(transfer.to, reward.walletAddress)) {
      throw badRequest("TX_WRONG_RECIPIENT", `That transaction was sent to ${transfer.to ?? "a contract creation"}, not to the solver's wallet ${reward.walletAddress}`);
    }
    const expected = this.weiFor(reward.amount);
    if (transfer.valueWei !== expected) {
      throw badRequest("TX_WRONG_AMOUNT", `That transaction moved ${formatEther(transfer.valueWei)} MSTC; this reward is ${formatEther(expected)} MSTC`);
    }
    if (transfer.blockTimestamp && transfer.blockTimestamp < Math.floor(reward.createdAt.getTime() / 1000) - CLOCK_SKEW_S) {
      throw badRequest("TX_PREDATES_REWARD", "That transaction was mined before this reward existed");
    }

    // Conditional update: a concurrent payment or claim for the same reward cannot also confirm it.
    const [paid] = await this.deps.db.update(rewards).set({
      status: "confirmed", transactionHash: transfer.hash, funderAddress: getAddress(transfer.from), contractAddress: null, paidAt: this.deps.now(),
    }).where(and(eq(rewards.id, reward.id), inArray(rewards.status, ["pending", "failed", "submitted"]))).returning();
    if (!paid) throw conflict("REWARD_ALREADY_PAID", "This reward has already been paid");

    console.log(`[securex] MSTC reward ${paid.id} paid: FUNDER ${paid.funderAddress} -> RECIPIENT ${paid.walletAddress} | ${formatEther(expected)} MSTC | TX ${paid.transactionHash} (block ${transfer.blockNumber})`);
    const [meta] = await this.deps.db.select({ title: challenges.title, username: users.username, displayName: users.displayName })
      .from(challenges).innerJoin(users, eq(users.id, paid.userId)).where(eq(challenges.id, paid.challengeId)).limit(1);
    return { reward: this.dto(paid, meta?.title ?? "", meta ?? { username: "", displayName: "" }), blockNumber: transfer.blockNumber };
  }
}
