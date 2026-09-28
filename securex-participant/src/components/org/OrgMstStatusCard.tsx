'use client';

// ============================================================
// SECUREX — Organization MST Status Card
// Member 2 — Organization Side Add-On
//
// Displays:
//   - Minimum required MSTC
//   - Amount paid/deposited
//   - Current payment status
//   - Wallet address
//   - Transaction status
//
// Does NOT execute blockchain transactions (Member 4 handles that).
// Provides UI trigger for initiating payment flow.
// ============================================================

import { useState } from 'react';
import {
  Wallet,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  ArrowUpRight,
  RefreshCw,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { useOrg } from '@/lib/context/OrgContext';
import type { OrgMstPaymentStatus } from '@/lib/types/org';

// ----------------------------------------------------------
// Status display config
// ----------------------------------------------------------

interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
}

function getStatusConfig(status: OrgMstPaymentStatus): StatusConfig {
  switch (status) {
    case 'PAYMENT_CONFIRMED':
    case 'READY_TO_PUBLISH':
      return {
        label: status === 'READY_TO_PUBLISH' ? '✅ Ready to Publish' : '✅ Payment Confirmed',
        color: '#34d399',
        bgColor: 'rgba(52, 211, 153, 0.08)',
        borderColor: 'rgba(52, 211, 153, 0.25)',
        icon: <CheckCircle size={16} style={{ color: '#34d399' }} />,
      };
    case 'PAYMENT_PROCESSING':
      return {
        label: '⏳ Payment Processing',
        color: '#60a5fa',
        bgColor: 'rgba(96, 165, 250, 0.08)',
        borderColor: 'rgba(96, 165, 250, 0.25)',
        icon: <Loader2 size={16} style={{ color: '#60a5fa' }} className="animate-spin" />,
      };
    case 'PENDING_PAYMENT':
      return {
        label: '🕐 Pending Payment',
        color: '#fbbf24',
        bgColor: 'rgba(251, 191, 36, 0.08)',
        borderColor: 'rgba(251, 191, 36, 0.25)',
        icon: <Clock size={16} style={{ color: '#fbbf24' }} />,
      };
    case 'PAYMENT_REQUIRED':
    default:
      return {
        label: '❌ Payment Required',
        color: '#f87171',
        bgColor: 'rgba(248, 113, 113, 0.08)',
        borderColor: 'rgba(248, 113, 113, 0.25)',
        icon: <AlertCircle size={16} style={{ color: '#f87171' }} />,
      };
  }
}

// ----------------------------------------------------------
// Payment initiation modal
// ----------------------------------------------------------

function PaymentModal({
  minimumRequired,
  onConfirm,
  onCancel,
}: {
  minimumRequired: number;
  onConfirm: (wallet: string) => void;
  onCancel: () => void;
}) {
  const [walletAddress, setWalletAddress] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div
        className="relative w-full max-w-md sx-card p-6 space-y-5"
        style={{ border: '1px solid rgba(139, 92, 246, 0.3)' }}
      >
        <div>
          <h3 className="text-lg font-bold text-white">Deposit MST Funding</h3>
          <p className="text-sm text-slate-500 mt-1">
            Connect your organization wallet to deposit{' '}
            <strong className="text-white">{minimumRequired} MSTC</strong> minimum.
          </p>
        </div>

        <div
          className="rounded-lg p-4 space-y-2"
          style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)' }}
        >
          <p className="text-xs font-semibold text-violet-300 uppercase tracking-wide">
            ⚠️ Important
          </p>
          <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
            <li>Actual blockchain transaction is processed by your connected wallet (Member 4)</li>
            <li>Funds are held in escrow until challenges are resolved</li>
            <li>MST rewards are distributed to winning participants</li>
          </ul>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">
            Organization Wallet Address
          </label>
          <input
            id="org-wallet-address-input"
            type="text"
            placeholder="0x..."
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            className="sx-input font-mono"
          />
          <p className="text-xs text-slate-600">
            This wallet will be used for MST deposits and reward disbursements.
          </p>
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} className="sx-btn sx-btn-secondary flex-1">
            Cancel
          </button>
          <button
            id="org-confirm-payment-btn"
            onClick={() => {
              if (walletAddress.trim()) onConfirm(walletAddress.trim());
            }}
            disabled={!walletAddress.trim()}
            className="sx-btn flex-1"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}
          >
            <Wallet size={16} />
            Initiate Payment
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------
// Main MST Status Card
// ----------------------------------------------------------

