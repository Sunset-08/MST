'use client';

// ============================================================
// SECUREX — Profile Page
// Points, Reputation, Streak, History, Security Stats
// ============================================================

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useParticipant } from '@/lib/context/ParticipantContext';
import { LevelProgress } from '@/components/participant/gamification/LevelProgress';
import { ActivityCalendar } from '@/components/participant/streak/ActivityCalendar';
import { MSTRewardCard } from '@/components/participant/verification/VerificationResult';
import { WalletButton } from '@/components/participant/wallet/WalletButton';
import { getMyHistory, getMyRewards } from '@/lib/api/profile';
import { GitHubConnect } from '@/components/participant/github/GitHubConnect';
import { formatPoints, DIFFICULTY_BG, DIFFICULTY_COLORS, STATUS_COLORS, CATEGORY_COLORS, cn } from '@/lib/utils';
import { formatRelativeDate } from '@/lib/utils';
import type { ChallengeHistoryEntry, Difficulty, Reward } from '@/lib/types';
import {
  Zap, Flame, Trophy, Shield, CheckCircle, Clock,
  BarChart3, GitBranch, Wallet2, Award, Filter
} from 'lucide-react';
import { getLevelFromPoints } from '@/lib/constants/levels';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip
} from 'recharts';

type ProfileTab = 'overview' | 'history' | 'rewards' | 'stats';

const TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'Challenge History' },
  { id: 'rewards', label: 'Reward History' },
  { id: 'stats', label: 'Security Stats' },
];

