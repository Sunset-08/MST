import { createHmac } from "node:crypto";
import { AbiCoder, Contract, JsonRpcProvider, Wallet, formatEther, getAddress, id as keccakId, keccak256, toUtf8Bytes, type ContractTransactionReceipt, type Log } from "ethers";
import type { AppConfig } from "../../config/env.js";
import { canonicalJson } from "../../utils/crypto.js";
import challengeRegistryAbi from "./abis/ChallengeRegistry.json";
import rewardVaultAbi from "./abis/RewardVault.json";
import submissionRegistryAbi from "./abis/SubmissionRegistry.json";
import { ClaimError, type ChainTx, type ClaimInput, type ClaimPreparation, type ClaimReadiness, type ClaimResult, type RewardClaimProvider } from "./claims.js";
import type { ProviderStatus } from "./types.js";

const abiCoder = AbiCoder.defaultAbiCoder();
const ZERO_HASH = `0x${"0".repeat(64)}`;

// SubmissionRegistry.SubmissionStatus
const SUBMISSION_PENDING = 1n;
const SUBMISSION_VERIFIED = 2n;
const SUBMISSION_REJECTED = 3n;
// ChallengeRegistry.ChallengeStatus.Active
const CHALLENGE_ACTIVE = 1n;

const SUBMIT_PROOF_ABI = (submissionRegistryAbi as { type: string; name?: string }[]).filter((f) => f.type === "function" && f.name === "submitProof");

/** bytes32 challenge id used on-chain for a database challenge. */
export const onchainChallengeId = (dbChallengeId: string) => keccakId(`securex:challenge:${dbChallengeId}`);

const hashContent = (content: unknown) => keccak256(toUtf8Bytes(canonicalJson(content)));

export interface ClaimHashes {
  challengeId: string;
  solutionHash: string;
  salt: string;
  solutionCommitment: string;
  proofHash: string;
  onchainSubmissionId: string;
}

/**
 * Deterministic commitment for a verified submission. The salt is derived from a server secret, so the backend can
 * always reproduce the opening, while nobody else can open or guess the commitment.
 */
export function deriveClaimHashes(secret: string, input: Pick<ClaimInput, "submissionId" | "challengeId" | "submissionData" | "recipientAddress">): ClaimHashes {
  const wallet = getAddress(input.recipientAddress);
  const challengeId = onchainChallengeId(input.challengeId);
  const solutionHash = hashContent(input.submissionData);
  const salt = `0x${createHmac("sha256", secret).update(`securex:claim-salt:${input.submissionId}`).digest("hex")}`;
  const solutionCommitment = keccak256(abiCoder.encode(["bytes32", "address", "bytes32", "bytes32"], [challengeId, wallet, solutionHash, salt]));
  const proofHash = keccak256(abiCoder.encode(["bytes32", "address", "bytes32"], [challengeId, wallet, solutionCommitment]));
  const onchainSubmissionId = keccak256(abiCoder.encode(["bytes32", "address", "bytes32"], [challengeId, wallet, proofHash]));
  return { challengeId, solutionHash, salt, solutionCommitment, proofHash, onchainSubmissionId };
}

interface Overrides { provider?: JsonRpcProvider; signer?: Wallet }

export class MstRewardClaims implements RewardClaimProvider {
  private readonly provider?: JsonRpcProvider;
  private signer?: Wallet;
  private chainVerified = false;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly inflight = new Map<string, Promise<ClaimResult>>();

  constructor(private readonly cfg: AppConfig["mst"], private readonly secret: string | undefined, overrides: Overrides = {}) {
    this.provider = overrides.provider;
    this.signer = overrides.signer;
  }

  status(): ProviderStatus & { claimsConfigured: boolean } {
    const c = this.cfg;
    const missing = [
      !c.rpcUrl && "MST_RPC_URL",
      !c.chainId && "MST_CHAIN_ID",
      !c.challengeRegistryAddress && "MST_CHALLENGE_REGISTRY_ADDRESS",
      !c.submissionRegistryAddress && "MST_SUBMISSION_REGISTRY_ADDRESS",
      !c.rewardContractAddress && "MST_REWARD_CONTRACT_ADDRESS",
      !c.verifierPrivateKey && "MST_VERIFIER_PRIVATE_KEY",
      !this.secret && "APP_SIGNING_SECRET",
    ].filter(Boolean) as string[];
    const claimsConfigured = missing.length === 0;
    return {
      configured: claimsConfigured,
      canSend: claimsConfigured,
      canReadTransactions: Boolean(c.rpcUrl && c.chainId),
      claimsConfigured,
      reason: claimsConfigured ? undefined : `blockchain not configured: missing ${missing.join(", ")}`,
      network: c.network,
      chainId: c.chainId,
      explorerUrl: c.explorerUrl,
    };
  }

