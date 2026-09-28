'use client';

// ============================================================
// SECUREX — Claim an MST reward on-chain
// 1. The backend derives a proof commitment for the verified submission.
// 2. The participant's wallet submits it to the SubmissionRegistry (an explicit wallet transaction).
// 3. The backend confirms that transaction, verifies on-chain and pays from the RewardVault.
// Nothing here moves funds from the participant: they only pay gas for the proof transaction.
// ============================================================

import { useState } from 'react';
import { useAccount, useConfig, useConnect, useSwitchChain, useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { injected } from 'wagmi/connectors';
import { Coins, Wallet } from 'lucide-react';
import { errorMessage } from '@/lib/api/client';
import { getClaimInfo, submitClaim } from '@/lib/api/rewards';
import type { Reward } from '@/lib/types';
import { truncateAddress } from '@/lib/utils';

type Step = 'idle' | 'preparing' | 'wallet' | 'confirming' | 'paying';

const STEP_LABEL: Record<Step, string> = {
  idle: 'Claim MST reward',
  preparing: 'Preparing claim…',
  wallet: 'Confirm in your wallet…',
  confirming: 'Waiting for network confirmation…',
  paying: 'Verifying and paying…',
};

export function RewardClaim({ reward, onClaimed }: { reward: Reward; onClaimed: (r: Reward) => void }) {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const config = useConfig();
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState('');

  async function claim() {
    setError('');
    try {
      let current = address;
      if (!isConnected) {
        const res = await connectAsync({ connector: injected() });
        current = res.accounts[0];
      }
      if (reward.walletAddress && current?.toLowerCase() !== reward.walletAddress.toLowerCase()) {
        throw new Error(`Switch your wallet to ${truncateAddress(reward.walletAddress)}, the wallet linked to this reward.`);
      }
      setStep('preparing');
      const info = await getClaimInfo(reward.id);
      await switchChainAsync({ chainId: info.chainId });

      setStep('wallet');
      const hash = await writeContractAsync({
        address: info.submissionRegistryAddress,
        abi: info.abi as never,
        functionName: info.functionName as never,
        args: [info.challengeId, info.solutionCommitment] as never,
        chainId: info.chainId,
      } as never);

      setStep('confirming');
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: info.chainId as never });
      if (receipt.status !== 'success') throw new Error('The proof transaction failed on-chain.');

      setStep('paying');
      const result = await submitClaim(reward.id, hash);
      onClaimed(result.reward);
    } catch (err) {
      const msg = errorMessage(err, 'Claim failed');
      setError(/user rejected|denied/i.test(msg) ? 'The transaction was rejected in your wallet.' : msg);
    } finally {
      setStep('idle');
    }
  }

  return (
    <div className="space-y-2">
      <button
        id={`claim-reward-${reward.id}`}
        onClick={claim}
        disabled={step !== 'idle'}
        className="sx-btn sx-btn-primary w-full gap-2"
      >
        {isConnected ? <Coins size={16} /> : <Wallet size={16} />}
        {STEP_LABEL[step]}
      </button>
      <p className="text-xs text-slate-500">You sign one proof transaction (network gas only). The reward is then paid from the platform vault.</p>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
