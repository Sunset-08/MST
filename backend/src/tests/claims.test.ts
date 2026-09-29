import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { Wallet } from "ethers";
import { rewards } from "../db/schema.js";
import { ClaimError } from "../integrations/blockchain/claims.js";
import { deriveClaimHashes, onchainChallengeId } from "../integrations/blockchain/mst-claims.js";
import { seedOrgWithChallenge, startTestApp, waitForResult, type TestContext } from "./harness.js";

let ctx: TestContext;
before(async () => { ctx = await startTestApp(); });
after(async () => { await ctx.close(); });

const TX = `0x${"ab".repeat(32)}`;

async function linkWallet(token: string, wallet: { address: string; signMessage(m: string): Promise<string> }) {
  const ch = await ctx.api("POST", "/api/wallets/challenge", { token, body: { address: wallet.address } });
  const signature = await wallet.signMessage(ch.body.data.message);
  return ctx.api("POST", "/api/wallets/verify", { token, body: { address: wallet.address, signature, challengeToken: ch.body.data.challengeToken } });
}

async function rewardedParticipant(name: string) {
  const { challengeId } = await seedOrgWithChallenge(ctx);
  const u = await ctx.user(name);
  const wallet = Wallet.createRandom();
  await linkWallet(u.token, wallet);
  const start = await ctx.api("POST", `/api/challenges/${challengeId}/start`, { token: u.token });
  const sub = await ctx.api("POST", `/api/attempts/${start.body.data.id}/submit`, { token: u.token, body: { structuredAnswers: { q1: "B", q2: "second verifier" } } });
  await waitForResult(ctx, u.token, sub.body.data.submissionId);
  const reward = (await ctx.api("GET", "/api/rewards", { token: u.token })).body.data[0];
  return { u, wallet, reward, challengeId };
}

describe("claim commitments", () => {
  test("derived hashes are deterministic and bound to challenge, wallet and content", () => {
    const base = { submissionId: "s1", challengeId: "c1", submissionData: { a: 1, b: [2] }, recipientAddress: Wallet.createRandom().address };
    const a = deriveClaimHashes("secret", base);
    assert.deepEqual(a, deriveClaimHashes("secret", base));
    assert.equal(a.challengeId, onchainChallengeId("c1"));
    assert.notEqual(a.solutionCommitment, deriveClaimHashes("secret", { ...base, recipientAddress: Wallet.createRandom().address }).solutionCommitment);
    assert.notEqual(a.solutionCommitment, deriveClaimHashes("secret", { ...base, submissionData: { a: 2 } }).solutionCommitment);
    assert.notEqual(a.solutionCommitment, deriveClaimHashes("other-secret", base).solutionCommitment);
    assert.equal(a.solutionCommitment, deriveClaimHashes("secret", { ...base, submissionData: { b: [2], a: 1 } }).solutionCommitment, "key order does not matter");
  });
});

