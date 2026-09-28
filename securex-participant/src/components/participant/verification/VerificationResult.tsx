'use client';

// ============================================================
// SECUREX — Verification Result Components
// ============================================================

import { CheckCircle, XCircle, Clock, Zap, Star, Coins, Flame, Trophy, RotateCcw, ExternalLink } from 'lucide-react';
import type { VerificationResult } from '@/lib/types';
import { formatPoints, truncateAddress } from '@/lib/utils';
import Link from 'next/link';

// -------- Verified --------

export function VerifiedCard({
  result,
  challengeTitle,
}: {
  result: VerificationResult;
  challengeTitle: string;
}) {
  return (
    <div className="verification-verified p-8 text-center space-y-6 animate-fade-in">
      {/* Icon */}
      <div className="flex justify-center">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-emerald-400/10 flex items-center justify-center">
            <CheckCircle size={40} className="text-emerald-400" />
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-emerald-400/30 animate-ping" />
        </div>
      </div>

      {/* Title */}
      <div>
        <h2 className="text-3xl font-black text-emerald-400 mb-2">VERIFIED ✅</h2>
        <p className="text-slate-300 font-medium">{challengeTitle}</p>
        <p className="text-slate-500 text-sm mt-1">Security challenge successfully completed</p>
      </div>

      {/* Rewards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-amber-400/5 border border-amber-400/15 rounded-xl p-4">
          <Zap size={20} className="text-amber-400 mx-auto mb-2" />
          <p className="text-2xl font-black text-amber-400 points-counter">
            +{formatPoints(result.pointsAwarded)}
          </p>
          <p className="text-xs text-slate-500 mt-1">POINTS</p>
        </div>
        <div className="bg-blue-400/5 border border-blue-400/15 rounded-xl p-4">
          <Star size={20} className="text-blue-400 mx-auto mb-2" />
          <p className="text-2xl font-black text-blue-400">+{result.reputationAwarded}</p>
          <p className="text-xs text-slate-500 mt-1">REPUTATION</p>
        </div>
        <div className="bg-emerald-400/5 border border-emerald-400/15 rounded-xl p-4">
          <Coins size={20} className="text-emerald-400 mx-auto mb-2" />
          <p className="text-2xl font-black text-emerald-400">+{result.mstAwarded}</p>
          <p className="text-xs text-slate-500 mt-1">MSTC</p>
        </div>
      </div>

      {/* Streak & leaderboard update */}
      {result.streakUpdated && (
        <div className="flex items-center justify-center gap-6 text-sm">
          <span className="flex items-center gap-2 text-orange-400">
            <Flame size={16} />
            Streak updated
          </span>
          <span className="flex items-center gap-2 text-violet-400">
            <Trophy size={16} />
            Leaderboard updated
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Link href="/dashboard" className="sx-btn sx-btn-primary">
          View Dashboard
        </Link>
        <Link href="/challenges" className="sx-btn sx-btn-secondary">
          More Challenges
        </Link>
      </div>
    </div>
  );
}

// -------- Failed --------

export function FailedCard({
  result,
  onRetry,
}: {
  result: VerificationResult;
  onRetry: () => void;
}) {
  return (
    <div className="verification-failed p-8 text-center space-y-6 animate-fade-in">
      <div className="flex justify-center">
        <div className="w-20 h-20 rounded-full bg-rose-400/10 flex items-center justify-center">
          <XCircle size={40} className="text-rose-400" />
        </div>
      </div>

      <div>
        <h2 className="text-3xl font-black text-rose-400 mb-2">VERIFICATION FAILED</h2>
        <p className="text-slate-400 text-sm">Your solution did not pass verification.</p>
        <p className="text-xs text-slate-600 mt-1">No points have been awarded.</p>
      </div>

      {result.reason && (
        <div className="bg-rose-400/5 border border-rose-400/20 rounded-xl p-4 text-left">
          <p className="text-xs font-semibold text-rose-400 mb-2 uppercase tracking-widest">
            Reason
          </p>
          <p className="text-sm text-slate-300">{result.reason}</p>
        </div>
      )}

      <div className="flex items-center justify-center gap-3">
        <button
          id="retry-challenge-btn"
          onClick={onRetry}
          className="sx-btn sx-btn-danger flex items-center gap-2"
        >
          <RotateCcw size={16} />
          Try Again
        </button>
        <Link href="/challenges" className="sx-btn sx-btn-secondary">
          Browse Challenges
        </Link>
      </div>
    </div>
  );
}

// -------- Pending --------

export function PendingCard() {
  return (
    <div className="verification-pending p-8 text-center space-y-6 animate-fade-in">
      <div className="flex justify-center">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-amber-400/10 flex items-center justify-center">
            <Clock size={40} className="text-amber-400" />
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-amber-400/20 animate-ping" />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-black text-amber-400 mb-2">SUBMISSION UNDER REVIEW</h2>
        <p className="text-slate-400 text-sm">
          Your submission is being verified by the backend engine.
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Points are awarded only after successful verification.
        </p>
      </div>

      <div className="flex items-center justify-center gap-2">
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>

      <p className="text-xs text-slate-600">This may take a moment. You can leave this page.</p>
    </div>
  );
}

// -------- MST Reward Display --------

export function MSTRewardCard({
  mstAmount,
  transactionHash,
  status,
}: {
  mstAmount: number;
  transactionHash?: string;
  status: 'Pending' | 'Processing' | 'Confirmed' | 'Failed';
}) {
  const statusColor =
    status === 'Confirmed'
      ? 'text-emerald-400'
      : status === 'Failed'
      ? 'text-rose-400'
      : 'text-amber-400';

  const statusIcon = status === 'Confirmed' ? '✅' : status === 'Failed' ? '❌' : '⏳';

  return (
    <div className="sx-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Coins size={18} className="text-emerald-400" />
        <h3 className="font-bold text-white">MST Reward</h3>
      </div>

      <div>
        <p className="text-3xl font-black text-emerald-400">+{mstAmount} MSTC</p>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">Status</span>
        <span className={`font-semibold ${statusColor}`}>
          {statusIcon} {status}
        </span>
      </div>

      {transactionHash && (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Transaction</span>
            <span className="font-mono text-xs text-slate-400">
              {truncateAddress(transactionHash)}
            </span>
          </div>

          <a
            href={`https://explorer.mstblockchain.com/tx/${transactionHash}`}
            target="_blank"
            rel="noopener noreferrer"
            id="view-on-mstscan-btn"
            className="sx-btn sx-btn-secondary w-full flex items-center justify-center gap-2 text-emerald-400 border-emerald-400/20 hover:bg-emerald-400/5"
          >
            <ExternalLink size={14} />
            View on MST Scan
          </a>
        </>
      )}
    </div>
  );
}