  private setup() {
    const s = this.status();
    if (!s.claimsConfigured) throw new ClaimError("BLOCKCHAIN_NOT_CONFIGURED", s.reason ?? "blockchain not configured", 503);
    const provider = this.provider ?? new JsonRpcProvider(this.cfg.rpcUrl!, this.cfg.chainId!, { staticNetwork: true, cacheTimeout: -1 });
    this.signer ??= new Wallet(this.cfg.verifierPrivateKey!, provider);
    return {
      provider,
      signer: this.signer,
      challenges: new Contract(getAddress(this.cfg.challengeRegistryAddress!), challengeRegistryAbi, this.signer),
      submissions: new Contract(getAddress(this.cfg.submissionRegistryAddress!), submissionRegistryAbi, this.signer),
      vault: new Contract(getAddress(this.cfg.rewardContractAddress!), rewardVaultAbi, this.signer),
    };
  }

  private async ready() {
    const ctx = this.setup();
    if (!this.chainVerified) {
      const actual = Number(BigInt(await ctx.provider.send("eth_chainId", [])));
      if (actual !== this.cfg.chainId) throw new ClaimError("WRONG_CHAIN", `MST RPC serves chain ${actual}, expected ${this.cfg.chainId}`, 503);
      this.chainVerified = true;
    }
    return ctx;
  }

  /** All transactions signed by the server key run one at a time so nonces never collide. */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private amountWei(amount: number): bigint {
    return BigInt(amount) * BigInt(this.cfg.rewardWeiPerUnit);
  }

  async prepare(input: ClaimInput): Promise<ClaimPreparation> {
    const { challenges, submissions, vault, signer } = await this.ready();
    const wallet = getAddress(input.recipientAddress);
    const idHash = onchainChallengeId(input.challengeId);
    const amountWei = this.amountWei(input.amount);
    if (getAddress(await signer.getAddress()) === wallet) {
      throw new ClaimError("VERIFIER_WALLET_CANNOT_CLAIM", "The platform verifier wallet cannot claim rewards; link a different wallet");
    }

    const [max, balance] = await Promise.all([vault.maxRewardPerSubmission() as Promise<bigint>, vault.vaultBalance() as Promise<bigint>]);
    if (amountWei > max) {
      throw new ClaimError("REWARD_ABOVE_VAULT_CAP", `This reward is ${formatEther(amountWei)} MSTC but the reward vault pays at most ${formatEther(max)} MSTC per submission. The platform admin must raise the vault cap.`);
    }
    if (amountWei > balance) {
      throw new ClaimError("REWARD_VAULT_UNDERFUNDED", `This reward is ${formatEther(amountWei)} MSTC but the reward vault holds only ${formatEther(balance)} MSTC. The platform admin must fund the vault.`, 503);
    }

    let registrationTx: string | undefined;
    if (!(await challenges.exists(idHash))) {
      registrationTx = await this.serialize(async () => {
        const tx = await challenges.registerChallenge(idHash, hashContent({ challengeId: input.challengeId, title: input.challengeTitle, updatedAt: input.challengeUpdatedAt }));
        const receipt = (await tx.wait()) as ContractTransactionReceipt;
        if (receipt.status !== 1) throw new ClaimError("CHALLENGE_REGISTRATION_FAILED", "Registering the challenge on-chain failed", 502);
        return receipt.hash;
      }).catch((e) => { throw asClaimError(e, "The platform could not register this challenge on-chain (the verifier key needs CHALLENGE_ADMIN_ROLE)"); });
    }
    const challenge = await challenges.getChallenge(idHash);
    if (BigInt(challenge.status) !== CHALLENGE_ACTIVE) throw new ClaimError("CHALLENGE_NOT_ACTIVE_ONCHAIN", "This challenge is not active on-chain");

    const completed = (await submissions.completionOf(idHash, wallet)) as string;
    if (completed !== ZERO_HASH) throw new ClaimError("ALREADY_COMPLETED_ONCHAIN", "This wallet already completed this challenge on-chain");

    const hashes = deriveClaimHashes(this.secret!, input);
    return {
      chainId: this.cfg.chainId!,
      submissionRegistryAddress: getAddress(this.cfg.submissionRegistryAddress!),
      challengeId: hashes.challengeId,
      solutionCommitment: hashes.solutionCommitment,
      abi: SUBMIT_PROOF_ABI,
      functionName: "submitProof",
      amountWei: amountWei.toString(),
      ...(registrationTx ? { registrationTx } : {}),
    };
  }

