/**
 * Rehearses the on-chain reward claim against a LOCAL EVM with the real SECUREX contracts deployed
 * (see blockchain/README: `HARDHAT_CHAIN_ID=91562037 npx hardhat node`, then deploy with the local RPC).
 * It uses Hardhat's public test keys and never touches a live network.
 *
 *   REHEARSAL_RPC=http://127.0.0.1:8547 REHEARSAL_DEPLOYMENT=../blockchain/deployments/localRehearsal.json \
 *     npx tsx src/scripts/rehearse-claims.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Contract, JsonRpcProvider, Wallet, formatEther, parseEther } from "ethers";
import { loadConfig } from "../config/env.js";
import { ClaimError, type ClaimInput } from "../integrations/blockchain/claims.js";
import { MstRewardClaims } from "../integrations/blockchain/mst-claims.js";

const RPC = process.env.REHEARSAL_RPC ?? "http://127.0.0.1:8547";
const deployment = JSON.parse(readFileSync(process.env.REHEARSAL_DEPLOYMENT ?? "../blockchain/deployments/localRehearsal.json", "utf8")) as {
  addresses: { ChallengeRegistry: string; SubmissionRegistry: string; RewardVault: string };
};
// Hardhat test accounts #0 (deployer/verifier), #1 and #2 (participants). Public, local-only keys.
const VERIFIER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const PLAYER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const COPYCAT_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const config = loadConfig({
  MST_NETWORK: "mst-testnet", MST_RPC_URL: RPC, MST_CHAIN_ID: "91562037",
  MST_CHALLENGE_REGISTRY_ADDRESS: deployment.addresses.ChallengeRegistry,
  MST_SUBMISSION_REGISTRY_ADDRESS: deployment.addresses.SubmissionRegistry,
  MST_REWARD_CONTRACT_ADDRESS: deployment.addresses.RewardVault,
  MST_VERIFIER_PRIVATE_KEY: VERIFIER_KEY,
});
const claims = new MstRewardClaims(config.mst, "rehearsal-signing-secret");
const provider = new JsonRpcProvider(RPC, 91562037, { staticNetwork: true, cacheTimeout: -1 });
const player = new Wallet(PLAYER_KEY, provider);
const copycat = new Wallet(COPYCAT_KEY, provider);
const verifier = new Wallet(VERIFIER_KEY, provider);

const input = (n: number, wallet: Wallet, amount = 5): ClaimInput => ({
  rewardId: `reward-${n}`, submissionId: `submission-${n}`, challengeId: `challenge-${n}`, challengeTitle: `Challenge ${n}`,
  challengeUpdatedAt: "2026-09-01T00:00:00.000Z", submissionData: { structuredAnswers: { q1: "B" }, n }, recipientAddress: wallet.address, amount,
});

async function submitProof(wallet: Wallet, prep: Awaited<ReturnType<typeof claims.prepare>>) {
  const registry = new Contract(prep.submissionRegistryAddress, prep.abi as never, wallet);
  const tx = await registry.submitProof(prep.challengeId, prep.solutionCommitment);
  return (await tx.wait()).hash as string;
}
const expectClaimError = async (code: string, fn: () => Promise<unknown>) => {
  try { await fn(); } catch (e) { assert.ok(e instanceof ClaimError, String(e)); assert.equal(e.code, code, e.message); console.log(`  ✔ rejected: ${code}`); return; }
  assert.fail(`expected ${code}`);
};

async function main() {
  console.log("status:", claims.status().claimsConfigured ? "configured" : claims.status().reason);

  // 1. Happy path
  const a = input(1, player);
  const before = await provider.getBalance(player.address);
  const prep = await claims.prepare(a);
  assert.ok(prep.registrationTx, "challenge is registered on-chain on first claim");
  console.log("  ✔ prepare: challenge registered on-chain, commitment derived");
  const proofTx = await submitProof(player, prep);
  const result = await claims.complete({ ...a, txHash: proofTx });
  assert.equal(result.recipient, player.address);
  assert.ok(result.verificationTx, "platform verified on-chain");
  const after = await provider.getBalance(player.address);
  assert.equal(after - before + (await gasCost(proofTx)), parseEther("0.005"), "vault paid exactly 5 units * 0.001 tMSTC to the participant");
  console.log(`  ✔ complete: verified + paid ${formatEther(BigInt(result.amountWei))} tMSTC to ${player.address} (tx ${result.rewardTx.slice(0, 12)}…)`);

  // 2. Idempotent retry returns the same payout without paying twice
  const again = await claims.complete({ ...a, txHash: proofTx });
  assert.equal(again.rewardTx, result.rewardTx);
  assert.equal(await provider.getBalance(player.address), after);
  console.log("  ✔ retry is idempotent (no second payment)");

  // 3. Second prepare for the same wallet + challenge is refused on-chain
  await expectClaimError("ALREADY_COMPLETED_ONCHAIN", () => claims.prepare(a));

  // 4. A copycat cannot redeem someone else's proof or reuse the commitment
  const b = input(2, player);
  const prepB = await claims.prepare(b);
  const copyTx = await submitProof(copycat, prepB); // copycat submits the same commitment from their own wallet
  await expectClaimError("PROOF_EVENT_MISSING", () => claims.complete({ ...b, txHash: copyTx }));
  const copycatBefore = await provider.getBalance(copycat.address);
  await expectClaimError("PROOF_EVENT_MISSING", () => claims.complete({ ...input(2, copycat), txHash: copyTx }));
  assert.equal(await provider.getBalance(copycat.address), copycatBefore, "copycat received nothing");

  // 5. Guards
  await expectClaimError("TX_NOT_MINED", () => claims.complete({ ...b, txHash: `0x${"9".repeat(64)}` }));
  await expectClaimError("VERIFIER_WALLET_CANNOT_CLAIM", () => claims.prepare(input(3, verifier)));
  await expectClaimError("REWARD_ABOVE_VAULT_CAP", () => claims.prepare(input(4, player, 100)));
  const c = input(5, player, 5);
  const prepC = await claims.prepare(c);
  const badReceipt = await submitProof(player, prepC);
  await expectClaimError("PROOF_EVENT_MISSING", () => claims.complete({ ...input(5, player, 5), submissionData: { tampered: true }, txHash: badReceipt }));
  const okC = await claims.complete({ ...c, txHash: badReceipt });
  assert.equal(okC.recipient, player.address);
  console.log("  ✔ tampered submission content cannot redeem the proof; the genuine one can");

  const vault = new Contract(deployment.addresses.RewardVault, ["function vaultBalance() view returns (uint256)", "function totalDistributed() view returns (uint256)"], provider);
  console.log(`vault balance ${formatEther(await vault.vaultBalance())} tMSTC, distributed ${formatEther(await vault.totalDistributed())} tMSTC`);
  console.log("REHEARSAL PASSED");


}

async function gasCost(hash: string) {
  const r = await provider.getTransactionReceipt(hash);
  return r!.gasUsed * r!.gasPrice;
}

main().catch((e) => { console.error(e); process.exit(1); });
