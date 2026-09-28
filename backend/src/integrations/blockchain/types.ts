/**
 * Boundary between the reward domain and an MST blockchain implementation.
 * The reward domain only depends on this interface.
 */
export interface RewardInput {
  rewardId: string;
  submissionId: string;
  challengeId: string;
  recipientAddress: string;
  /** Whole MST units as stored in `rewards.amount`. */
  amount: number;
  token: string;
  network: string;
}

export interface RewardTransaction {
  transactionHash: string;
  contractAddress?: string;
}

export type TransactionStatus = "pending" | "confirmed" | "failed" | "not_found";

export interface ProviderStatus {
  configured: boolean;
  canSend: boolean;
  canReadTransactions: boolean;
  reason?: string;
  network?: string;
  chainId?: number;
  explorerUrl?: string;
}

export interface BlockchainRewardProvider {
  status(): ProviderStatus;
  /** Must throw BlockchainNotConfiguredError when sending is not possible. Never returns a fake hash. */
  sendReward(input: RewardInput): Promise<RewardTransaction>;
  getTransactionStatus(txHash: string): Promise<TransactionStatus>;
}

export class BlockchainNotConfiguredError extends Error {
  constructor(message = "MST blockchain reward provider is not configured") {
    super(message);
    this.name = "BlockchainNotConfiguredError";
  }
}
