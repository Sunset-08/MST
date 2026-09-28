import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { getAddress, isAddress, verifyMessage } from "ethers";
import { z } from "zod";
import { challenges, rewards, submissions, users, verifications, wallets } from "../db/schema.js";
import { randomToken, signPayload, verifySignedPayload } from "../utils/crypto.js";
import { iso } from "../utils/dates.js";
import { badRequest, conflict, notFound, parse, unavailable } from "../utils/http.js";
import { createRewardIfWalletLinked } from "./gamification.service.js";
import type { ServiceDeps } from "./deps.js";

const CHALLENGE_TTL_MS = 10 * 60_000;

export const nonceSchema = z.object({ address: z.string().trim().max(64) }).strict();
export const verifySchema = z.object({
  address: z.string().trim().max(64),
  signature: z.string().trim().regex(/^0x[0-9a-fA-F]{130}$/, "Expected a 65-byte hex signature"),
  challengeToken: z.string().trim().min(1).max(4096),
}).strict();

interface LinkChallenge {
  v: 1;
  purpose: "wallet_link";
  uid: string;
  address: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  chainId?: number;
  domain: string;
  uri: string;
}

/** EIP-4361 (Sign-In with Ethereum) style message; signing it costs no gas and sends no transaction. */
export function buildLinkMessage(c: LinkChallenge, username: string): string {
  return [
    `${c.domain} wants you to sign in with your Ethereum account:`,
    c.address,
    "",
    `Link this wallet to the SECUREX account @${username}. This signature does not send a transaction or cost gas.`,
    "",
    `URI: ${c.uri}`,
    "Version: 1",
    ...(c.chainId ? [`Chain ID: ${c.chainId}`] : []),
    `Nonce: ${c.nonce}`,
    `Issued At: ${c.issuedAt}`,
    `Expiration Time: ${c.expiresAt}`,
  ].join("\n");
}

function normalizeAddress(address: string): string {
  if (!isAddress(address)) throw badRequest("INVALID_WALLET_ADDRESS", "Invalid EVM wallet address");
  return getAddress(address);
}

/**
 * Provider-agnostic EVM wallet linking (BridgeKey or any EIP-1193 wallet can supply the signature).
 * Only the public address and verification metadata are stored; never keys or recovery phrases.
 */
export class WalletsService {
  constructor(private readonly deps: ServiceDeps) {}

  private secret(): string {
    const s = this.deps.config.signingSecret;
    if (!s) throw unavailable("WALLET_LINKING_NOT_CONFIGURED", "Wallet linking is not configured (APP_SIGNING_SECRET)");
    return s;
  }

  private origin() {
    const url = this.deps.config.publicAppUrl;
    if (url) {
      try {
        const u = new URL(url);
        return { domain: u.host, uri: u.origin };
      } catch { /* fall through */ }
    }
    return { domain: "securex", uri: "securex://wallet-link" };
  }

  async createChallenge(user: { id: string; username: string }, body: unknown) {
    const secret = this.secret();
    const { address } = parse(nonceSchema, body);
    const now = this.deps.now();
    const challenge: LinkChallenge = {
      v: 1,
      purpose: "wallet_link",
      uid: user.id,
      address: normalizeAddress(address),
      nonce: randomToken(16),
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString(),
      ...(this.deps.config.mst.chainId ? { chainId: this.deps.config.mst.chainId } : {}),
      ...this.origin(),
    };
    return {
      address: challenge.address,
      message: buildLinkMessage(challenge, user.username),
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      challengeToken: signPayload(secret, challenge as unknown as Record<string, unknown>),
    };
  }