export function OrgMstStatusCard() {
  const { mstStatus, isLoading, initiatePayment, refreshMstStatus } = useOrg();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [copiedTx, setCopiedTx] = useState(false);

  if (!mstStatus) return null;

  const config = getStatusConfig(mstStatus.paymentStatus);
  const isSatisfied =
    mstStatus.paymentStatus === 'PAYMENT_CONFIRMED' ||
    mstStatus.paymentStatus === 'READY_TO_PUBLISH';
  const isProcessing = mstStatus.paymentStatus === 'PAYMENT_PROCESSING';

  const progressPct = Math.min(
    100,
    Math.round((mstStatus.amountPaid / mstStatus.minimumRequired) * 100),
  );

  function handleCopyTx() {
    if (mstStatus?.transactionHash) {
      navigator.clipboard.writeText(mstStatus.transactionHash);
      setCopiedTx(true);
      setTimeout(() => setCopiedTx(false), 2000);
    }
  }

  async function handleInitiatePayment(walletAddress: string) {
    setShowPaymentModal(false);
    await initiatePayment(walletAddress);
  }

  return (
    <>
      <div
        className="sx-card p-6 space-y-5"
        style={{ border: `1px solid ${config.borderColor}` }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: config.bgColor, border: `1px solid ${config.borderColor}` }}
            >
              <Wallet size={20} style={{ color: config.color }} />
            </div>
            <div>
              <h3 className="font-bold text-white">Organization MST Status</h3>
              <p className="text-xs text-slate-500">Funding requirement for challenge publishing</p>
            </div>
          </div>

          <button
            id="org-refresh-mst-btn"
            onClick={refreshMstStatus}
            disabled={isLoading}
            className="sx-btn-ghost p-1.5 rounded-lg"
            title="Refresh status"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Status badge */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: config.bgColor, border: `1px solid ${config.borderColor}` }}
        >
          {config.icon}
          <span className="text-sm font-semibold" style={{ color: config.color }}>
            {config.label}
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
              Minimum Required
            </p>
            <p className="text-2xl font-black text-white">
              {mstStatus.minimumRequired}{' '}
              <span className="text-sm font-semibold text-violet-400">MSTC</span>
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
              Paid / Deposited
            </p>
            <p className="text-2xl font-black" style={{ color: isSatisfied ? '#34d399' : '#f87171' }}>
              {mstStatus.amountPaid}{' '}
              <span className="text-sm font-semibold" style={{ color: isSatisfied ? '#34d399' : '#f87171' }}>
                MSTC
              </span>
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Funding progress</span>
            <span>{progressPct}%</span>
          </div>
          <div className="sx-progress-bar">
            <div
              className="sx-progress-fill transition-all duration-700"
              style={{
                width: `${progressPct}%`,
                background: isSatisfied
                  ? 'linear-gradient(90deg, #34d399, #06b6d4)'
                  : isProcessing
                  ? 'linear-gradient(90deg, #60a5fa, #818cf8)'
                  : 'linear-gradient(90deg, #7c3aed, #4f46e5)',
              }}
            />
          </div>
        </div>

        {/* Wallet info */}
        {mstStatus.walletAddress && (
          <div className="space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
              Wallet Address
            </p>
            <p className="font-mono text-xs text-slate-300 bg-[var(--sx-bg-elevated)] px-3 py-2 rounded-lg break-all">
              {mstStatus.walletAddress}
            </p>
          </div>
        )}

        {/* Transaction hash */}
        {mstStatus.transactionHash && (
          <div className="space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
              Transaction
            </p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-xs text-slate-300 bg-[var(--sx-bg-elevated)] px-3 py-2 rounded-lg flex-1 truncate">
                {mstStatus.transactionHash}
              </p>
              <button
                onClick={handleCopyTx}
                className="sx-btn-ghost p-2 rounded-lg"
                title="Copy transaction hash"
              >
                <Copy size={13} className={copiedTx ? 'text-emerald-400' : ''} />
              </button>
              <a
                href={`https://explorer.mst-testnet.example/tx/${mstStatus.transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="sx-btn-ghost p-2 rounded-lg"
                title="View on explorer"
              >
                <ExternalLink size={13} />
              </a>
            </div>
          </div>
        )}

        {/* CTA */}
        {!isSatisfied && !isProcessing && (
          <button
            id="org-pay-mst-btn"
            onClick={() => setShowPaymentModal(true)}
            disabled={isLoading}
            className="sx-btn w-full"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              color: 'white',
            }}
          >
            <Wallet size={16} />
            Pay / Deposit MST
            <ArrowUpRight size={16} />
          </button>
        )}

        {isProcessing && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-lg"
            style={{ background: 'rgba(96, 165, 250, 0.08)', border: '1px solid rgba(96, 165, 250, 0.2)' }}
          >
            <Loader2 size={16} className="text-blue-400 animate-spin" />
            <p className="text-sm text-blue-300">
              Transaction submitted — awaiting blockchain confirmation from Member 4...
            </p>
          </div>
        )}
      </div>

      {showPaymentModal && (
        <PaymentModal
          minimumRequired={mstStatus.minimumRequired}
          onConfirm={handleInitiatePayment}
          onCancel={() => setShowPaymentModal(false)}
        />
      )}
    </>
  );
}
