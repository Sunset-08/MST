import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { Wallet } from "ethers";
import { rewards } from "../db/schema.js";
import { seedOrgWithChallenge, startTestApp, waitForResult, type TestContext } from "./harness.js";

let ctx: TestContext;
before(async () => { ctx = await startTestApp(); });
after(async () => { await ctx.close(); });

const correct = { selectedAnswers: ["B"], structuredAnswers: { q2: "second verifier" } };

async function solve(token: string, challengeId: string) {
  const start = await ctx.api("POST", `/api/challenges/${challengeId}/start`, { token });
  const sub = await ctx.api("POST", `/api/attempts/${start.body.data.id}/submit`, { token, body: correct });
  return (await waitForResult(ctx, token, sub.body.data.submissionId)).body.data;
}

async function link(token: string, wallet: Wallet | ReturnType<typeof Wallet.createRandom>) {
  const ch = await ctx.api("POST", "/api/wallets/challenge", { token, body: { address: wallet.address } });
  assert.equal(ch.status, 200, JSON.stringify(ch.body));
  const signature = await wallet.signMessage(ch.body.data.message);
  return { ch, res: await ctx.api("POST", "/api/wallets/verify", { token, body: { address: wallet.address, signature, challengeToken: ch.body.data.challengeToken } }) };
}

describe("wallet linking", () => {
  test("links a wallet after verifying its signature; stores only the public address", async () => {
    const u = await ctx.user("walleter");
    const w = Wallet.createRandom();
    const { ch, res } = await link(u.token, w);
    assert.match(ch.body.data.message, /wants you to sign in with your Ethereum account/);
    assert.match(ch.body.data.message, /does not send a transaction/);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.wallet.address, w.address);
    assert.equal(res.body.data.wallet.isPrimary, true);
    const me = await ctx.api("GET", "/api/users/me", { token: u.token });
    assert.equal(me.body.data.walletAddress, w.address);
    assert.equal(JSON.stringify(me.body).includes(w.privateKey.slice(2)), false);
  });

  test("rejects signatures from another key, other users' challenges, expiry and already-linked wallets", async () => {
    const u = await ctx.user("wallet2");
    const other = await ctx.user("wallet3");
    const w = Wallet.createRandom();
    const ch = await ctx.api("POST", "/api/wallets/challenge", { token: u.token, body: { address: w.address } });
    const forged = await Wallet.createRandom().signMessage(ch.body.data.message);
    const bad = await ctx.api("POST", "/api/wallets/verify", { token: u.token, body: { address: w.address, signature: forged, challengeToken: ch.body.data.challengeToken } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, "INVALID_WALLET_SIGNATURE");
    const good = await w.signMessage(ch.body.data.message);
    const stolen = await ctx.api("POST", "/api/wallets/verify", { token: other.token, body: { address: w.address, signature: good, challengeToken: ch.body.data.challengeToken } });
    assert.equal(stolen.status, 400);
    const tampered = await ctx.api("POST", "/api/wallets/verify", { token: u.token, body: { address: w.address, signature: good, challengeToken: ch.body.data.challengeToken.replace(/.$/, (c: string) => (c === "A" ? "B" : "A")) } });
    assert.equal(tampered.status, 400);
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 11 * 60_000);
    const expired = await ctx.api("POST", "/api/wallets/verify", { token: u.token, body: { address: w.address, signature: good, challengeToken: ch.body.data.challengeToken } });
    assert.equal(expired.body.error.code, "WALLET_CHALLENGE_EXPIRED");
    ctx.clock.now = new Date("2026-09-01T12:00:00.000Z");
    assert.equal((await link(u.token, w)).res.status, 201);
    const taken = await link(other.token, w);
    assert.equal(taken.res.status, 409);
    assert.equal(taken.res.body.error.code, "WALLET_ALREADY_LINKED");
    assert.equal((await ctx.api("POST", "/api/wallets/challenge", { token: u.token, body: { address: "0x123" } })).status, 400);
  });

  test("wallet linking reports configuration state when no signing secret is set", async () => {
    const bare = await (await import("./harness.js")).startTestApp({ signingSecret: undefined });
    try {
      const u = await bare.user("nosecret");
      const r = await bare.api("POST", "/api/wallets/challenge", { token: u.token, body: { address: Wallet.createRandom().address } });
      assert.equal(r.status, 503);
      assert.equal(r.body.error.code, "WALLET_LINKING_NOT_CONFIGURED");
    } finally {
      await bare.close();
    }
  });
});