  async verifyAndLink(user: { id: string; username: string }, body: unknown) {
    const secret = this.secret();
    const input = parse(verifySchema, body);
    const challenge = verifySignedPayload<LinkChallenge>(secret, input.challengeToken);
    const now = this.deps.now();
    if (!challenge || challenge.purpose !== "wallet_link" || challenge.v !== 1) throw badRequest("INVALID_WALLET_CHALLENGE", "Invalid wallet link challenge");
    if (challenge.uid !== user.id) throw badRequest("INVALID_WALLET_CHALLENGE", "Challenge was issued to a different account");
    if (new Date(challenge.expiresAt).getTime() <= now.getTime()) throw badRequest("WALLET_CHALLENGE_EXPIRED", "Wallet link challenge expired; request a new one");
    const address = normalizeAddress(input.address);
    if (address !== challenge.address) throw badRequest("INVALID_WALLET_CHALLENGE", "Address does not match the challenge");

    let recovered: string;
    try {
      recovered = getAddress(verifyMessage(buildLinkMessage(challenge, user.username), input.signature));
    } catch {
      throw badRequest("INVALID_WALLET_SIGNATURE", "Signature could not be verified");
    }
    if (recovered !== address) throw badRequest("INVALID_WALLET_SIGNATURE", "Signature was not produced by this wallet");

    const network = this.deps.config.mst.network ?? "mst-testnet";
    const linked = await this.deps.db.transaction(async (tx) => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for("update");
      const [takenByOther] = await tx.select({ id: wallets.id }).from(wallets)
        .where(and(sql`lower(${wallets.address}) = lower(${address})`, ne(wallets.userId, user.id), eq(wallets.isVerified, true))).limit(1);
      if (takenByOther) throw conflict("WALLET_ALREADY_LINKED", "This wallet is linked to another SECUREX account");
      const [hasPrimary] = await tx.select({ id: wallets.id }).from(wallets)
        .where(and(eq(wallets.userId, user.id), eq(wallets.isPrimary, true), eq(wallets.isVerified, true))).limit(1);
      const [existing] = await tx.select().from(wallets)
        .where(and(eq(wallets.userId, user.id), sql`lower(${wallets.address}) = lower(${address})`)).limit(1);
      let wallet;
      if (existing) {
        [wallet] = await tx.update(wallets).set({
          address, isVerified: true, verifiedAt: now, updatedAt: now, isPrimary: existing.isPrimary || !hasPrimary,
        }).where(eq(wallets.id, existing.id)).returning();
      } else {
        [wallet] = await tx.insert(wallets).values({
          userId: user.id, address, network, isVerified: true, verifiedAt: now, isPrimary: !hasPrimary,
        }).returning();
      }
      // Verified solves that were waiting for a wallet now get their pending MST reward.
      const waiting = await tx.select({ submission: submissions, challenge: challenges, verificationId: verifications.id })
        .from(submissions)
        .innerJoin(challenges, eq(challenges.id, submissions.challengeId))
        .innerJoin(verifications, eq(verifications.submissionId, submissions.id))
        .leftJoin(rewards, eq(rewards.submissionId, submissions.id))
        .where(and(eq(submissions.userId, user.id), eq(submissions.status, "verified"), isNull(rewards.id), sql`${challenges.mstReward} > 0`))
        .for("update", { of: submissions });
      let created = 0;
      for (const w of waiting) {
        if (await createRewardIfWalletLinked(tx, { submission: w.submission, challenge: w.challenge, verificationId: w.verificationId, network })) created++;
      }
      return { wallet: wallet!, rewardsCreated: created };
    });
    return { wallet: this.toDto(linked.wallet), rewardsCreated: linked.rewardsCreated };
  }

  toDto(w: typeof wallets.$inferSelect) {
    return { id: w.id, address: w.address, network: w.network, isPrimary: w.isPrimary, isVerified: w.isVerified, verifiedAt: iso(w.verifiedAt), createdAt: iso(w.createdAt) };
  }

  async list(userId: string) {
    const rows = await this.deps.db.select().from(wallets).where(eq(wallets.userId, userId)).orderBy(desc(wallets.isPrimary), wallets.createdAt);
    return rows.map((w) => this.toDto(w));
  }

  async setPrimary(userId: string, walletId: string) {
    if (!z.uuid().safeParse(walletId).success) throw notFound("Wallet");
    return this.deps.db.transaction(async (tx) => {
      const [w] = await tx.select().from(wallets).where(and(eq(wallets.id, walletId), eq(wallets.userId, userId))).for("update");
      if (!w) throw notFound("Wallet");
      if (!w.isVerified) throw conflict("WALLET_NOT_VERIFIED", "Only verified wallets can be primary");
      await tx.update(wallets).set({ isPrimary: false, updatedAt: this.deps.now() }).where(eq(wallets.userId, userId));
      const [updated] = await tx.update(wallets).set({ isPrimary: true, updatedAt: this.deps.now() }).where(eq(wallets.id, walletId)).returning();
      return this.toDto(updated!);
    });
  }

  /** Unlinks a wallet. Existing reward records keep the address they were created with. */
  async remove(userId: string, walletId: string) {
    if (!z.uuid().safeParse(walletId).success) throw notFound("Wallet");
    const [deleted] = await this.deps.db.delete(wallets).where(and(eq(wallets.id, walletId), eq(wallets.userId, userId))).returning();
    if (!deleted) throw notFound("Wallet");
    return { id: deleted.id, removed: true };
  }
}