describe("reward claims", () => {
  test("unconfigured chain is reported, not faked", async () => {
    const { u, reward } = await rewardedParticipant("claim_off");
    const info = await ctx.api("GET", `/api/rewards/${reward.id}/claim-info`, { token: u.token });
    assert.equal(info.status, 503);
    assert.equal(info.body.error.code, "BLOCKCHAIN_NOT_CONFIGURED");
    const claim = await ctx.api("POST", `/api/rewards/${reward.id}/claim`, { token: u.token, body: { txHash: TX } });
    assert.equal(claim.status, 503);
    const [row] = await ctx.db.select().from(rewards).where(eq(rewards.id, reward.id));
    assert.equal(row!.status, "pending", "a failed claim leaves the reward claimable");
  });

  test("claim-info exposes what the wallet must submit; only the owner can use it", async () => {
    ctx.claims.configured = true;
    try {
      const { u, reward } = await rewardedParticipant("claim_info");
      const other = await ctx.user("claim_other");
      const info = await ctx.api("GET", `/api/rewards/${reward.id}/claim-info`, { token: u.token });
      assert.equal(info.status, 200, JSON.stringify(info.body));
      assert.equal(info.body.data.functionName, "submitProof");
      assert.match(info.body.data.solutionCommitment, /^0x[0-9a-f]{64}$/);
      assert.equal(info.body.data.walletAddress, reward.walletAddress);
      assert.equal(ctx.claims.prepared.at(-1)!.amount, 5);
      assert.equal((ctx.claims.prepared.at(-1)!.submissionData as any).structuredAnswers.q2, "second verifier");
      assert.equal((await ctx.api("GET", `/api/rewards/${reward.id}/claim-info`, { token: other.token })).status, 404);
      assert.equal((await ctx.api("POST", `/api/rewards/${reward.id}/claim`, { token: other.token, body: { txHash: TX } })).status, 404);
      assert.equal((await ctx.api("GET", `/api/rewards/${reward.id}/claim-info`)).status, 401);
    } finally { ctx.claims.configured = false; }
  });

  test("successful claim confirms the reward once with the payout transaction", async () => {
    ctx.claims.configured = true;
    try {
      const { u, reward } = await rewardedParticipant("claim_ok");
      assert.equal((await ctx.api("POST", `/api/rewards/${reward.id}/claim`, { token: u.token, body: { txHash: "0x123" } })).status, 400);
      assert.equal((await ctx.api("POST", `/api/rewards/${reward.id}/claim`, { token: u.token, body: { txHash: TX, extra: 1 } })).status, 400);
      const ok = await ctx.api("POST", `/api/rewards/${reward.id}/claim`, { token: u.token, body: { txHash: TX } });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.data.reward.status, "Confirmed");
      assert.equal(ok.body.data.reward.transactionHash, `0x${"55".repeat(32)}`);
      assert.ok(ok.body.data.reward.paidAt);
      assert.equal(ctx.claims.completed.at(-1)!.txHash, TX);
      const again = await ctx.api("POST", `/api/rewards/${reward.id}/claim`, { token: u.token, body: { txHash: TX } });
      assert.equal(again.status, 409);
      assert.equal(again.body.error.code, "REWARD_ALREADY_PAID");
      assert.equal((await ctx.api("GET", "/api/rewards", { token: u.token })).body.data[0].status, "Confirmed");
    } finally { ctx.claims.configured = false; }
  });

  test("provider failures surface a stable code and return the reward to Pending", async () => {
    ctx.claims.configured = true;
    try {
      const { u, reward } = await rewardedParticipant("claim_fail");
      ctx.claims.failWith = new ClaimError("PROOF_EVENT_MISSING", "The transaction did not record the expected proof", 400);
      const bad = await ctx.api("POST", `/api/rewards/${reward.id}/claim`, { token: u.token, body: { txHash: TX } });
      assert.equal(bad.status, 400);
      assert.equal(bad.body.error.code, "PROOF_EVENT_MISSING");
      const [row] = await ctx.db.select().from(rewards).where(eq(rewards.id, reward.id));
      assert.equal(row!.status, "pending");
      ctx.claims.failWith = null;
      assert.equal((await ctx.api("POST", `/api/rewards/${reward.id}/claim`, { token: u.token, body: { txHash: TX } })).status, 200, "retry after a failed attempt works");
    } finally { ctx.claims.configured = false; ctx.claims.failWith = null; }
  });

  test("admin settings report claim configuration without secrets", async () => {
    const admin = await ctx.user("claimadmin", "platform_admin");
    const s = await ctx.api("GET", "/api/admin/settings", { token: admin.token });
    assert.equal(s.body.data.claims.claimsConfigured, false);
    assert.equal(JSON.stringify(s.body).toLowerCase().includes("privatekey\":\"0x"), false);
    assert.equal(typeof s.body.data.blockchain.onChainClaimsConfigured, "boolean");
  });
});
