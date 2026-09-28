'use client';

// ============================================================
// SECUREX — Rewards Page
// ============================================================

import { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { getMyRewards } from '@/lib/api/profile';
import { MSTRewardCard } from '@/components/participant/verification/VerificationResult';
import type { Reward } from '@/lib/types';
import { Coins, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type RewardFilter = 'All' | 'Confirmed' | 'Pending' | 'Processing';

const FILTER_TABS: RewardFilter[] = ['All', 'Confirmed', 'Pending', 'Processing'];

export default function RewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RewardFilter>('All');

  useEffect(() => {
    getMyRewards()
      .then(setRewards)
      .catch((err) => {
        console.error(err);
        setLoadError(err instanceof Error ? err.message : 'Failed to load rewards');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = rewards.filter(
    (r) => filter === 'All' || r.status === filter,
  );

  const totalMST = rewards
    .filter((r) => r.status === 'Confirmed')
    .reduce((acc, r) => acc + r.mstAmount, 0);

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Coins size={24} className="text-emerald-400" />
            Reward History
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            MSTC rewards earned from verified challenge completions
          </p>
        </div>

        {/* Summary */}
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="sx-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <Coins size={16} className="text-emerald-400" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Total Earned</span>
            </div>
            <p className="text-3xl font-black text-emerald-400">{totalMST} MSTC</p>
          </div>
          <div className="sx-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={16} className="text-emerald-400" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Confirmed</span>
            </div>
            <p className="text-3xl font-black text-white">
              {rewards.filter((r) => r.status === 'Confirmed').length}
            </p>
          </div>
          <div className="sx-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={16} className="text-amber-400" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Pending</span>
            </div>
            <p className="text-3xl font-black text-amber-400">
              {rewards.filter((r) => r.status === 'Pending' || r.status === 'Processing').length}
            </p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 overflow-x-auto">
          {FILTER_TABS.map((f) => (
            <button
              key={f}
              id={`rewards-filter-${f.toLowerCase()}`}
              onClick={() => setFilter(f)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all',
                filter === f ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5',
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Rewards grid */}
        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-48 rounded-xl" />
            ))}
          </div>
        ) : loadError ? (
          <div className="text-center py-16 space-y-3">
            <AlertCircle size={40} className="text-rose-500 mx-auto" />
            <p className="text-slate-400 font-medium">Unable to load rewards</p>
            <p className="text-slate-600 text-sm">{loadError}</p>
            <button
              id="rewards-retry-btn"
              onClick={() => { setLoadError(null); setIsLoading(true); getMyRewards().then(setRewards).catch((e) => setLoadError(e.message)).finally(() => setIsLoading(false)); }}
              className="sx-btn sx-btn-secondary mx-auto"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <AlertCircle size={40} className="text-slate-700 mx-auto mb-4" />
            <p className="text-slate-400">No {filter === 'All' ? '' : filter.toLowerCase()} rewards yet</p>
            <p className="text-slate-600 text-sm mt-1">
              Complete verified challenges to earn MSTC rewards
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((reward) => (
              <div key={reward.id} className="space-y-2">
                <p className="text-xs text-slate-500 px-1">{reward.challengeTitle}</p>
                <MSTRewardCard
                  mstAmount={reward.mstAmount}
                  transactionHash={reward.transactionHash}
                  status={reward.status}
                />
              </div>
            ))}
          </div>
        )}

        {/* Integration note */}
        <div className="sx-card p-4 bg-blue-400/3">
          <p className="text-xs text-slate-500">
            <strong className="text-blue-400">Integration Note:</strong> On-chain MSTC transfers are processed by the 
            SECUREX smart contract (Member 4). Transaction hashes are provided by the backend after reward confirmation.
            The frontend displays reward status from{' '}
            <code className="text-slate-400 font-mono">GET /rewards</code>.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
