'use client';

// ============================================================
// DevArena — Participant Dashboard
// Background: Image 2 (lofi security workstation) via AppShell
// ============================================================

import { AppShell } from '@/components/layout/AppShell';
import { useParticipant } from '@/lib/context/ParticipantContext';
import { LevelProgress } from '@/components/participant/gamification/LevelProgress';
import { ActivityCalendar } from '@/components/participant/streak/ActivityCalendar';
import { ChallengeCard } from '@/components/participant/challenges/ChallengeCard';
import { formatPoints, DIFFICULTY_COLORS } from '@/lib/utils';
import { Zap, Flame, Trophy, Shield, TrendingUp, Clock, CheckCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getChallenges } from '@/lib/api/challenges';
import { getMyHistory } from '@/lib/api/profile';
import type { Challenge, ChallengeHistoryEntry, Difficulty } from '@/lib/types';

export default function DashboardPage() {
  const { participant, stats, isLoading, error, refresh } = useParticipant();
  const [featured, setFeatured] = useState<Challenge[]>([]);
  const [recent, setRecent] = useState<ChallengeHistoryEntry[]>([]);

  useEffect(() => {
    getChallenges({ status: 'Not Started', limit: 3 }).then((r) => setFeatured(r.data)).catch(() => setFeatured([]));
    getMyHistory().then((h) => setRecent(h.slice(0, 5))).catch(() => setRecent([]));
  }, []);

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-64">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
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

        {/* ── Hero Welcome Banner ── */}
        <div
          className="relative rounded-2xl overflow-hidden p-8 md:p-10"
          style={{
            background: 'rgba(8,12,30,0.4)',
            border: '1px solid rgba(0,212,255,0.08)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 0 60px rgba(0,212,255,0.03)',
          }}
        >
          {/* Neon accent line */}
          <div
            className="absolute top-0 left-0 right-0 h-0.5"
            style={{ background: 'linear-gradient(90deg, #00d4ff, #b400ff, transparent)' }}
          />

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3">
              <p
                className="text-xs font-bold tracking-[0.25em] uppercase"
                style={{ color: '#00d4ff' }}
              >
                // PARTICIPANT DASHBOARD
              </p>
              <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">
                WELCOME BACK,{' '}
                <span style={{ color: '#00d4ff' }}>
                  {(participant.displayName ?? participant.username).toUpperCase()}
                </span>
              </h1>
              <p className="text-lg font-semibold text-slate-300">
                SECURE YOUR NEXT CHALLENGE.
              </p>
              <p className="text-slate-500 text-sm max-w-md leading-relaxed">
                Solve real security issues. Build reputation. Climb the leaderboard.
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Link
                href="/challenges"
                id="dashboard-explore-btn"
                className="flex items-center gap-2 px-5 py-3 font-bold text-sm uppercase tracking-widest transition-all duration-200"
                style={{
                  background: 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)',
                  color: '#000',
                  clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
                }}
              >
                EXPLORE CHALLENGES
                <ArrowRight size={15} />
              </Link>
              <Link
                href="/leaderboard"
                id="dashboard-leaderboard-btn"
                className="flex items-center gap-2 px-5 py-3 font-bold text-sm uppercase tracking-widest transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#e2e8f0',
                }}
              >
                VIEW LEADERBOARD
              </Link>
            </div>
          </div>
        </div>

        {/* ── Stats Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Points */}
          <div
            className="p-5 space-y-2 rounded-xl"
            style={{
              background: 'rgba(8,12,30,0.4)',
              border: '1px solid rgba(0,212,255,0.08)',
              backdropFilter: 'blur(12px)',
            }}
          >
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
          <div
            className="p-5 space-y-2 rounded-xl"
            style={{
              background: 'rgba(8,12,30,0.4)',
              border: '1px solid rgba(255,166,0,0.08)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-400/10 flex items-center justify-center">
                <Flame size={16} className="text-orange-400" />
              </div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Streak</span>
            </div>
            <p className="text-3xl font-black text-orange-400">🔥 {stats.streak.current}</p>
            <p className="text-xs text-slate-600">Day streak</p>
          </div>

          {/* Rank */}
          <div
            className="p-5 space-y-2 rounded-xl"
            style={{
              background: 'rgba(8,12,30,0.4)',
              border: '1px solid rgba(139,92,246,0.08)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-400/10 flex items-center justify-center">
                <Trophy size={16} className="text-violet-400" />
              </div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Rank</span>
            </div>
            <p className="text-3xl font-black text-violet-400">🏆 #{participant.globalRank}</p>
            <p className="text-xs text-slate-600">Global rank</p>
          </div>

          {/* Reputation */}
          <div
            className="p-5 space-y-2 rounded-xl"
            style={{
              background: 'rgba(8,12,30,0.4)',
              border: '1px solid rgba(0,212,255,0.08)',
              backdropFilter: 'blur(12px)',
            }}
          >
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
                <TrendingUp size={18} style={{ color: '#00d4ff' }} />
                Available Challenges
              </h2>
              <Link href="/challenges" className="text-sm transition-colors" style={{ color: '#00d4ff' }}>
                View all →
              </Link>
            </div>

            <div className="space-y-4">
              {featured.map((c) => (
                <ChallengeCard key={c.id} challenge={c} />
              ))}
              {featured.length === 0 && (
                <div className="sx-card p-6 text-center text-sm text-slate-500">
                  No new challenges available right now. Check back after organizations publish more.
                </div>
              )}
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
                  <span className="font-bold text-orange-400">🔥 {stats.streak.current} days</span>
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
                {recent.length === 0 && <p className="text-sm text-slate-500">No activity yet. Start a challenge to get going.</p>}
                {recent.map((entry) => (
                  <div key={entry.challengeId} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-300 truncate">{entry.title}</p>
                      <p className={`text-xs font-medium ${DIFFICULTY_COLORS[entry.difficulty]}`}>
                        {entry.difficulty}
                      </p>
                    </div>
                    {entry.status === 'Verified' ? (
                      <span className="text-xs text-emerald-400 flex-shrink-0 flex items-center gap-1">
                        <CheckCircle size={12} /> Verified
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 flex-shrink-0">{entry.status}</span>
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
