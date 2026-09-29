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

/** A mined native-coin (MSTC) transfer as reported by the chain. */
export interface NativeTransfer {
  hash: string;
  from: string;
  to: string | null;
  valueWei: bigint;
  success: boolean;
  blockNumber: number;
  blockTimestamp: number;
  chainId: number;
}

export interface BlockchainRewardProvider {
  status(): ProviderStatus;
  /** Must throw BlockchainNotConfiguredError when sending is not possible. Never returns a fake hash. */
  sendReward(input: RewardInput): Promise<RewardTransaction>;
  getTransactionStatus(txHash: string): Promise<TransactionStatus>;
  /** The mined transfer, or null while it is not mined / unknown. Reads the chain; never trusts the caller. */
  getNativeTransfer(txHash: string): Promise<NativeTransfer | null>;
}

export class BlockchainNotConfiguredError extends Error {
  constructor(message = "MST blockchain reward provider is not configured") {
    super(message);
    this.name = "BlockchainNotConfiguredError";
  }
}