export default function ProfilePage() {
  const { participant, stats, isLoading, error, refresh } = useParticipant();
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [historyFilter, setHistoryFilter] = useState<Difficulty | 'All'>('All');

  const [allHistory, setAllHistory] = useState<ChallengeHistoryEntry[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);

  useEffect(() => {
    getMyHistory().then(setAllHistory).catch(() => setAllHistory([]));
    getMyRewards().then(setRewards).catch(() => setRewards([]));
  }, []);

  const history = allHistory.filter((e) => historyFilter === 'All' || e.difficulty === historyFilter);

  const securityStats = (stats?.securityStats ?? []).map((s) => ({
    category: s.category.split('/')[0].trim(),
    score: s.score,
  }));

  // Points per difficulty come from the recorded awards, not from client-side constants.
  const pointsByDifficulty = allHistory
    .filter((e) => e.status === 'Verified')
    .reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.difficulty]: (acc[e.difficulty] ?? 0) + e.pointsAwarded }), {});

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="skeleton h-32 w-full rounded-2xl" />
          <div className="skeleton h-64 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (error || !participant || !stats) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto text-center py-20 space-y-4">
          <Trophy size={40} className="text-slate-600 mx-auto" />
          <h2 className="text-lg font-bold text-white">Unable to load profile</h2>
          <p className="text-slate-500 text-sm">
            {error ?? 'Profile data could not be loaded.'}
          </p>
          <button
            id="profile-retry-btn"
            onClick={() => refresh()}
            className="sx-btn sx-btn-secondary mx-auto"
          >
            Retry
          </button>
        </div>
      </AppShell>
    );
  }

  const levelInfo = getLevelFromPoints(participant.points);

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Profile header */}
        <div className="sx-card p-6 lg:p-8">
          <div className="flex items-start gap-5 flex-wrap">
            {/* Avatar */}
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white font-black text-3xl">
                {(participant.displayName?.[0] ?? participant.username[0]).toUpperCase()}
              </div>
              <div className={`absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--sx-bg-base)] border border-white/10 ${levelInfo.color}`}>
                Lv.{levelInfo.level}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-3 flex-wrap">
                <div>
                  <h1 className="text-2xl font-black text-white">
                    {participant.displayName ?? participant.username}
                  </h1>
                  <p className="text-slate-500 text-sm">@{participant.username}</p>
                </div>
              </div>

              {/* Quick stats */}
              <div className="flex items-center gap-5 mt-4 flex-wrap">
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Points</p>
                  <p className="font-black text-amber-400 text-xl points-counter">
                    {formatPoints(participant.points)}
                  </p>
                </div>
                <div className="w-px h-10 bg-white/5" />
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Reputation</p>
                  <p className="font-black text-cyan-400 text-xl">{participant.reputation}</p>
                </div>
                <div className="w-px h-10 bg-white/5" />
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Global Rank</p>
                  <p className="font-black text-violet-400 text-xl">#{participant.globalRank}</p>
                </div>
                <div className="w-px h-10 bg-white/5" />
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Solved</p>
                  <p className="font-black text-white text-xl">{participant.challengesSolved}</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              {participant.githubUsername && (
                <a
                  href={`https://github.com/${participant.githubUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sx-btn sx-btn-secondary sx-btn-sm gap-2"
                >
                  <GitBranch size={14} />
                  GitHub
                </a>
              )}
              <WalletButton />
            </div>
          </div>

          {/* Level progress */}
          <div className="mt-6 pt-6 border-t border-white/5">
            <LevelProgress points={participant.points} />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              id={`profile-tab-${id}`}
              onClick={() => setActiveTab(id)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all',
                activeTab === id
                  ? 'bg-blue-500 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/5',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <div className="grid sm:grid-cols-2 gap-6 animate-fade-in">
            {/* Solved by difficulty */}
            <div className="sx-card p-5">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400" />
                Challenges Solved
              </h3>
              <p className="text-3xl font-black text-white mb-4">{stats.challengesSolved}</p>
              <div className="space-y-3">
                {(['Easy', 'Medium', 'Hard', 'Expert'] as Difficulty[]).map((diff) => {
                  const count = stats.solvedByDifficulty[diff] ?? 0;
                  const pts = pointsByDifficulty[diff] ?? 0;
                  return (
                    <div key={diff} className="flex items-center gap-3">
                      <span className={cn('sx-badge', DIFFICULTY_BG[diff], 'w-16 justify-center')}>
                        {diff}
                      </span>
                      <span className="text-white font-bold">{count}</span>
                      <span className="text-slate-600 text-sm ml-auto points-counter">+{formatPoints(pts)} pts</span>
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                  <span className="text-slate-400 text-sm font-medium">Total</span>
                  <span className="text-amber-400 font-black points-counter">
                    {formatPoints(participant.points)} pts ✓
                  </span>
                </div>
              </div>
            </div>

            {/* Streak */}
            <div className="sx-card p-5">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <Flame size={16} className="text-orange-400" />
                Streak
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Current Streak</p>
                  <p className="text-3xl font-black text-orange-400">{stats.streak.current} days 🔥</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Longest Streak</p>
                  <p className="text-xl font-bold text-white">{stats.streak.longest} days</p>
                </div>
              </div>
            </div>

            {/* Reputation + Points separation explained */}
            <div className="sx-card p-5">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <Shield size={16} className="text-cyan-400" />
                Reputation
              </h3>
              <p className="text-3xl font-black text-cyan-400 mb-2">{participant.reputation}</p>
              <p className="text-xs text-slate-500">
                Reputation represents your verified contribution history. 
                It is separate from Points and grows with each verified submission.
              </p>
            </div>

            {/* GitHub + wallet */}
            <div className="sx-card p-5 space-y-4">
              <h3 className="font-bold text-white flex items-center gap-2">
                <GitBranch size={16} className="text-slate-300" />
                Connected accounts
              </h3>
              <GitHubConnect />
              <div>
                <p className="text-xs text-slate-500 mb-2">Linked wallets</p>
                {participant.wallets.length === 0 ? (
                  <p className="text-sm text-slate-500">No wallet linked yet. Use the wallet button in the top bar to connect and link one.</p>
                ) : (
                  <ul className="space-y-1">
                    {participant.wallets.map((wl) => (
                      <li key={wl.id} className="text-xs font-mono text-slate-300 flex items-center gap-2">
                        <Wallet2 size={12} className="text-emerald-400" /> {wl.address}
                        {wl.isPrimary && <span className="sx-badge bg-emerald-400/10 text-emerald-400 border-emerald-400/20 text-[10px]">primary</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="sx-card p-6 animate-fade-in">
            <h3 className="font-bold text-white mb-6 flex items-center gap-2">
              <Flame size={16} className="text-orange-400" />
              Activity Calendar
            </h3>
            <ActivityCalendar streak={stats.streak} />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="sx-card p-5 animate-fade-in">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Clock size={16} className="text-slate-400" />
                Challenge History
              </h3>
              <div className="flex items-center gap-1">
                <Filter size={14} className="text-slate-500" />
                {(['All', 'Easy', 'Medium', 'Hard'] as const).map((d) => (
                  <button
                    key={d}
                    id={`history-filter-${d.toLowerCase()}`}
                    onClick={() => setHistoryFilter(d)}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-semibold transition-all',
                      historyFilter === d
                        ? 'bg-blue-500 text-white'
                        : 'text-slate-400 hover:text-white',
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {history.length === 0 && <p className="text-sm text-slate-500 p-3">No challenge activity yet.</p>}
              {history.map((entry) => (
                <div
                  key={entry.challengeId}
                  className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/3 transition-colors flex-wrap"
                >
                  <span className={cn('sx-badge', DIFFICULTY_BG[entry.difficulty], 'flex-shrink-0')}>
                    {entry.difficulty}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm truncate">{entry.title}</p>
                    <p className={`text-xs ${CATEGORY_COLORS[entry.category] ?? 'text-slate-500'}`}>
                      {entry.category}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-black text-amber-400 text-sm points-counter">
                      +{formatPoints(entry.pointsAwarded)} pts
                    </p>
                    <p className={`text-xs ${entry.status === 'Verified' ? 'text-emerald-400' : entry.status === 'Failed' ? 'text-rose-400' : 'text-slate-400'}`}>
                      {entry.status === 'Verified' ? '✅ Verified' : entry.status}
                    </p>
                  </div>
                  {entry.completedAt && (
                    <p className="text-xs text-slate-600 hidden lg:block flex-shrink-0 w-20 text-right">
                      {formatRelativeDate(entry.completedAt)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'rewards' && (
          <div className="animate-fade-in space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rewards.map((reward) => (
                <MSTRewardCard
                  key={reward.id}
                  mstAmount={reward.mstAmount}
                  transactionHash={reward.transactionHash}
                  status={reward.status}
                />
              ))}
            </div>
            {rewards.length === 0 && (
              <div className="text-center py-16 text-slate-500">
                <Wallet2 size={40} className="mx-auto mb-3 opacity-30" />
                <p>No rewards yet. Complete a verified challenge to earn MSTC.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="sx-card p-6 animate-fade-in">
            <h3 className="font-bold text-white mb-6 flex items-center gap-2">
              <BarChart3 size={16} className="text-blue-400" />
              Security Category Stats
            </h3>

            <div className="grid sm:grid-cols-2 gap-6">
              {/* Radar chart */}
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={securityStats}>
                    <PolarGrid stroke="rgba(255,255,255,0.05)" />
                    <PolarAngleAxis
                      dataKey="category"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                    />
                    <Radar
                      dataKey="score"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.2}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#131a2e',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        color: '#f1f5f9',
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Bar list */}
              <div className="space-y-3">
                {(stats?.securityStats ?? []).map((stat) => (
                  <div key={stat.category}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-slate-400 truncate">{stat.category}</span>
                      <span className="font-bold text-white">{stat.score}</span>
                    </div>
                    <div className="sx-progress-bar h-1.5">
                      <div
                        className="sx-progress-fill h-full"
                        style={{ width: `${stat.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
