'use client';

// ============================================================
// SECUREX — Organization MST Status Card
// Read-only view of the funding requirement for publishing challenges (GET /api/org/mst-status).
// Rewards are paid from the platform RewardVault; this card never moves funds.
// ============================================================

import { Wallet, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useOrg } from '@/lib/context/OrgContext';

export function OrgMstStatusCard() {
  const { mstStatus, isLoading, refreshMstStatus } = useOrg();
  if (!mstStatus) return null;

  const isSatisfied = mstStatus.paymentStatus === 'PAYMENT_CONFIRMED' || mstStatus.paymentStatus === 'READY_TO_PUBLISH';
  const color = isSatisfied ? '#34d399' : '#f87171';
  const border = isSatisfied ? 'rgba(52, 211, 153, 0.25)' : 'rgba(248, 113, 113, 0.25)';
  const bg = isSatisfied ? 'rgba(52, 211, 153, 0.08)' : 'rgba(248, 113, 113, 0.08)';

  return (
    <div className="sx-card p-6 space-y-5" style={{ border: `1px solid ${border}` }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: bg, border: `1px solid ${border}` }}>
            <Wallet size={20} style={{ color }} />
          </div>
          <div>
            <h3 className="font-bold text-white">MST Rewards</h3>
            <p className="text-xs text-slate-500">Funding requirement for publishing</p>
          </div>
        </div>
        <button id="org-refresh-mst-btn" onClick={() => void refreshMstStatus()} disabled={isLoading} className="sx-btn-ghost p-1.5 rounded-lg" title="Refresh status">
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: bg, border: `1px solid ${border}` }}>
        {isSatisfied ? <CheckCircle size={16} style={{ color }} /> : <AlertCircle size={16} style={{ color }} />}
        <span className="text-sm font-semibold" style={{ color }}>
          {isSatisfied ? 'Ready to publish' : 'Funding required'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Minimum required</p>
          <p className="text-2xl font-black text-white">
            {mstStatus.minimumRequired} <span className="text-sm font-semibold text-violet-400">MSTC</span>
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Deposited</p>
          <p className="text-2xl font-black" style={{ color }}>
            {mstStatus.amountPaid} <span className="text-sm font-semibold">MSTC</span>
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {isSatisfied
          ? 'Participant rewards are paid from the platform RewardVault on MST Testnet after a submission is verified. No organization deposit is required.'
          : 'This platform requires an organization deposit before publishing, but deposits are not available yet. Contact a platform administrator.'}
      </p>
    </div>
  );
}
