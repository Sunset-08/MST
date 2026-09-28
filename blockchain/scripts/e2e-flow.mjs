// Full on-chain flow on MST Testnet using the same library the app uses:
// wallet -> challenge -> proof hash -> authorized verification -> reward -> RewardDistributed.
// Every step requires a mined receipt with status 1, the expected event, and the expected state.
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { Wallet, parseEther, formatEther } from "ethers";
import { createVerifierClient } from "../server/verifier.js";
import { getContracts, submitProof, createSolutionCommitment, getSubmission, getRewardStatus, sendAndConfirm, txUrl } from "../web3/src/index.js";

const IS_LOCAL = /localhost|127\.0\.0\.1/.test(process.env.MST_TESTNET_RPC_URL || "");
const LABEL = IS_LOCAL ? "LOCAL REHEARSAL (not MST Testnet)" : "MST Testnet";
const REWARD = parseEther(process.env.E2E_REWARD_TMSTC || "0.01");
const PLAYER_GAS = parseEther(process.env.E2E_PLAYER_GAS_TMSTC || "0.01");
const log = [];
const step = (name, res) => {
  log.push({ step: name, tx: res.hash, block: res.blockNumber, event: res.event?.name });
  console.log(`✔ ${name}: ${res.event?.name ?? ""} block ${res.blockNumber} ${IS_LOCAL ? res.hash : txUrl(res.hash)}`);
};
const expectRevert = async (label, fn) => {
  try {
    await fn();
  } catch (e) {
    console.log(`✔ ${label} rejected on-chain (${e.revert?.name ?? e.shortMessage ?? e.message})`);
    return;
  }
  throw new Error(`${label} was NOT rejected`);
};

const verifier = await createVerifierClient();
const provider = verifier.wallet.provider;
console.log(`Verifier ${verifier.address} roles`, verifier.roles);

// Player wallet (simulates the user's connected wallet; signs its own submission).
const player = process.env.PLAYER_PRIVATE_KEY ? new Wallet(process.env.PLAYER_PRIVATE_KEY, provider) : Wallet.createRandom().connect(provider);
if ((await provider.getBalance(player.address)) < PLAYER_GAS / 2n) {
  const tx = await verifier.wallet.sendTransaction({ to: player.address, value: PLAYER_GAS });
  const r = await tx.wait();
  if (r.status !== 1) throw new Error("Gas funding failed");
  console.log(`✔ funded player ${player.address} with ${formatEther(PLAYER_GAS)} tMSTC for gas`);
}

// 1. Challenge
const challengeSlug = `securex:e2e:poisoned-node:${Date.now()}`;
const reg = await verifier.registerChallenge(challengeSlug, { title: "The Poisoned Node", version: 1 });
step("registerChallenge", reg);

// 2. Player submits a proof hash from their own wallet
const playerContracts = getContracts(player);
// Player commits to solution + secret salt; only the commitment goes on-chain. { solution, salt } go to the backend.
const opening = { solution: { answer: "quarantine rpc-2; require second verifier" } };
const { salt, solutionCommitment } = createSolutionCommitment({ challengeId: reg.challengeId, wallet: player.address, solution: opening.solution });
opening.salt = salt;
const sub = await submitProof(playerContracts, reg.challengeId, solutionCommitment);
step("submitProof", sub);

// Access control: player cannot verify or pay themselves
await expectRevert("player verifySubmission", () => playerContracts.submissionRegistry.verifySubmission.staticCall(sub.submissionId));
await expectRevert("reward before verification", () => verifier.contracts.rewardVault.distributeReward.staticCall(sub.submissionId, REWARD));

// 3. Authorized verification
const ver = await verifier.verifySubmission(sub.submissionId, opening);
step("verifySubmission", ver);
await expectRevert("duplicate verification", () => verifier.contracts.submissionRegistry.verifySubmission.staticCall(sub.submissionId));
const state = await getSubmission(verifier.contracts, sub.submissionId);
if (state.statusName !== "Verified") throw new Error(`Unexpected status ${state.statusName}`);

// 4. Reward
await expectRevert("player distributeReward", () => playerContracts.rewardVault.distributeReward.staticCall(sub.submissionId, REWARD));
const before = await provider.getBalance(player.address);
const rew = await verifier.distributeReward(sub.submissionId, REWARD);
step("distributeReward", rew);
const after = await provider.getBalance(player.address);
if (after - before !== REWARD) throw new Error(`Player balance changed by ${after - before}, expected ${REWARD}`);
if (rew.recipient.toLowerCase() !== player.address.toLowerCase()) throw new Error("Reward recipient mismatch");
await expectRevert("duplicate reward", () => verifier.contracts.rewardVault.distributeReward.staticCall(sub.submissionId, REWARD));
const rs = await getRewardStatus(verifier.contracts, sub.submissionId);
console.log(`✔ reward state: rewarded=${rs.rewarded} amount=${formatEther(rs.amount)} tMSTC; player +${formatEther(after - before)}`);

// Return leftover gas money from an ephemeral player to the vault (keeps testnet funds controlled).
if (!process.env.PLAYER_PRIVATE_KEY) {
  const bal = await provider.getBalance(player.address);
  const fee = (await provider.getFeeData()).gasPrice * 60_000n;
  if (bal > fee) {
    const res = await sendAndConfirm(() => playerContracts.rewardVault.fund({ value: bal - fee }), { contract: playerContracts.rewardVault, event: "VaultFunded" });
    console.log(`✔ returned ${formatEther(bal - fee)} tMSTC from ephemeral player to vault (${res.hash})`);
  }
}

const out = { ranAt: new Date().toISOString(), challengeId: reg.challengeId, submissionId: sub.submissionId, player: player.address, reward: REWARD.toString(), steps: log };
const outFile = IS_LOCAL ? "localRehearsal.e2e.json" : "mstTestnet.e2e.json";
writeFileSync(new URL(`../deployments/${outFile}`, import.meta.url), JSON.stringify({ network: LABEL, ...out }, null, 2) + "\n");
console.log(`E2E flow on ${LABEL}: SUCCESS (recorded deployments/${outFile})`);
