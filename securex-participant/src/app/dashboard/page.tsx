'use client';

// ============================================================
// SECUREX — Dashboard Page
// ============================================================

import { AppShell } from '@/components/layout/AppShell';
import { useParticipant } from '@/lib/context/ParticipantContext';
import { LevelProgress } from '@/components/participant/gamification/LevelProgress';
import { ActivityCalendar } from '@/components/participant/streak/ActivityCalendar';
import { ChallengeCard } from '@/components/participant/challenges/ChallengeCard';
import { formatPoints, DIFFICULTY_COLORS } from '@/lib/utils';
import { Zap, Flame, Trophy, Shield, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { MOCK_CHALLENGES, MOCK_CHALLENGE_HISTORY } from '@/lib/api/mock/data';
import type { Difficulty } from '@/lib/types';

const FEATURED_CHALLENGES = MOCK_CHALLENGES.filter(
  (c) => !c.status || c.status === 'Not Started',
).slice(0, 3);

const RECENT_ACTIVITY = MOCK_CHALLENGE_HISTORY.slice(0, 5);

export default function DashboardPage() {
  const { participant, stats, isLoading, error, refresh } = useParticipant();

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-64">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (error || !participant || !stats) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto text-center py-20 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-400/10 border border-rose-400/20 flex items-center justify-center mx-auto">
            <Trophy size={28} className="text-rose-400" />
          </div>
          <h2 className="text-lg font-bold text-white">Unable to load dashboard</h2>
          <p className="text-slate-500 text-sm">
            {error ?? 'Participant data could not be loaded. Please try again.'}
          </p>
          <button
            id="dashboard-retry-btn"
            onClick={() => refresh()}
            className="sx-btn sx-btn-secondary mx-auto"
          >
            Retry
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Welcome */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Welcome back, <span className="gradient-text">{participant.displayName ?? participant.username}</span> 👋
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Keep solving challenges to climb the leaderboard
            </p>
          </div>
          <Link href="/challenges" id="dashboard-explore-btn" className="sx-btn sx-btn-primary hidden sm:flex">
            Explore Challenges
          </Link>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Points */}
          <div className="sx-card p-5 space-y-2 glow-blue">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-400/10 flex items-center justify-center">
                <Zap size={16} className="text-amber-400" />
              </div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Points</span>
            </div>
            <p className="text-3xl font-black text-amber-400 points-counter">
              {formatPoints(participant.points)}
            </p>
            <p className="text-xs text-slate-600">Total earned</p>
          </div>

          {/* Streak */}
          <div className="sx-card p-5 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-400/10 flex items-center justify-center">
                <Flame size={16} className="text-orange-400" />
              </div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Streak</span>
            </div>
            <p className="text-3xl font-black text-orange-400">{stats.streak.current}</p>
            <p className="text-xs text-slate-600">Day streak 🔥</p>
          </div>

          {/* Rank */}
          <div className="sx-card p-5 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-400/10 flex items-center justify-center">
                <Trophy size={16} className="text-violet-400" />
              </div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Rank</span>
            </div>
            <p className="text-3xl font-black text-violet-400">#{participant.globalRank}</p>
            <p className="text-xs text-slate-600">Global rank</p>
          </div>

          {/* Reputation */}
          <div className="sx-card p-5 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-400/10 flex items-center justify-center">
                <Shield size={16} className="text-cyan-400" />
              </div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Reputation</span>
            </div>
            <p className="text-3xl font-black text-cyan-400">{participant.reputation}</p>
            <p className="text-xs text-slate-600">Verified contributions</p>
          </div>
        </div>

        {/* Level progress */}
        <div className="sx-card p-6">
          <LevelProgress points={participant.points} />
        </div>

        {/* Main grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Featured challenges — left col */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <TrendingUp size={18} className="text-blue-400" />
                Available Challenges
              </h2>
              <Link href="/challenges" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                View all →
              </Link>
            </div>

            <div className="space-y-4">
              {FEATURED_CHALLENGES.map((c) => (
                <ChallengeCard key={c.id} challenge={c} />
              ))}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="space-y-5">
            {/* Progress breakdown */}
            <div className="sx-card p-5">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400" />
                Security Progress
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Challenges Solved</span>
                  <span className="font-bold text-white">{stats.challengesSolved}</span>
                </div>
                {(['Easy', 'Medium', 'Hard', 'Expert'] as Difficulty[]).map((diff) => {
                  const count = stats.solvedByDifficulty[diff] ?? 0;
                  if (count === 0) return null;
                  return (
                    <div key={diff} className="flex items-center justify-between text-sm">
                      <span className={`font-medium ${DIFFICULTY_COLORS[diff]}`}>{diff}</span>
                      <span className="text-slate-400">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Streak info */}
            <div className="sx-card p-5">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <Flame size={16} className="text-orange-400" />
                Streak
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Current Streak</span>
                  <span className="font-bold text-orange-400">{stats.streak.current} days</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Longest Streak</span>
                  <span className="font-bold text-white">{stats.streak.longest} days</span>
                </div>
              </div>
            </div>

            {/* Recent activity */}
            <div className="sx-card p-5">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <Clock size={16} className="text-slate-400" />
                Recent Activity
              </h3>
              <div className="space-y-3">
                {RECENT_ACTIVITY.map((entry) => (
                  <div key={entry.challengeId} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-300 truncate">{entry.title}</p>
                      <p className={`text-xs font-medium ${DIFFICULTY_COLORS[entry.difficulty]}`}>
                        {entry.difficulty}
                      </p>
                    </div>
                    {entry.status === 'Verified' && (
                      <span className="text-xs text-emerald-400 flex-shrink-0 flex items-center gap-1">
                        <CheckCircle size={12} /> Verified
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Activity Calendar */}
        <div className="sx-card p-6">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Flame size={18} className="text-orange-400" />
            Security Activity
          </h2>
          <ActivityCalendar streak={stats.streak} />
        </div>
      </div>
    </AppShell>
  );
}
