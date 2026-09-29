'use client';

// Wallet connection (wagmi injected EIP-1193 wallet: BridgeKey or any compatible wallet) plus the
// SECUREX ownership proof: the backend issues a message, the user signs it (no transaction, no gas),
// and the backend verifies the signature before linking the address.

import { useCallback, useState } from 'react';
import { useAccount, useDisconnect, useSignMessage, useSwitchChain } from 'wagmi';
import { errorMessage } from '@/lib/api/client';
import { requestWalletChallenge, verifyWallet } from '@/lib/api/wallet';
import { useAuth } from '@/lib/context/AuthContext';
import { MST_TESTNET_ID } from '@/lib/chain/mst';

export function useWalletLink() {
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const { me, reload } = useAuth();
  const [busy, setBusy] = useState<'idle' | 'switching' | 'signing'>('idle');
  const [error, setError] = useState<string | null>(null);

  const linkedWallets = me?.wallets ?? [];
  const isLinked = Boolean(address && linkedWallets.some((w) => w.address.toLowerCase() === address.toLowerCase()));
  const wrongNetwork = isConnected && chainId !== MST_TESTNET_ID;

  /** Asks the wallet to switch to (or add) MST Testnet. Explicit user action only. */
  const switchNetwork = useCallback(async () => {
    setBusy('switching');
    setError(null);
    try {
      await switchChainAsync({ chainId: MST_TESTNET_ID });
    } catch (err) {
      setError(errorMessage(err, 'Could not switch network'));
    } finally {
      setBusy('idle');
    }
  }, [switchChainAsync]);

  /** Signs the backend's ownership message with the connected wallet and links it to the account. */
  const link = useCallback(async () => {
    if (!address) throw new Error('Connect a wallet first');
    setBusy('signing');
    setError(null);
    try {
      const challenge = await requestWalletChallenge(address);
      const signature = await signMessageAsync({ message: challenge.message });
      await verifyWallet({ address, signature, challengeToken: challenge.challengeToken });
      await reload();
    } catch (err) {
      const msg = errorMessage(err, 'Could not link wallet');
      setError(/user rejected|denied/i.test(msg) ? 'Signature request was rejected in the wallet.' : msg);
      throw err;
    } finally {
      setBusy('idle');
    }
  }, [address, signMessageAsync, reload]);

  return { address, isConnected, chainId, isLinked, linkedWallets, wrongNetwork, busy, error, switchNetwork, link, disconnect };
}
