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
      assert.match(ok.body.data.reward.transactionHash, /^0x55[0-9a-f]{62}$/);
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

describe("reward payout readiness, honest result and vault funding", () => {
  test("a verified but unclaimed reward is not reported as awarded; a confirmed one is, with its transaction", async () => {
    ctx.claims.configured = true;
    try {
      const { u, reward } = await rewardedParticipant("claim_result");
      const list = await ctx.api("GET", "/api/rewards", { token: u.token });
      const submissionId = list.body.data[0].submissionId;
      const before = await ctx.api("GET", `/api/submissions/${submissionId}/result`, { token: u.token });
      assert.equal(before.body.data.mstAwarded, 0, "nothing is awarded before the on-chain transfer confirms");
      assert.equal(before.body.data.mstPending, 5);
      assert.equal(before.body.data.reward.id, reward.id);
      assert.equal(before.body.data.reward.status, "Pending");
      assert.equal(before.body.data.reward.transactionHash, undefined);

      assert.equal((await ctx.api("POST", `/api/rewards/${reward.id}/claim`, { token: u.token, body: { txHash: TX } })).status, 200);
      const after = await ctx.api("GET", `/api/submissions/${submissionId}/result`, { token: u.token });
      assert.equal(after.body.data.mstAwarded, 5);
      assert.equal(after.body.data.mstPending, 0);
      assert.equal(after.body.data.reward.status, "Confirmed");
      assert.match(after.body.data.reward.transactionHash, /^0x55[0-9a-f]{62}$/);
      assert.match(after.body.data.reward.explorerUrl, /\/tx\/0x55/);
      // Calling claim again (retry / double click) never pays twice.
      assert.equal((await ctx.api("POST", `/api/rewards/${reward.id}/claim`, { token: u.token, body: { txHash: TX } })).status, 409);
      assert.equal(ctx.claims.completed.filter((c) => c.rewardId === reward.id).length, 1);
    } finally { ctx.claims.configured = false; }
  });

  test("readiness explains why payouts would fail; funding and cap changes are admin-only, bounded and confirmed on-chain", async () => {
    const admin = await ctx.user("vaultadmin", "platform_admin");
    const nobody = await ctx.user("vaultuser");
    assert.equal((await ctx.api("GET", "/api/admin/rewards/readiness", { token: nobody.token })).status, 403);
    const off = await ctx.api("GET", "/api/admin/rewards/readiness", { token: admin.token });
    assert.equal(off.body.data.configured, false);

    ctx.claims.configured = true;
    const original = { ...ctx.claims.vault, roles: { ...ctx.claims.vault.roles } };
    try {
      await rewardedParticipant("claim_ready");
      ctx.claims.vault.maxRewardWei = 10n ** 17n;          // 0.1 MSTC cap, but rewards are 5 MSTC
      ctx.claims.vault.balanceWei = 10n ** 18n;            // 1 MSTC in the vault, unpaid rewards need more
      ctx.claims.vault.roles.rewardDistributor = false;
      const bad = await ctx.api("GET", "/api/admin/rewards/readiness", { token: admin.token });
      assert.equal(bad.status, 200, JSON.stringify(bad.body));
      assert.equal(bad.body.data.ready, false);
      const text = bad.body.data.problems.join(" | ");
      assert.match(text, /REWARD_DISTRIBUTOR_ROLE/);
      assert.match(text, /caps a reward at 0\.1 MSTC/);
      assert.match(text, /vault holds 1\.0 MSTC/);

      const cap = await ctx.api("POST", "/api/admin/rewards/vault/cap", { token: admin.token, body: { maxRewardMstc: "5" } });
      assert.equal(cap.status, 200, JSON.stringify(cap.body));
      assert.equal(cap.body.data.readiness.vault.maxReward, "5.0");
      ctx.claims.vault.roles.vaultAdmin = false;
      const denied = await ctx.api("POST", "/api/admin/rewards/vault/cap", { token: admin.token, body: { maxRewardMstc: "6" } });
      assert.equal(denied.body.error.code, "SIGNER_NOT_VAULT_ADMIN");
      ctx.claims.vault.roles.vaultAdmin = true;

      const funded = await ctx.api("POST", "/api/admin/rewards/vault/fund", { token: admin.token, body: { amountMstc: "20" } });
      assert.equal(funded.status, 200, JSON.stringify(funded.body));
      assert.equal(funded.body.data.transactionHash, `0x${"66".repeat(32)}`);
      assert.equal(funded.body.data.readiness.vault.balance, "21.0");
      for (const body of [{ amountMstc: "0" }, { amountMstc: "101" }, { amountMstc: "-1" }, { amountMstc: "1", extra: 1 }, {}]) {
        assert.equal((await ctx.api("POST", "/api/admin/rewards/vault/fund", { token: admin.token, body })).status, 400, JSON.stringify(body));
      }
      ctx.claims.vault.signerBalanceWei = 10n ** 18n;      // would leave nothing for gas
      const low = await ctx.api("POST", "/api/admin/rewards/vault/fund", { token: admin.token, body: { amountMstc: "1" } });
      assert.equal(low.body.error.code, "SIGNER_BALANCE_TOO_LOW");
      ctx.claims.failWith = new ClaimError("VAULT_FUNDING_FAILED", "The vault funding transaction reverted", 502);
      ctx.claims.vault.signerBalanceWei = 50n * 10n ** 18n;
      const reverted = await ctx.api("POST", "/api/admin/rewards/vault/fund", { token: admin.token, body: { amountMstc: "1" } });
      assert.equal(reverted.status, 502, "a reverted funding transaction is an error, not a success");
    } finally { ctx.claims.configured = false; ctx.claims.failWith = null; Object.assign(ctx.claims.vault, original); }
  });
});
