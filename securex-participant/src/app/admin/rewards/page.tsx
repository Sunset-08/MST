'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { getAdminRewards } from '@/lib/api/admin';
import type { AdminRewardEntry, RewardStatus } from '@/lib/types/admin';
import { Coins, CheckCircle, Clock, XCircle, ExternalLink } from 'lucide-react';
import { truncateAddress, cn } from '@/lib/utils';

const STATUS_CONFIG: Record<RewardStatus, { color: string; icon: React.ElementType }> = {
  Confirmed: { color: 'text-emerald-400', icon: CheckCircle },
  Pending: { color: 'text-amber-400', icon: Clock },
  Processing: { color: 'text-blue-400', icon: Clock },
  Failed: { color: 'text-rose-400', icon: XCircle },
};

export default function AdminRewardsPage() {
  const [rewards, setRewards] = useState<AdminRewardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RewardStatus | 'all'>('all');

  useEffect(() => {
    getAdminRewards().then(setRewards).finally(() => setIsLoading(false));
  }, []);

  const filtered = statusFilter === 'all' ? rewards : rewards.filter((r) => r.status === statusFilter);

  const totalConfirmed = rewards.filter((r) => r.status === 'Confirmed').reduce((a, r) => a + r.mstAmount, 0);
  const totalPending = rewards.filter((r) => r.status === 'Pending' || r.status === 'Processing').reduce((a, r) => a + r.mstAmount, 0);

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Coins size={22} className="text-emerald-400" /> Rewards
          </h1>
          <p className="text-slate-500 text-sm mt-1">Platform-wide MSTC reward distribution</p>
        </div>

        {/* Summary */}
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="sx-card p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Total Distributed</p>
            <p className="text-3xl font-black text-emerald-400">{totalConfirmed} MSTC</p>
          </div>
          <div className="sx-card p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Pending / Processing</p>
            <p className="text-3xl font-black text-amber-400">{totalPending} MSTC</p>
          </div>
          <div className="sx-card p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Total Rewards</p>
            <p className="text-3xl font-black text-white">{rewards.length}</p>
          </div>
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 flex-wrap">
          {(['all', 'Confirmed', 'Pending', 'Processing', 'Failed'] as const).map((s) => (
            <button key={s} id={`reward-filter-${s.toLowerCase()}`} onClick={() => setStatusFilter(s)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                statusFilter === s ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5')}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>

        {/* Reward cards */}
        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-44 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((reward) => {
              const { color, icon: StatusIcon } = STATUS_CONFIG[reward.status];
              return (
                <div key={reward.id} className="sx-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-mono">#{reward.id}</span>
                    <span className={`flex items-center gap-1.5 text-xs font-semibold ${color}`}>
                      <StatusIcon size={12} />
                      {reward.status}
                    </span>
                  </div>

                  <div>
                    <p className="text-2xl font-black text-emerald-400">+{reward.mstAmount} MSTC</p>
                  </div>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Participant</span>
                      <span className="text-white font-medium">@{reward.participant}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Organization</span>
                      <span className="text-white font-medium truncate max-w-28">{reward.organization}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Challenge</span>
                      <span className="text-white font-medium truncate max-w-28">{reward.challengeTitle}</span>
                    </div>
                  </div>

                  {reward.transactionHash && (
                    <a
                      href={`https://explorer.mstblockchain.com/tx/${reward.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs text-emerald-400 hover:bg-emerald-400/5 transition-colors border border-emerald-400/15"
                    >
                      <span className="font-mono">{truncateAddress(reward.transactionHash)}</span>
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