  async readiness(): Promise<ClaimReadiness> {
    const { provider, signer, challenges, submissions, vault } = await this.ready();
    const address = getAddress(await signer.getAddress());
    const [signerBalance, vaultBalance, max, distributed, adminRole, distributorRole, verifierRole, challengeAdminRole] = await Promise.all([
      provider.getBalance(address), vault.vaultBalance() as Promise<bigint>, vault.maxRewardPerSubmission() as Promise<bigint>, vault.totalDistributed() as Promise<bigint>,
      vault.DEFAULT_ADMIN_ROLE() as Promise<string>, vault.REWARD_DISTRIBUTOR_ROLE() as Promise<string>,
      submissions.VERIFIER_ROLE() as Promise<string>, challenges.CHALLENGE_ADMIN_ROLE() as Promise<string>,
    ]);
    const [vaultAdmin, rewardDistributor, verifier, challengeAdmin] = await Promise.all([
      vault.hasRole(adminRole, address) as Promise<boolean>, vault.hasRole(distributorRole, address) as Promise<boolean>,
      submissions.hasRole(verifierRole, address) as Promise<boolean>, challenges.hasRole(challengeAdminRole, address) as Promise<boolean>,
    ]);
    return {
      signer: address, signerBalanceWei: signerBalance.toString(),
      signerRoles: { vaultAdmin, rewardDistributor, verifier, challengeAdmin },
      vault: { address: getAddress(this.cfg.rewardContractAddress!), balanceWei: vaultBalance.toString(), maxRewardWei: max.toString(), totalDistributedWei: distributed.toString() },
      rewardWeiPerUnit: this.cfg.rewardWeiPerUnit,
    };
  }

  fundVault(amountWei: bigint): Promise<ChainTx> {
    return this.serialize(async () => {
      const { vault } = await this.ready();
      const tx = await vault.fund({ value: amountWei });
      const receipt = (await tx.wait()) as ContractTransactionReceipt;
      if (receipt.status !== 1) throw new ClaimError("VAULT_FUNDING_FAILED", "The vault funding transaction reverted", 502);
      return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
    }).catch((e) => { throw asClaimError(e, "Funding the vault failed"); });
  }

  setMaxReward(maxRewardWei: bigint): Promise<ChainTx> {
    return this.serialize(async () => {
      const { vault } = await this.ready();
      const tx = await vault.setMaxRewardPerSubmission(maxRewardWei);
      const receipt = (await tx.wait()) as ContractTransactionReceipt;
      if (receipt.status !== 1) throw new ClaimError("VAULT_CONFIG_FAILED", "The vault configuration transaction reverted", 502);
      return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
    }).catch((e) => { throw asClaimError(e, "Updating the vault cap failed"); });
  }

  complete(input: ClaimInput & { txHash: string }): Promise<ClaimResult> {
    // One claim per reward at a time within this process.
    const existing = this.inflight.get(input.rewardId);
    if (existing) return existing;
    const run = this.doComplete(input).finally(() => this.inflight.delete(input.rewardId));
    this.inflight.set(input.rewardId, run);
    return run;
  }