describe("rewards", () => {
  test("verified solve without a wallet defers the reward; linking a wallet creates it exactly once", async () => {
    const { challengeId } = await seedOrgWithChallenge(ctx);
    const u = await ctx.user("nowallet");
    const r = await solve(u.token, challengeId);
    assert.equal(r.status, "Verified");
    assert.equal(r.mstAwarded, 0);
    assert.equal(r.mstRewardStatus, "WalletRequired");
    assert.deepEqual((await ctx.api("GET", "/api/rewards", { token: u.token })).body.data, []);
    const w = Wallet.createRandom();
    const linked = await link(u.token, w);
    assert.equal(linked.res.body.data.rewardsCreated, 1);
    assert.equal((await link(u.token, w)).res.body.data.rewardsCreated, 0);
    const list = await ctx.api("GET", "/api/rewards", { token: u.token });
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].status, "Pending");
    assert.equal(list.body.data[0].mstAmount, 5);
    assert.equal(list.body.data[0].challengeTitle, "The Poisoned Node");
    assert.equal(list.body.data[0].walletAddress, w.address);
  });

  test("blockchain unavailable: rewards stay Pending and the provider reports not configured", async () => {
    const { challengeId } = await seedOrgWithChallenge(ctx);
    const u = await ctx.user("withwallet");
    await link(u.token, Wallet.createRandom());
    const r = await solve(u.token, challengeId);
    assert.equal(r.mstAwarded, 5);
    assert.equal(r.mstRewardStatus, "Pending");
    const admin = await ctx.user("rewardadmin", "platform_admin");
    const processed = await ctx.api("POST", "/api/admin/rewards/process", { token: admin.token });
    assert.equal(processed.status, 200);
    assert.equal(processed.body.data.submitted, 0);
    assert.equal(processed.body.data.blockchain.configured, false);
    assert.match(processed.body.data.blockchain.reason, /not configured/);
    const [row] = await ctx.db.select().from(rewards).where(eq(rewards.submissionId, r.submissionId));
    assert.equal(row!.status, "pending");
    assert.equal(row!.transactionHash, null);
  });

  test("transaction lifecycle: Pending -> Processing -> Confirmed only on provider confirmation; no double send", async () => {
    const admin = await ctx.user("chainadmin", "platform_admin");
    ctx.chain.canSend = true;
    try {
      const sent = await ctx.api("POST", "/api/admin/rewards/process", { token: admin.token });
      assert.ok(sent.body.data.submitted >= 1);
      const again = await ctx.api("POST", "/api/admin/rewards/process", { token: admin.token });
      assert.equal(again.body.data.submitted, 0, "already submitted rewards are not resent");
      const all = await ctx.db.select().from(rewards);
      const inFlight = all.find((x) => x.status === "submitted")!;
      assert.match(inFlight.transactionHash!, /^0x[0-9a-f]{64}$/);
      const still = await ctx.api("POST", `/api/admin/rewards/${inFlight.id}/refresh`, { token: admin.token });
      assert.equal(still.body.data.reward.status, "Processing");
      ctx.chain.txStatus.set(inFlight.transactionHash!, "confirmed");
      const done = await ctx.api("POST", `/api/admin/rewards/${inFlight.id}/refresh`, { token: admin.token });
      assert.equal(done.body.data.reward.status, "Confirmed");
      assert.ok(done.body.data.reward.paidAt);
      const failedOne = all.find((x) => x.status === "submitted" && x.id !== inFlight.id);
      if (failedOne) {
        ctx.chain.txStatus.set(failedOne.transactionHash!, "failed");
        assert.equal((await ctx.api("POST", `/api/admin/rewards/${failedOne.id}/refresh`, { token: admin.token })).body.data.reward.status, "Failed");
      }
      assert.equal(ctx.chain.sent.length, new Set(ctx.chain.sent.map((s) => s.rewardId)).size, "each reward sent once");
    } finally {
      ctx.chain.canSend = false;
    }
  });

  test("participants cannot trigger reward processing", async () => {
    const u = await ctx.user("sneaky");
    assert.equal((await ctx.api("POST", "/api/admin/rewards/process", { token: u.token })).status, 403);
  });
});
