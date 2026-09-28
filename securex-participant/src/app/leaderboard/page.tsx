'use client';

// ============================================================
// SECUREX — Leaderboard Page
// Primary metric: POINTS (no XP)
// ============================================================

import { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { getLeaderboard } from '@/lib/api/leaderboard';
import { useParticipant } from '@/lib/context/ParticipantContext';
import type { LeaderboardEntry, LeaderboardPeriod } from '@/lib/types';
import { formatPoints, cn } from '@/lib/utils';
import { Trophy, Flame, CheckCircle, Crown } from 'lucide-react';
import { getLevelFromPoints } from '@/lib/constants/levels';

function getLevel(pts: number) { return getLevelFromPoints(pts); }

const PERIODS: Array<{ value: LeaderboardPeriod; label: string }> = [
  { value: 'global', label: 'Global' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'organization', label: 'Organization' },
];

function RankDisplay({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <div className="w-8 h-8 rounded-full bg-amber-400/20 flex items-center justify-center">
        <Crown size={16} className="text-amber-400 rank-gold" />
      </div>
    );
  if (rank === 2)
    return (
      <div className="w-8 h-8 rounded-full bg-slate-400/20 flex items-center justify-center">
        <Trophy size={16} className="rank-silver" />
      </div>
    );
  if (rank === 3)
    return (
      <div className="w-8 h-8 rounded-full bg-amber-700/20 flex items-center justify-center">
        <Trophy size={16} className="rank-bronze" />
      </div>
    );
  return (
    <span className="text-sm font-bold text-slate-500 w-8 text-center">
      {rank}
    </span>
  );
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const level = getLevel(entry.points);

  return (
    <div
      className={cn(
        'flex items-center gap-4 p-3 rounded-xl transition-colors',
        entry.isCurrentUser
          ? 'bg-blue-500/10 border border-blue-500/25'
          : 'hover:bg-white/3',
      )}
    >
      <RankDisplay rank={entry.rank} />

      {/* Avatar */}
      <div
        className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0',
          entry.isCurrentUser
            ? 'bg-gradient-to-br from-blue-500 to-violet-500'
            : 'bg-gradient-to-br from-slate-600 to-slate-700',
        )}
      >
        {(entry.displayName?.[0] ?? entry.username[0]).toUpperCase()}
      </div>

      {/* Name + level */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn('font-semibold truncate', entry.isCurrentUser ? 'text-blue-300' : 'text-white')}>
            {entry.displayName ?? entry.username}
          </p>
          {entry.isCurrentUser && (
            <span className="sx-badge bg-blue-500/15 text-blue-400 border-blue-500/25 text-[10px]">
              You
            </span>
          )}
        </div>
        <p className={`text-xs ${level.color} font-medium`}>
          Lv.{level.level} {level.title}
        </p>
      </div>

      {/* Stats */}
      <div className="hidden sm:flex items-center gap-6 text-sm">
        <div className="text-center">
          <p className="font-bold text-white points-counter">{formatPoints(entry.points)}</p>
          <p className="text-xs text-slate-600">pts</p>
        </div>
        <div className="text-center hidden md:block">
          <p className="font-bold text-white">{entry.challengesSolved}</p>
          <p className="text-xs text-slate-600">solved</p>
        </div>
        {entry.currentStreak !== undefined && (
          <div className="text-center hidden lg:block">
            <p className="font-bold text-orange-400 flex items-center gap-1 justify-center">
              <Flame size={12} />
              {entry.currentStreak}
            </p>
            <p className="text-xs text-slate-600">streak</p>
          </div>
        )}
      </div>

      {/* Mobile points */}
      <div className="sm:hidden">
        <p className="font-bold text-amber-400 points-counter text-right">
          {formatPoints(entry.points)}
        </p>
        <p className="text-xs text-slate-500 text-right">{entry.challengesSolved} solved</p>
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const { participant } = useParticipant();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [period, setPeriod] = useState<LeaderboardPeriod>('global');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    getLeaderboard({ period })
      .then(setEntries)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [period]);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  const currentUserEntry = entries.find((e) => e.isCurrentUser);

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Trophy size={24} className="text-amber-400" />
            Leaderboard
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Rankings are based on total verified Points
          </p>
        </div>

        {/* Period filter */}
        <div className="flex items-center gap-2 bg-white/3 rounded-xl p-1 w-fit">
          {PERIODS.map(({ value, label }) => (
            <button
              key={value}
              id={`leaderboard-filter-${value}`}
              onClick={() => setPeriod(value)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                period === value
                  ? 'bg-blue-500 text-white'
                  : 'text-slate-400 hover:text-white',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Current user quick view */}
        {currentUserEntry && (
          <div className="sx-card p-4 flex items-center gap-4">
            <div className="text-sm text-slate-500 flex-shrink-0">Your rank</div>
            <div className="flex-1 flex items-center gap-3">
              <span className="text-2xl font-black text-blue-400">
                #{currentUserEntry.rank}
              </span>
              <div>
                <p className="font-bold text-white points-counter">
                  {formatPoints(currentUserEntry.points)} Points
                </p>
                <p className="text-xs text-slate-500">
                  {currentUserEntry.challengesSolved} challenges solved
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Top 3 podium */}
        {!isLoading && top3.length === 3 && (
          <div className="grid grid-cols-3 gap-3">
            {/* Silver (2nd) */}
            <div className="sx-card p-4 text-center order-1 mt-8">
              <div className="w-12 h-12 rounded-full bg-slate-600 mx-auto mb-2 flex items-center justify-center text-white font-bold text-lg">
                {top3[1].username[0].toUpperCase()}
              </div>
              <div className="text-lg font-bold rank-silver mb-1">🥈</div>
              <p className="text-sm font-semibold text-white truncate">{top3[1].username}</p>
              <p className="text-xs text-slate-500 mt-0.5 points-counter">{formatPoints(top3[1].points)} pts</p>
            </div>
            {/* Gold (1st) */}
            <div className="sx-card p-4 text-center order-2 glow-blue border-amber-400/20">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 mx-auto mb-2 flex items-center justify-center text-white font-bold text-xl">
                {top3[0].username[0].toUpperCase()}
              </div>
              <div className="text-xl font-bold rank-gold mb-1">👑</div>
              <p className="font-bold text-white truncate">{top3[0].username}</p>
              <p className="text-xs text-amber-400 font-bold mt-0.5 points-counter">{formatPoints(top3[0].points)} pts</p>
            </div>
            {/* Bronze (3rd) */}
            <div className="sx-card p-4 text-center order-3 mt-12">
              <div className="w-12 h-12 rounded-full bg-amber-900/50 mx-auto mb-2 flex items-center justify-center text-white font-bold text-lg">
                {top3[2].username[0].toUpperCase()}
              </div>
              <div className="text-lg font-bold rank-bronze mb-1">🥉</div>
              <p className="text-sm font-semibold text-white truncate">{top3[2].username}</p>
              <p className="text-xs text-slate-500 mt-0.5 points-counter">{formatPoints(top3[2].points)} pts</p>
            </div>
          </div>
        )}

        {/* Full table */}
        <div className="sx-card p-2">
          {/* Header */}
          <div className="flex items-center gap-4 px-3 py-2 text-xs font-semibold text-slate-600 uppercase tracking-widest">
            <span className="w-8">Rank</span>
            <span className="w-9" />
            <span className="flex-1">Participant</span>
            <span className="hidden sm:block w-20 text-right">Points</span>
            <span className="hidden md:block w-16 text-right">Solved</span>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {entries.map((entry) => (
                <LeaderboardRow key={entry.participantId} entry={entry} />
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-center text-slate-600">
          Rankings update after each verified submission.
          Points are awarded only for <CheckCircle size={11} className="inline text-emerald-400" /> Verified challenges.
        </p>
      </div>
    </AppShell>
  );
}
