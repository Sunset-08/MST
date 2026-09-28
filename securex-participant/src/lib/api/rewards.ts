import type { Reward } from '@/lib/types';
import { apiGet, apiPost } from './client';

export interface ClaimInfo {
  rewardId: string;
  walletAddress: string;
  chainId: number;
  submissionRegistryAddress: `0x${string}`;
  /** bytes32 values for SubmissionRegistry.submitProof(challengeId, solutionCommitment). */
  challengeId: `0x${string}`;
  solutionCommitment: `0x${string}`;
  abi: readonly unknown[];
  functionName: 'submitProof';
  amountWei: string;
}

export interface ClaimResponse {
  reward: Reward;
  onchainSubmissionId: string;
  verificationTx: string | null;
  proofTx: string;
  rewardTx: string;
}

export const getClaimInfo = (rewardId: string) => apiGet<ClaimInfo>(`/rewards/${rewardId}/claim-info`);
export const submitClaim = (rewardId: string, txHash: string) => apiPost<ClaimResponse>(`/rewards/${rewardId}/claim`, { txHash });
