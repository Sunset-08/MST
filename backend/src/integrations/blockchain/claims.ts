/**
 * MST reward claims through the deployed SECUREX contracts (ChallengeRegistry, SubmissionRegistry, RewardVault).
 *
 * The RewardVault pays only a wallet whose on-chain submission was verified, and the submitter of a submission is
 * always the wallet that signed the submitProof transaction. So an MST reward is claimed in two steps:
 *   1. prepare(): the backend derives a solution commitment bound to challenge + wallet + the verified solution,
 *      and the participant's wallet submits it on-chain (an explicit wallet transaction).
 *   2. complete(): the backend confirms that transaction, verifies the submission on-chain with its verifier key,
 *      and distributes the reward from the vault to that wallet.
 */
import type { ProviderStatus } from "./types.js";

export interface ClaimInput {
  rewardId: string;
  submissionId: string;
  /** Database challenge id; the on-chain id is derived from it. */
  challengeId: string;
  challengeTitle: string;
  challengeUpdatedAt: string;
  /** The verified submission content that the on-chain proof commits to. */
  submissionData: unknown;
  recipientAddress: string;
  /** Whole MST units as stored in rewards.amount. */
  amount: number;
}

export interface ClaimPreparation {
  chainId: number;
  submissionRegistryAddress: string;
  /** bytes32 challenge id to pass to submitProof. */
  challengeId: string;
  /** bytes32 solution commitment to pass to submitProof. */
  solutionCommitment: string;
  /** Minimal ABI for the wallet call. */
  abi: unknown[];
  functionName: "submitProof";
  amountWei: string;
  /** Present when the challenge had to be registered on-chain to make this claim possible. */
  registrationTx?: string;
}

export interface ClaimResult {
  onchainSubmissionId: string;
  verificationTx: string | null;
  rewardTx: string;
  rewardBlock: number;
  contractAddress: string;
  amountWei: string;
  recipient: string;
}

export class ClaimError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = "ClaimError";
  }
}

/** Non-secret state of the platform signer and the reward vault, so an operator can see why payouts would fail. */
export interface ClaimReadiness {
  signer: string;
  signerBalanceWei: string;
  signerRoles: { vaultAdmin: boolean; rewardDistributor: boolean; verifier: boolean; challengeAdmin: boolean };
  vault: { address: string; balanceWei: string; maxRewardWei: string; totalDistributedWei: string };
  rewardWeiPerUnit: string;
}

export interface ChainTx { transactionHash: string; blockNumber: number }

export interface RewardClaimProvider {
  status(): ProviderStatus & { claimsConfigured: boolean };
  prepare(input: ClaimInput): Promise<ClaimPreparation>;
  complete(input: ClaimInput & { txHash: string }): Promise<ClaimResult>;
  readiness(): Promise<ClaimReadiness>;
  /** Sends `amountWei` from the platform signer wallet into the RewardVault (awaits the receipt). */
  fundVault(amountWei: bigint): Promise<ChainTx>;
  /** Sets the vault's per-submission cap (needs the vault admin role). */
  setMaxReward(maxRewardWei: bigint): Promise<ChainTx>;
}
