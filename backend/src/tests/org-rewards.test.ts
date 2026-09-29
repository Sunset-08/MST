import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { Wallet, parseEther } from "ethers";
import { organizations, rewards } from "../db/schema.js";
import type { NativeTransfer } from "../integrations/blockchain/types.js";
import { seedOrgWithChallenge, startTestApp, waitForResult, type TestContext } from "./harness.js";

let ctx: TestContext;
before(async () => { ctx = await startTestApp(); ctx.config.mst.chainId = 91562037; });
after(async () => { await ctx.close(); });

const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

describe("organization wallet funds MSTC rewards directly (maintainer → solver)", () => {
  let org: Awaited<ReturnType<typeof seedOrgWithChallenge>>;
  const orgWallet = Wallet.createRandom();
  const solverWallet = Wallet.createRandom();
  let solver: Awaited<ReturnType<TestContext["user"]>>;
  let rewardId = "";
  let rewardCreatedS = 0;
  const H = () => ({ "X-Organization-Id": org.orgId });
  const orgApi = (method: string, path: string, body?: unknown) => ctx.api(method, path, { token: org.owner.token, headers: H(), body });
  const transfer = (n: number, over: Partial<NativeTransfer> = {}): NativeTransfer => ({
    hash: hash(n), from: orgWallet.address, to: solverWallet.address, valueWei: parseEther("5"), success: true,
    blockNumber: 100 + n, blockTimestamp: rewardCreatedS + 60, chainId: 91562037, ...over,
  });

  test("the organization wallet is linked only with a signature from that wallet", async () => {
    org = await seedOrgWithChallenge(ctx);
    assert.equal((await orgApi("GET", "/api/org/wallet")).body.data.address, null);

    const ch = await orgApi("POST", "/api/org/wallet/challenge", { address: orgWallet.address });
    assert.equal(ch.status, 200, JSON.stringify(ch.body));
    const forged = await Wallet.createRandom().signMessage(ch.body.data.message);
    const bad = await orgApi("POST", "/api/org/wallet/verify", { address: orgWallet.address, signature: forged, challengeToken: ch.body.data.challengeToken });
    assert.equal(bad.body.error.code, "INVALID_WALLET_SIGNATURE");

    const ok = await orgApi("POST", "/api/org/wallet/verify", {
      address: orgWallet.address, signature: await orgWallet.signMessage(ch.body.data.message), challengeToken: ch.body.data.challengeToken,
    });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.data.address, orgWallet.address);
    // Persisted on the organization: survives reloads and new sessions.
    assert.equal((await orgApi("GET", "/api/org/wallet")).body.data.address, orgWallet.address);

    const other = await seedOrgWithChallenge(ctx);
    const stolen = await ctx.api("POST", "/api/org/wallet/verify", {
      token: other.owner.token, headers: { "X-Organization-Id": other.orgId },
      body: { address: orgWallet.address, signature: await orgWallet.signMessage(ch.body.data.message), challengeToken: ch.body.data.challengeToken },
    });
    assert.equal(stolen.body.error.code, "INVALID_WALLET_CHALLENGE", "a challenge issued to one org cannot link another org");
  });

  test("a solver's verified reward is listed for the organization with the exact amount in wei", async () => {
    solver = await ctx.user("paid_solver");
    const wch = await ctx.api("POST", "/api/wallets/challenge", { token: solver.token, body: { address: solverWallet.address } });
    await ctx.api("POST", "/api/wallets/verify", { token: solver.token, body: { address: solverWallet.address, signature: await solverWallet.signMessage(wch.body.data.message), challengeToken: wch.body.data.challengeToken } });
    const start = await ctx.api("POST", `/api/challenges/${org.challengeId}/start`, { token: solver.token });
    const sub = await ctx.api("POST", `/api/attempts/${start.body.data.id}/submit`, { token: solver.token, body: { structuredAnswers: { q1: "B", q2: "second verifier" } } });
    const result = await waitForResult(ctx, solver.token, sub.body.data.submissionId);
    assert.equal(result.body.data.status, "Verified");
    assert.equal(result.body.data.mstAwarded, 0, "not awarded before the organization pays");
    assert.equal(result.body.data.reward.payment, "organization");

    const list = await orgApi("GET", "/api/org/rewards");
    const r = list.body.data.rewards[0];
    rewardId = r.id;
    rewardCreatedS = Math.floor(Date.parse(r.createdAt) / 1000);
    assert.equal(r.recipientAddress, solverWallet.address);
    assert.equal(r.amountWei, parseEther("5").toString());
    assert.equal(r.status, "Pending");
    assert.equal(list.body.data.wallet.address, orgWallet.address);

    // The solver cannot also claim it from the vault: only one payer.
    const claim = await ctx.api("GET", `/api/rewards/${rewardId}/claim-info`, { token: solver.token });
    assert.equal(claim.body.error.code, "PAID_BY_ORGANIZATION");
  });

  test("payment is accepted only for a mined, successful transfer FROM the org wallet TO the solver of exactly the reward", async () => {
    const pay = (n: number) => orgApi("POST", `/api/org/rewards/${rewardId}/pay`, { txHash: hash(n) });
    assert.equal((await pay(1)).body.error.code, "TX_NOT_MINED");
    const cases: [number, Partial<NativeTransfer>, string][] = [
      [2, { success: false }, "TX_REVERTED"],
      [3, { from: Wallet.createRandom().address }, "TX_WRONG_FUNDER"],
      [4, { to: Wallet.createRandom().address }, "TX_WRONG_RECIPIENT"],
      [5, { valueWei: parseEther("4.99") }, "TX_WRONG_AMOUNT"],
      [6, { chainId: 1 }, "TX_WRONG_CHAIN"],
      [7, { blockTimestamp: rewardCreatedS - 86_400 }, "TX_PREDATES_REWARD"],
    ];
    for (const [n, over, code] of cases) {
      ctx.chain.transfers.set(hash(n), transfer(n, over));
      assert.equal((await pay(n)).body.error.code, code, code);
    }
    const [row] = await ctx.db.select().from(rewards).where(eq(rewards.id, rewardId));
    assert.equal(row!.status, "pending", "no rejected transaction marks the reward paid");
    assert.equal(row!.transactionHash, null);
  });

  test("a genuine transfer confirms the reward with funder, recipient and hash; it cannot be reused or paid twice", async () => {
    ctx.chain.transfers.set(hash(10), transfer(10));
    const ok = await orgApi("POST", `/api/org/rewards/${rewardId}/pay`, { txHash: hash(10) });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.reward.status, "Confirmed");
    assert.equal(ok.body.data.reward.funderAddress, orgWallet.address);
    assert.equal(ok.body.data.reward.recipientAddress, solverWallet.address);
    assert.equal(ok.body.data.reward.transactionHash, hash(10));

    const again = await orgApi("POST", `/api/org/rewards/${rewardId}/pay`, { txHash: hash(10) });
    assert.equal(again.body.error.code, "REWARD_ALREADY_PAID");

    const mine = (await ctx.api("GET", "/api/rewards", { token: solver.token })).body.data[0];
    assert.equal(mine.status, "Confirmed");
    assert.equal(mine.funderAddress, orgWallet.address);
    assert.equal(mine.transactionHash, hash(10));

    // Another reward cannot be "paid" with the same transaction.
    const second = await ctx.user("paid_solver2");
    const w2 = Wallet.createRandom();
    const c2 = await ctx.api("POST", "/api/wallets/challenge", { token: second.token, body: { address: w2.address } });
    await ctx.api("POST", "/api/wallets/verify", { token: second.token, body: { address: w2.address, signature: await w2.signMessage(c2.body.data.message), challengeToken: c2.body.data.challengeToken } });
    const s2 = await ctx.api("POST", `/api/challenges/${org.challengeId}/start`, { token: second.token });
    const sub2 = await ctx.api("POST", `/api/attempts/${s2.body.data.id}/submit`, { token: second.token, body: { structuredAnswers: { q1: "B", q2: "second verifier" } } });
    await waitForResult(ctx, second.token, sub2.body.data.submissionId);
    const r2 = (await orgApi("GET", "/api/org/rewards")).body.data.rewards.find((r: any) => r.status === "Pending");
    const reuse = await orgApi("POST", `/api/org/rewards/${r2.id}/pay`, { txHash: hash(10) });
    assert.equal(reuse.body.error.code, "TX_ALREADY_USED");
  });

  test("a participant's own wallet cannot become an organization funding wallet; members cannot pay", async () => {
    const ch = await orgApi("POST", "/api/org/wallet/challenge", { address: solverWallet.address });
    const r = await orgApi("POST", "/api/org/wallet/verify", {
      address: solverWallet.address, signature: await solverWallet.signMessage(ch.body.data.message), challengeToken: ch.body.data.challengeToken,
    });
    assert.equal(r.body.error.code, "WALLET_IN_USE_BY_PARTICIPANT");
    const [o] = await ctx.db.select().from(organizations).where(eq(organizations.id, org.orgId));
    assert.equal(o!.walletAddress, orgWallet.address, "the funding wallet is unchanged");

    const member = await ctx.user("org_member_pay");
    await ctx.api("POST", `/api/organizations/${org.orgId}/members`, { token: org.owner.token, body: { userId: member.id, role: "member" } });
    const denied = await ctx.api("GET", "/api/org/rewards", { token: member.token, headers: H() });
    assert.equal(denied.status, 403);
  });
});
