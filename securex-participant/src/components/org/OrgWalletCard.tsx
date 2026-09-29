'use client';

// ============================================================
// SECUREX — Organization funding wallet
// Connected through the browser wallet extension (BridgeKey / any EIP-1193 wallet), proven with a signature
// and saved on the organization, so it stays linked across reloads and sessions. This wallet pays solvers'
// MSTC rewards directly. Nothing is typed in by hand and no key ever leaves the extension.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useBalance, useConnect, useSignMessage, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { formatEther } from 'viem';
import { Wallet, CheckCircle, AlertTriangle, Copy, ExternalLink } from 'lucide-react';
import { errorMessage } from '@/lib/api/client';
import { getOrgWallet, requestOrgWalletChallenge, unlinkOrgWallet, verifyOrgWallet, type OrgFundingWallet } from '@/lib/api/org';
import { MST_TESTNET_ID } from '@/lib/chain/mst';
import { useOrg } from '@/lib/context/OrgContext';
import { truncateAddress } from '@/lib/utils';

export function OrgWalletCard({ onChange }: { onChange?: (w: OrgFundingWallet) => void }) {
  const { admin } = useOrg();
  const canEdit = admin?.role === 'owner' || admin?.role === 'admin';
  const { address: connected, isConnected, chainId } = useAccount();
  const { connectAsync } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const [linked, setLinked] = useState<OrgFundingWallet | null>(null);
  const [busy, setBusy] = useState<'' | 'connect' | 'sign' | 'unlink'>('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const linkedAddress = linked?.address ?? undefined;
  const { data: balance } = useBalance({ address: linkedAddress as `0x${string}` | undefined, chainId: MST_TESTNET_ID, query: { enabled: Boolean(linkedAddress), refetchInterval: 15_000 } });

  const load = useCallback(async () => {
    try {
      const w = await getOrgWallet();
      setLinked(w);
      onChange?.(w);
    } catch (e) {
      setError(errorMessage(e, 'Could not load the organization wallet'));
    }
  }, [onChange]);
  useEffect(() => { void load(); }, [load]);

  const extensionMatches = Boolean(linkedAddress && connected && connected.toLowerCase() === linkedAddress.toLowerCase());

  /** Connect the extension (if needed), switch to MST Testnet, sign the ownership message and save it. */
  async function connectAndLink() {
    setError('');
    try {
      setBusy('connect');
      let account = connected;
      if (!isConnected || !account) {
        const res = await connectAsync({ connector: injected() });
        account = res.accounts[0];
      }
      if (!account) throw new Error('The wallet extension returned no account');
      if (chainId !== MST_TESTNET_ID) await switchChainAsync({ chainId: MST_TESTNET_ID });
      setBusy('sign');
      const challenge = await requestOrgWalletChallenge(account);
      const signature = await signMessageAsync({ account, message: challenge.message });
      const w = await verifyOrgWallet({ address: account, signature, challengeToken: challenge.challengeToken });
      setLinked(w);
      onChange?.(w);
    } catch (e) {
      const msg = errorMessage(e, 'Could not connect the wallet');
      setError(/user rejected|denied/i.test(msg) ? 'The request was rejected in the wallet extension.' : /No injected|not found|provider/i.test(msg) ? 'No wallet extension found. Install BridgeKey or another EVM wallet extension.' : msg);
    } finally {
      setBusy('');
    }
  }

  async function unlink() {
    if (!window.confirm('Unlink the organization wallet? Rewards cannot be paid until a wallet is linked again.')) return;
    setBusy('unlink');
    setError('');
    try {
      const w = await unlinkOrgWallet();
      setLinked(w);
      onChange?.(w);
    } catch (e) {
      setError(errorMessage(e, 'Could not unlink the wallet'));
    } finally {
      setBusy('');
    }
  }

  return (
    <div id="org-wallet-card" className="sx-card p-6 space-y-5" style={{ border: '1px solid rgba(139, 92, 246, 0.2)' }}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.25)' }}>
          <Wallet size={20} className="text-violet-400" />
        </div>
        <div>
          <h3 className="font-bold text-white">Organization Wallet</h3>
          <p className="text-xs text-slate-500">Pays MSTC rewards directly to solvers</p>
        </div>
      </div>

      {linked === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : linkedAddress ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.25)' }}>
            <CheckCircle size={16} className="text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-400">Linked (verified by signature)</span>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Funding wallet</p>
            <div className="flex items-center gap-2">
              <p id="org-wallet-address" className="font-mono text-xs text-slate-300 bg-[var(--sx-bg-elevated)] px-3 py-2 rounded-lg flex-1 truncate">{linkedAddress}</p>
              <button onClick={() => { void navigator.clipboard.writeText(linkedAddress); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="sx-btn-ghost p-2 rounded-lg" title="Copy address">
                <Copy size={13} className={copied ? 'text-emerald-400' : ''} />
              </button>
              {linked.explorerUrl && (
                <a href={`${linked.explorerUrl.replace(/\/$/, '')}/address/${linkedAddress}`} target="_blank" rel="noopener noreferrer" className="sx-btn-ghost p-2 rounded-lg" title="View on explorer">
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Balance</p>
              <p id="org-wallet-balance" className="font-semibold text-white">{balance ? `${Number(formatEther(balance.value)).toLocaleString(undefined, { maximumFractionDigits: 4 })} MSTC` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Extension</p>
              <p className={`font-semibold ${extensionMatches ? 'text-emerald-400' : 'text-amber-400'}`}>
                {extensionMatches ? 'Connected' : isConnected ? `On ${truncateAddress(connected ?? '')}` : 'Not connected'}
              </p>
            </div>
          </div>
          {!extensionMatches && (
            <p className="text-xs text-amber-400 flex items-start gap-2">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              {isConnected ? `Select ${truncateAddress(linkedAddress)} in your wallet extension to pay rewards.` : 'Connect the wallet extension to pay rewards.'}
            </p>
          )}
          {canEdit && (
            <div className="flex gap-2">
              {!isConnected ? (
                <button id="org-wallet-reconnect-btn" onClick={() => void connectAsync({ connector: injected() }).catch((e) => setError(errorMessage(e)))} className="sx-btn sx-btn-secondary flex-1">
                  Connect extension
                </button>
              ) : !extensionMatches ? (
                <button id="org-wallet-relink-btn" onClick={() => void connectAndLink()} disabled={busy !== ''} className="sx-btn sx-btn-secondary flex-1">
                  {busy === 'sign' ? 'Confirm in wallet…' : `Use ${truncateAddress(connected ?? '')} instead`}
                </button>
              ) : null}
              <button id="org-wallet-unlink-btn" onClick={() => void unlink()} disabled={busy !== ''} className="sx-btn sx-btn-secondary flex-1">Unlink</button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="w-2 h-2 rounded-full bg-slate-500" />
            <span className="text-sm font-semibold text-slate-400">No wallet linked</span>
          </div>
          <p className="text-xs text-slate-500">
            Connect your wallet extension and sign once to prove ownership (no transaction, no gas). Solvers&apos; MSTC rewards are then paid from this wallet.
          </p>
          {canEdit && (
            <button id="org-connect-wallet-btn" onClick={() => void connectAndLink()} disabled={busy !== ''} className="sx-btn w-full" style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}>
              <Wallet size={16} />
              {busy === 'connect' ? 'Opening wallet…' : busy === 'sign' ? 'Confirm the signature in your wallet…' : 'Connect Wallet'}
            </button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