  private async doComplete(input: ClaimInput & { txHash: string }): Promise<ClaimResult> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) throw new ClaimError("INVALID_TX_HASH", "Invalid transaction hash", 400);
    const { provider, challenges, submissions, vault } = await this.ready();
    const wallet = getAddress(input.recipientAddress);
    const hashes = deriveClaimHashes(this.secret!, input);
    const amountWei = this.amountWei(input.amount);

    // 1. The participant's on-chain proof: mined, successful, and recorded for THIS wallet + commitment.
    const receipt = await provider.getTransactionReceipt(input.txHash);
    if (!receipt) throw new ClaimError("TX_NOT_MINED", "That transaction has not been mined yet");
    if (receipt.status !== 1) throw new ClaimError("TX_REVERTED", "That transaction reverted on-chain");
    const recorded = parseLogs(receipt.logs, submissions, "SubmissionRecorded").find(
      (e) => e.args.challengeId === hashes.challengeId && getAddress(e.args.submitter) === wallet && e.args.proofHash === hashes.proofHash,
    );
    if (!recorded) throw new ClaimError("PROOF_EVENT_MISSING", "The transaction did not record the expected proof for your wallet and this challenge", 400);
    const submissionId = recorded.args.submissionId as string;
    if (submissionId !== hashes.onchainSubmissionId) throw new ClaimError("PROOF_MISMATCH", "On-chain submission id does not match the expected value", 400);

    // 2. On-chain verification by the platform verifier (skipped if a previous attempt already verified it).
    let status = BigInt(await submissions.getStatus(submissionId));
    let verificationTx: string | null = null;
    if (status === SUBMISSION_REJECTED) throw new ClaimError("ONCHAIN_REJECTED", "This submission was rejected on-chain");
    if (status === SUBMISSION_PENDING) {
      verificationTx = await this.serialize(async () => {
        const tx = await submissions.verifySubmission(submissionId);
        const r = (await tx.wait()) as ContractTransactionReceipt;
        if (r.status !== 1 || !parseLogs(r.logs, submissions, "SubmissionVerified").some((e) => e.args.submissionId === submissionId)) {
          throw new ClaimError("VERIFICATION_FAILED", "On-chain verification did not complete", 502);
        }
        return r.hash;
      }).catch((e) => { throw asClaimError(e, "On-chain verification failed"); });
      status = BigInt(await submissions.getStatus(submissionId));
    }
    if (status !== SUBMISSION_VERIFIED) throw new ClaimError("NOT_VERIFIED_ONCHAIN", "The submission is not verified on-chain");
    void challenges;

    // 3. Reward from the vault to the verified submitter (idempotent: an already paid submission returns its payout).
    if (await vault.isRewarded(submissionId)) {
      const logs = await vault.queryFilter(vault.filters.RewardDistributed(submissionId));
      const paid = logs.at(-1);
      if (!paid) throw new ClaimError("REWARD_STATE_UNKNOWN", "Reward is marked paid on-chain but its event could not be found", 502);
      return { onchainSubmissionId: submissionId, verificationTx, rewardTx: paid.transactionHash, rewardBlock: paid.blockNumber, contractAddress: getAddress(this.cfg.rewardContractAddress!), amountWei: String(await vault.rewardOf(submissionId)), recipient: wallet };
    }
    const payout = await this.serialize(async () => {
      const tx = await vault.distributeReward(submissionId, amountWei);
      const r = (await tx.wait()) as ContractTransactionReceipt;
      const paid = parseLogs(r.logs, vault, "RewardDistributed").find((e) => e.args.submissionId === submissionId && getAddress(e.args.recipient) === wallet && e.args.amount === amountWei);
      if (r.status !== 1 || !paid) throw new ClaimError("REWARD_FAILED", "The reward transaction did not emit the expected RewardDistributed event", 502);
      return r;
    }).catch((e) => { throw asClaimError(e, "Reward distribution failed"); });

    return { onchainSubmissionId: submissionId, verificationTx, rewardTx: payout.hash, rewardBlock: payout.blockNumber, contractAddress: getAddress(this.cfg.rewardContractAddress!), amountWei: amountWei.toString(), recipient: wallet };
  }
}

function parseLogs(logs: readonly Log[], contract: Contract, name: string) {
  const target = String(contract.target).toLowerCase();
  const out: { args: Record<string, any> & { [i: number]: any } }[] = [];
  for (const log of logs) {
    if (log.address.toLowerCase() !== target) continue;
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === name) out.push({ args: parsed.args as never });
    } catch { /* not one of ours */ }
  }
  return out;
}

/** Turns contract reverts and RPC failures into stable, safe claim errors. */
function asClaimError(error: unknown, fallback: string): ClaimError {
  if (error instanceof ClaimError) return error;
  const e = error as { revert?: { name?: string }; shortMessage?: string; code?: string };
  const name = e?.revert?.name;
  switch (name) {
    case "SelfVerification": return new ClaimError("VERIFIER_WALLET_CANNOT_CLAIM", "The platform verifier wallet cannot verify its own submission; link a different wallet");
    case "AlreadyCompleted": return new ClaimError("ALREADY_COMPLETED_ONCHAIN", "This wallet already completed this challenge on-chain");
    case "ChallengeNotActive": return new ClaimError("CHALLENGE_NOT_ACTIVE_ONCHAIN", "This challenge is not active on-chain");
    case "AlreadyRewarded": return new ClaimError("ALREADY_REWARDED", "This submission was already rewarded on-chain");
    case "RewardAboveMax": return new ClaimError("REWARD_ABOVE_VAULT_CAP", "Reward exceeds the vault's per-submission cap");
    case "InsufficientVaultBalance": return new ClaimError("REWARD_VAULT_UNDERFUNDED", "The reward vault does not hold enough funds", 503);
    case "AccessControlUnauthorizedAccount": return new ClaimError("VERIFIER_NOT_AUTHORIZED", "The platform verifier key lacks the required contract role", 503);
    default: return new ClaimError("CHAIN_ERROR", name ? `${fallback} (${name})` : fallback, 502);
  }
}
