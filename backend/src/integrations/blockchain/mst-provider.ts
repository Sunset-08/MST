import { JsonRpcProvider } from "ethers";
import type { AppConfig } from "../../config/env.js";
import {
  BlockchainNotConfiguredError,
  type BlockchainRewardProvider,
  type ProviderStatus,
  type RewardInput,
  type RewardTransaction,
  type TransactionStatus,
} from "./types.js";

/**
 * Sends one reward on-chain. Implemented once the MST reward contract (address, ABI and the
 * function to call) is finalized; SECUREX does not guess contract function names.
 */
export interface RewardContractAdapter {
  send(input: RewardInput): Promise<RewardTransaction>;
}

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/**
 * MST provider. Transaction status uses only standard EVM JSON-RPC (eth_getTransactionReceipt /
 * eth_chainId), so it works as soon as MST_RPC_URL + MST_CHAIN_ID are set. Sending requires a
 * RewardContractAdapter built from the finalized contract details.
 */
export class MstRewardProvider implements BlockchainRewardProvider {
  private rpc?: JsonRpcProvider;

  constructor(
    private readonly config: AppConfig["mst"],
    private readonly adapter?: RewardContractAdapter,
  ) {}

  status(): ProviderStatus {
    const canRead = Boolean(this.config.rpcUrl && this.config.chainId);
    const contractConfigured = Boolean(this.config.rewardContractAddress && this.config.rewardContractAbi);
    const canSend = canRead && contractConfigured && Boolean(this.adapter);
    const missing = [
      !this.config.rpcUrl && "MST_RPC_URL",
      !this.config.chainId && "MST_CHAIN_ID",
      !this.config.rewardContractAddress && "MST_REWARD_CONTRACT_ADDRESS",
      !this.config.rewardContractAbi && "MST_REWARD_CONTRACT_ABI",
    ].filter(Boolean);
    return {
      configured: canSend,
      canSend,
      canReadTransactions: canRead,
      reason: canSend
        ? undefined
        : missing.length
          ? `blockchain not configured: missing ${missing.join(", ")}`
          : "blockchain not configured: reward contract adapter not implemented until the MST reward contract is finalized",
      network: this.config.network,
      chainId: this.config.chainId,
      explorerUrl: this.config.explorerUrl,
    };
  }

  async sendReward(input: RewardInput): Promise<RewardTransaction> {
    const s = this.status();
    if (!s.canSend || !this.adapter) throw new BlockchainNotConfiguredError(s.reason);
    await this.assertChain();
    const tx = await this.adapter.send(input);
    if (!TX_HASH.test(tx.transactionHash)) throw new Error("Reward adapter returned an invalid transaction hash");
    return tx;
  }

  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    if (!TX_HASH.test(txHash)) return "not_found";
    const rpc = await this.assertChain();
    const receipt = await rpc.getTransactionReceipt(txHash);
    if (!receipt) {
      const tx = await rpc.getTransaction(txHash);
      return tx ? "pending" : "not_found";
    }
    return receipt.status === 1 ? "confirmed" : "failed";
  }

  private async assertChain(): Promise<JsonRpcProvider> {
    const { rpcUrl, chainId } = this.config;
    if (!rpcUrl || !chainId) throw new BlockchainNotConfiguredError(this.status().reason);
    this.rpc ??= new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true, cacheTimeout: -1 });
    const actual = Number(BigInt(await this.rpc.send("eth_chainId", [])));
    if (actual !== chainId) throw new BlockchainNotConfiguredError(`MST RPC serves chain ${actual}, expected ${chainId}`);
    return this.rpc;
  }
}

export function explorerTxUrl(explorerUrl: string | undefined, txHash: string | null): string | null {
  return explorerUrl && txHash ? `${explorerUrl.replace(/\/$/, "")}/tx/${txHash}` : null;
}
