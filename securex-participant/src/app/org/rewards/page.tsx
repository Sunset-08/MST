'use client';

// ============================================================
// SECUREX — Organization reward payouts
// The organization's linked wallet (in the browser extension) sends MSTC directly to each solver's wallet.
// The backend marks a reward paid only after reading the mined transaction: from the organization wallet,
// to the solver's wallet, exactly the reward amount, on MST Testnet.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useConfig, useSendTransaction, useSwitchChain } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { Coins, ExternalLink, Send } from 'lucide-react';
import { OrgShell } from '@/components/org/OrgShell';
import { OrgWalletCard } from '@/components/org/OrgWalletCard';
import { errorMessage } from '@/lib/api/client';
import { confirmOrgRewardPayment, listOrgRewards, type OrgFundingWallet, type OrgRewardRow } from '@/lib/api/org';
import { MST_TESTNET_ID } from '@/lib/chain/mst';
import { truncateAddress } from '@/lib/utils';

const SENT_KEY = (id: string) => `sx_org_payout_${id}`;

export default function OrgRewardsPage() {
  const [rows, setRows] = useState<OrgRewardRow[] | null>(null);
  const [wallet, setWallet] = useState<OrgFundingWallet | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const config = useConfig();

  const load = useCallback(() => {
    listOrgRewards().then((r) => { setRows(r.rewards); setWallet(r.wallet); }).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const matches = Boolean(wallet?.address && address && address.toLowerCase() === wallet.address.toLowerCase());

  /** Asks the backend to verify a mined payment; safe to repeat (it never pays twice). */
  async function confirm(r: OrgRewardRow, hash: string) {
    setBusy((b) => ({ ...b, [r.id]: 'Verifying on-chain…' }));
    const res = await confirmOrgRewardPayment(r.id, hash);
    try { localStorage.removeItem(SENT_KEY(r.id)); } catch { /* storage unavailable */ }
    setRows((all) => (all ?? []).map((x) => (x.id === r.id ? res.reward : x)));
  }

  async function pay(r: OrgRewardRow) {
    setRowError((e) => ({ ...e, [r.id]: '' }));
    try {
      if (!wallet?.address) throw new Error('Link the organization wallet first.');
      if (!matches) throw new Error(`Select ${truncateAddress(wallet.address)} in your wallet extension.`);
      if (chainId !== MST_TESTNET_ID) {
        setBusy((b) => ({ ...b, [r.id]: 'Switching network…' }));
        await switchChainAsync({ chainId: MST_TESTNET_ID });
      }
      // A payment already sent from this browser is confirmed instead of being sent again.
      let hash: `0x${string}` | null = null;
      try { hash = localStorage.getItem(SENT_KEY(r.id)) as `0x${string}` | null; } catch { /* storage unavailable */ }
      if (!hash) {
        setBusy((b) => ({ ...b, [r.id]: 'Confirm in your wallet…' }));
        hash = await sendTransactionAsync({ account: wallet.address as `0x${string}`, to: r.recipientAddress as `0x${string}`, value: BigInt(r.amountWei), chainId: MST_TESTNET_ID });
        try { localStorage.setItem(SENT_KEY(r.id), hash); } catch { /* storage unavailable */ }
      }
      setBusy((b) => ({ ...b, [r.id]: 'Waiting for network confirmation…' }));
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: MST_TESTNET_ID });
      if (receipt.status !== 'success') {
        try { localStorage.removeItem(SENT_KEY(r.id)); } catch { /* storage unavailable */ }
        throw new Error('The payment transaction failed on-chain; no MSTC was sent.');
      }
      await confirm(r, hash);
    } catch (e) {
      const msg = errorMessage(e, 'Payment failed');
      setRowError((x) => ({ ...x, [r.id]: /user rejected|denied/i.test(msg) ? 'The transaction was rejected in the wallet extension.' : msg }));
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[r.id]; return n; });
    }
  }

  const unpaid = (rows ?? []).filter((r) => r.status !== 'Confirmed');
  const paid = (rows ?? []).filter((r) => r.status === 'Confirmed');

  return (
    <OrgShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Coins size={22} className="text-emerald-400" /> Rewards</h1>
          <p className="text-slate-500 text-sm mt-1">Pay verified solvers their MSTC directly from the organization wallet.</p>
        </div>

        <OrgWalletCard onChange={setWallet} />

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">To pay ({unpaid.length})</h2>
          {rows && unpaid.length === 0 && <p className="text-sm text-slate-500">No unpaid rewards.</p>}
          {unpaid.map((r) => (
            <div key={r.id} id={`org-reward-${r.id}`} className="sx-card p-4 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{r.challengeTitle}</p>
                  <p className="text-xs text-slate-500">
                    Solver @{r.solver.username} · recipient <span className="font-mono">{r.recipientAddress}</span>
                  </p>
                </div>
                <button
                  id={`org-reward-pay-${r.id}`}
                  onClick={() => void pay(r)}
                  disabled={Boolean(busy[r.id]) || !matches}
                  className="sx-btn sx-btn-sm gap-2"
                  style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: 'white' }}
                >
                  <Send size={13} /> {busy[r.id] ?? `Pay ${r.mstAmount} MSTC`}
                </button>
              </div>
              {rowError[r.id] && <p className="text-xs text-rose-400">{rowError[r.id]}</p>}
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Paid ({paid.length})</h2>
          {paid.map((r) => (
            <div key={r.id} className="sx-card p-4 text-xs text-slate-400 space-y-1">
              <p className="text-sm font-semibold text-white">{r.challengeTitle} · <span className="text-emerald-400">{r.mstAmount} MSTC paid</span></p>
              <p>From <span className="font-mono">{r.funderAddress}</span> → to <span className="font-mono">{r.recipientAddress}</span> (@{r.solver.username})</p>
              {r.transactionHash && (
                <a href={r.explorerUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-400 hover:text-blue-300 break-all inline-flex items-center gap-1">
                  {r.transactionHash} <ExternalLink size={11} />
                </a>
              )}
            </div>
          ))}
        </section>
      </div>
    </OrgShell>
  );
}
