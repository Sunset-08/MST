import { AbiCoder, Contract, getAddress, hexlify, id, keccak256, randomBytes, toUtf8Bytes, isHexString } from "ethers";
import { deployment } from "./generated/deployment.js";

export const ChallengeStatus = Object.freeze({ None: 0, Active: 1, Paused: 2, Retired: 3 });
export const SubmissionStatus = Object.freeze({ None: 0, Pending: 1, Verified: 2, Rejected: 3 });
const challengeStatusName = Object.keys(ChallengeStatus);
const submissionStatusName = Object.keys(SubmissionStatus);

export class ChainTxError extends Error {
  constructor(message, { hash, receipt, cause } = {}) {
    super(message);
    this.name = "ChainTxError";
    this.hash = hash;
    this.receipt = receipt;
    this.cause = cause;
  }
}

// ---------- hashing helpers ----------

/** bytes32 challenge ID from a human-readable slug; passes 0x-bytes32 values through. */
export const toChallengeId = (value) => (isHexString(value, 32) ? value : id(String(value)));

const canonicalize = (v) =>
  Array.isArray(v)
    ? `[${v.map(canonicalize).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalize(v[k])}`).join(",")}}`
      : JSON.stringify(v);

/** keccak256 of a string, or of a canonical (key-sorted) JSON encoding of an object. */
export const hashContent = (content) => keccak256(toUtf8Bytes(typeof content === "string" ? content : canonicalize(content)));

// ---------- proof commitments (solution + salt stay off-chain) ----------

const abi = AbiCoder.defaultAbiCoder();

const innerCommitment = (challengeId, wallet, solutionHash, salt) =>
  keccak256(abi.encode(["bytes32", "address", "bytes32", "bytes32"], [toChallengeId(challengeId), getAddress(wallet), solutionHash, salt]));

/**
 * Player side, before submitting: commits to challenge + wallet + solution + a secret random salt.
 * Send { solution, salt } to the backend over its API; submit only `solutionCommitment` on-chain.
 */
export function createSolutionCommitment({ challengeId, wallet, solution, salt = hexlify(randomBytes(32)) }) {
  if (!isHexString(salt, 32)) throw new Error("salt must be a 32-byte hex string");
  if (solution === undefined) throw new Error("solution is required");
  const solutionHash = hashContent(solution);
  return { solutionHash, salt, solutionCommitment: innerCommitment(challengeId, wallet, solutionHash, salt) };
}

/** Mirrors SubmissionRegistry.computeProofHash: binds the commitment to challenge + submitter wallet. */
export function computeProofHash(challengeId, submitter, solutionCommitment) {
  return keccak256(abi.encode(["bytes32", "address", "bytes32"], [toChallengeId(challengeId), getAddress(submitter), solutionCommitment]));
}

/**
 * Backend side, before verifying: true only if `opening` ({ solution, salt } or { solutionHash, salt })
 * reproduces the on-chain proofHash for THIS submission's challenge and submitter wallet.
 * A commitment copied by another wallet can never pass.
 */
export function checkProofOpening(submission, opening) {
  if (!submission || !opening?.salt || !isHexString(opening.salt, 32)) return false;
  const solutionHash = opening.solutionHash ?? (opening.solution !== undefined ? hashContent(opening.solution) : null);
  if (!solutionHash) return false;
  const commitment = innerCommitment(submission.challengeId, submission.submitter, solutionHash, opening.salt);
  return computeProofHash(submission.challengeId, submission.submitter, commitment) === submission.proofHash;
}

// ---------- contract instances ----------

/**
 * Returns ethers Contract instances bound to a runner (signer or provider).
 * `addresses` defaults to the recorded MST Testnet deployment.
 */
export function getContracts(runner, addresses = deployment.addresses) {
  for (const name of ["ChallengeRegistry", "SubmissionRegistry", "RewardVault"]) {
    if (!addresses?.[name]) throw new Error(`${name} address missing: contracts are not deployed/recorded for this network.`);
  }
  return {
    challengeRegistry: new Contract(getAddress(addresses.ChallengeRegistry), deployment.abis.ChallengeRegistry, runner),
    submissionRegistry: new Contract(getAddress(addresses.SubmissionRegistry), deployment.abis.SubmissionRegistry, runner),
    rewardVault: new Contract(getAddress(addresses.RewardVault), deployment.abis.RewardVault, runner),
  };
}

// ---------- transactions ----------

/** Decodes all logs in a receipt emitted by `contract` (optionally only `eventName`). */
export function parseEvents(receipt, contract, eventName) {
  const target = String(contract.target).toLowerCase();
  const out = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== target) continue;
    let parsed;
    try {
      parsed = contract.interface.parseLog(log);
    } catch {
      continue;
    }
    if (parsed && (!eventName || parsed.name === eventName)) out.push(parsed);
  }
  return out;
}

/** Best-effort decoding of a contract custom error for a readable message. */
function describeError(err, contract) {
  const data = err?.data ?? err?.info?.error?.data ?? err?.error?.data;
  if (contract && typeof data === "string") {
    try {
      const parsed = contract.interface.parseError(data);
      if (parsed) return `${parsed.name}(${parsed.args.map(String).join(", ")})`;
    } catch {
      /* not a known error */
    }
  }
  return err?.revert?.name ?? err?.shortMessage ?? err?.reason ?? err?.message ?? String(err);
}

/**
 * Sends a transaction and only resolves once it is mined with status 1 AND the expected
 * event is present in the receipt. A tx hash alone is never treated as success.
 */
export async function sendAndConfirm(send, { contract, event, match, confirmations = 1, timeoutMs = 180_000 }) {
  let tx;
  try {
    tx = await send();
  } catch (err) {
    throw new ChainTxError(`Transaction rejected before mining: ${describeError(err, contract)}`, { cause: err });
  }
  let receipt;
  try {
    receipt = await tx.wait(confirmations, timeoutMs);
  } catch (err) {
    throw new ChainTxError(`Transaction ${tx.hash} failed: ${describeError(err, contract)}`, { hash: tx.hash, receipt: err?.receipt, cause: err });
  }
  if (!receipt || receipt.status !== 1) {
    throw new ChainTxError(`Transaction ${tx.hash} reverted.`, { hash: tx.hash, receipt });
  }
  const events = parseEvents(receipt, contract, event).filter((e) => !match || match(e));
  if (!events.length) {
    throw new ChainTxError(`Transaction ${tx.hash} mined but expected ${event} event was not emitted.`, { hash: tx.hash, receipt });
  }
  return { hash: tx.hash, blockNumber: receipt.blockNumber, receipt, event: events[0] };
}

const ZERO_HASH = "0x" + "0".repeat(64);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

async function assertState(check, message) {
  if (!(await check())) throw new ChainTxError(message);
}

// ---------- reads ----------

export async function getChallenge(contracts, challengeId) {
  const cid = toChallengeId(challengeId);
  if (!(await contracts.challengeRegistry.exists(cid))) return null;
  const c = await contracts.challengeRegistry.getChallenge(cid);
  return {
    challengeId: cid,
    contentHash: c.contentHash,
    status: Number(c.status),
    statusName: challengeStatusName[Number(c.status)],
    registrar: c.registrar,
    owner: c.registrar,
    registeredAt: Number(c.registeredAt),
  };
}

export async function computeSubmissionId(contracts, challengeId, submitter, proofHash) {
  return contracts.submissionRegistry.computeSubmissionId(toChallengeId(challengeId), getAddress(submitter), proofHash);
}

export async function getSubmission(contracts, submissionId) {
  const status = Number(await contracts.submissionRegistry.getStatus(submissionId));
  if (status === SubmissionStatus.None) return null;
  const s = await contracts.submissionRegistry.getSubmission(submissionId);
  return {
    submissionId,
    challengeId: s.challengeId,
    submitter: s.submitter,
    proofHash: s.proofHash,
    status,
    statusName: submissionStatusName[status],
    submittedAt: Number(s.submittedAt),
    reviewedAt: Number(s.reviewedAt),
    verifier: s.verifier,
  };
}

export async function getRewardStatus(contracts, submissionId) {
  const [rewarded, amount] = await Promise.all([
    contracts.rewardVault.isRewarded(submissionId),
    contracts.rewardVault.rewardOf(submissionId),
  ]);
  return { rewarded, amount };
}

export async function getVaultInfo(contracts) {
  const [balance, maxRewardPerSubmission, totalDistributed] = await Promise.all([
    contracts.rewardVault.vaultBalance(),
    contracts.rewardVault.maxRewardPerSubmission(),
    contracts.rewardVault.totalDistributed(),
  ]);
  return { balance, maxRewardPerSubmission, totalDistributed };
}

export async function getRoles(contracts, account) {
  const { challengeRegistry: c, submissionRegistry: s, rewardVault: v } = contracts;
  const [challengeAdmin, verifier, rewardDistributor, vaultAdmin] = await Promise.all([
    c.hasRole(await c.CHALLENGE_ADMIN_ROLE(), account),
    s.hasRole(await s.VERIFIER_ROLE(), account),
    v.hasRole(await v.REWARD_DISTRIBUTOR_ROLE(), account),
    v.hasRole(await v.DEFAULT_ADMIN_ROLE(), account),
  ]);
  return { challengeAdmin, verifier, rewardDistributor, vaultAdmin };
}

// ---------- backend integration: trusted verification trigger (points/leaderboard stay off-chain) ----------

/**
 * One joined on-chain record: challenge -> submission -> player wallet -> verification result -> reward.
 * `verified` is true only for status Verified (a Pending attempt or a Rejected one is never verified).
 * Returns null if the submission does not exist on-chain.
 */
export async function getVerificationRecord(contracts, submissionId) {
  const s = await getSubmission(contracts, submissionId);
  if (!s) return null;
  const { rewarded, amount } = await getRewardStatus(contracts, submissionId);
  return { ...s, verified: s.status === SubmissionStatus.Verified, rewarded, rewardAmount: amount };
}

/**
 * Validates a verification tx hash before the backend acts on it: the receipt must exist with
 * status 1, contain SubmissionVerified from the recorded SubmissionRegistry (optionally for
 * `expectedSubmissionId`), and the submission must currently read as Verified on-chain.
 */
export async function confirmVerificationTx(contracts, txHash, { expectedSubmissionId, minConfirmations = 1 } = {}) {
  const registry = contracts.submissionRegistry;
  const provider = registry.runner?.provider ?? registry.runner;
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) throw new ChainTxError(`Transaction ${txHash} is not mined (no receipt).`, { hash: txHash });
  if (receipt.status !== 1) throw new ChainTxError(`Transaction ${txHash} reverted.`, { hash: txHash, receipt });
  // Compute from a fresh "latest" block: ethers' cached block number can lag a just-mined receipt.
  const latest = await provider.getBlock("latest");
  const confirmations = Math.max(1, latest.number - receipt.blockNumber + 1);
  if (confirmations < minConfirmations) {
    throw new ChainTxError(`Transaction ${txHash} has ${confirmations}/${minConfirmations} confirmations.`, { hash: txHash, receipt });
  }
  const events = parseEvents(receipt, registry, "SubmissionVerified").filter(
    (e) => !expectedSubmissionId || e.args.submissionId === expectedSubmissionId
  );
  if (!events.length) throw new ChainTxError(`Transaction ${txHash} has no matching SubmissionVerified event.`, { hash: txHash, receipt });
  const record = await getVerificationRecord(contracts, events[0].args.submissionId);
  if (!record?.verified) throw new ChainTxError(`Submission ${events[0].args.submissionId} is not Verified on-chain.`, { hash: txHash, receipt });
  return { txHash, blockNumber: receipt.blockNumber, confirmations, ...record };
}

/**
 * SubmissionVerified events in a block range, for backend catch-up (e.g. after a restart
 * between on-chain verification and point awarding). Keep ranges modest for public RPCs.
 */
export async function getVerifiedSubmissionEvents(contracts, { fromBlock = 0, toBlock = "latest", challengeId, submitter } = {}) {
  const registry = contracts.submissionRegistry;
  const filter = registry.filters.SubmissionVerified(null, challengeId ? toChallengeId(challengeId) : null, submitter ?? null);
  const logs = await registry.queryFilter(filter, fromBlock, toBlock);
  return logs.map((l) => ({
    submissionId: l.args.submissionId,
    challengeId: l.args.challengeId,
    submitter: l.args.submitter,
    verifier: l.args.verifier,
    verifiedAt: Number(l.args.timestamp),
    txHash: l.transactionHash,
    blockNumber: l.blockNumber,
  }));
}

// ---------- writes (each confirms receipt + event + resulting state) ----------

/** Challenge-admin only. */
export async function registerChallenge(contracts, challengeId, contentHash) {
  const cid = toChallengeId(challengeId);
  const res = await sendAndConfirm(() => contracts.challengeRegistry.registerChallenge(cid, contentHash), {
    contract: contracts.challengeRegistry,
    event: "ChallengeRegistered",
    match: (e) => e.args.challengeId === cid && e.args.contentHash === contentHash,
  });
  await assertState(async () => (await getChallenge(contracts, cid))?.contentHash === contentHash, `Challenge ${cid} not readable after registration.`);
  return { ...res, challengeId: cid };
}

/** Challenge owner (with CHALLENGE_ADMIN_ROLE) or DEFAULT_ADMIN_ROLE only. */
export async function setChallengeStatus(contracts, challengeId, status) {
  const cid = toChallengeId(challengeId);
  const res = await sendAndConfirm(() => contracts.challengeRegistry.setChallengeStatus(cid, status), {
    contract: contracts.challengeRegistry,
    event: "ChallengeStatusChanged",
    match: (e) => e.args.challengeId === cid && Number(e.args.newStatus) === Number(status),
  });
  await assertState(async () => (await getChallenge(contracts, cid))?.status === Number(status), `Challenge ${cid} status not updated.`);
  return { ...res, challengeId: cid };
}

/**
 * Called with the player's wallet signer, only on an explicit user action.
 * `solutionCommitment` comes from createSolutionCommitment(); the contract binds it to challenge + wallet.
 */
export async function submitProof(contracts, challengeId, solutionCommitment) {
  const cid = toChallengeId(challengeId);
  const submitter = await contracts.submissionRegistry.runner.getAddress();
  const proofHash = computeProofHash(cid, submitter, solutionCommitment);
  const res = await sendAndConfirm(() => contracts.submissionRegistry.submitProof(cid, solutionCommitment), {
    contract: contracts.submissionRegistry,
    event: "SubmissionRecorded",
    match: (e) => e.args.challengeId === cid && same(e.args.submitter, submitter) && e.args.proofHash === proofHash,
  });
  const submissionId = res.event.args.submissionId;
  await assertState(
    async () => (await getSubmission(contracts, submissionId))?.status === SubmissionStatus.Pending,
    `Submission ${submissionId} not pending on-chain after submitProof.`
  );
  return { ...res, submissionId, submitter, proofHash };
}

/**
 * Verifier role only (server side). Requires the player's off-chain opening ({ solution, salt })
 * and refuses to send unless it matches this submission's on-chain proofHash. The contract also
 * rejects self-verification, inactive challenges, reviewed submissions and repeat completions.
 */
export async function verifySubmission(contracts, submissionId, opening) {
  const current = await getSubmission(contracts, submissionId);
  if (!current) throw new ChainTxError(`Submission ${submissionId} does not exist on-chain.`);
  if (current.status !== SubmissionStatus.Pending) throw new ChainTxError(`Submission ${submissionId} already ${current.statusName}.`);
  if (!checkProofOpening(current, opening)) {
    throw new ChainTxError(`ProofMismatch: opening does not match submission ${submissionId} for wallet ${current.submitter}.`);
  }
  const verifierAddress = await contracts.submissionRegistry.runner.getAddress();
  if (same(verifierAddress, current.submitter)) throw new ChainTxError(`SelfVerification: ${verifierAddress} cannot verify its own submission.`);
  if (!(await contracts.challengeRegistry.isActive(current.challengeId))) throw new ChainTxError(`ChallengeNotActive: ${current.challengeId}.`);
  const completed = await contracts.submissionRegistry.completionOf(current.challengeId, current.submitter);
  if (completed !== ZERO_HASH) throw new ChainTxError(`AlreadyCompleted: ${current.submitter} already completed this challenge (${completed}).`);
  const res = await sendAndConfirm(() => contracts.submissionRegistry.verifySubmission(submissionId), {
    contract: contracts.submissionRegistry,
    event: "SubmissionVerified",
    match: (e) => e.args.submissionId === submissionId,
  });
  await assertState(() => contracts.submissionRegistry.isVerified(submissionId), `Submission ${submissionId} not verified on-chain after tx.`);
  return { ...res, submissionId, submitter: current.submitter };
}

/** Verifier role only (server side). */
export async function rejectSubmission(contracts, submissionId) {
  const res = await sendAndConfirm(() => contracts.submissionRegistry.rejectSubmission(submissionId), {
    contract: contracts.submissionRegistry,
    event: "SubmissionRejected",
    match: (e) => e.args.submissionId === submissionId,
  });
  await assertState(
    async () => Number(await contracts.submissionRegistry.getStatus(submissionId)) === SubmissionStatus.Rejected,
    `Submission ${submissionId} not rejected on-chain after tx.`
  );
  return { ...res, submissionId };
}

/** Reward-distributor role only (server side). Pays the verified submitter from the vault. */
export async function distributeReward(contracts, submissionId, amountWei) {
  const amount = BigInt(amountWei);
  if (!(await contracts.submissionRegistry.isVerified(submissionId))) throw new ChainTxError(`Submission ${submissionId} is not verified.`);
  if (await contracts.rewardVault.isRewarded(submissionId)) throw new ChainTxError(`Submission ${submissionId} already rewarded.`);
  const res = await sendAndConfirm(() => contracts.rewardVault.distributeReward(submissionId, amount), {
    contract: contracts.rewardVault,
    event: "RewardDistributed",
    match: (e) => e.args.submissionId === submissionId && e.args.amount === amount,
  });
  await assertState(async () => (await contracts.rewardVault.rewardOf(submissionId)) === amount, `Reward for ${submissionId} not recorded after tx.`);
  return { ...res, submissionId, recipient: res.event.args.recipient, amount };
}
