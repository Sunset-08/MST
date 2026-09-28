'use client';

// ============================================================
// SECUREX — Challenge Detail Page
// ============================================================

import { use, useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { getChallengeById, startChallenge } from '@/lib/api/challenges';
import type { Challenge } from '@/lib/types';
import { DIFFICULTY_BG, CATEGORY_COLORS, cn, formatPoints } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Zap, Coins, GitBranch, Hash, Users, CheckCircle,
  ExternalLink, Play, Info, Tag
} from 'lucide-react';

export default function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    getChallengeById(id)
      .then(setChallenge)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [id]);

  async function handleStart() {
    if (!challenge) return;
    setStarting(true);
    try {
      await startChallenge(challenge.id);
      router.push(`/challenges/${challenge.id}/workspace`);
    } catch {
      setStarting(false);
    }
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="skeleton h-8 w-32" />
          <div className="skeleton h-12 w-2/3" />
          <div className="skeleton h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  if (!challenge) {
    return (
      <AppShell>
        <div className="text-center py-20">
          <p className="text-slate-400">Challenge not found</p>
          <Link href="/challenges" className="sx-btn sx-btn-secondary mt-4 inline-flex">
            Browse Challenges
          </Link>
        </div>
      </AppShell>
    );
  }

  const categoryColor = CATEGORY_COLORS[challenge.category] ?? 'text-slate-400';

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <Link
          href="/challenges"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Challenges
        </Link>

        {/* Header */}
        <div className="sx-card p-6 lg:p-8 space-y-5">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('sx-badge', DIFFICULTY_BG[challenge.difficulty])}>
                  {challenge.difficulty.toUpperCase()}
                </span>
                <span className={`text-xs font-semibold uppercase tracking-widest ${categoryColor}`}>
                  {challenge.category}
                </span>
                {challenge.status && challenge.status !== 'Not Started' && (
                  <span className="sx-badge sx-badge-verified">
                    {challenge.status}
                  </span>
                )}
              </div>
              <h1 className="text-2xl lg:text-3xl font-black text-white leading-tight">
                {challenge.title}
              </h1>
            </div>
          </div>

          {/* Rewards */}
          <div className="flex items-center gap-6 py-4 border-y border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-400/10 flex items-center justify-center">
                <Zap size={16} className="text-amber-400" />
              </div>
              <div>
                <p className="text-xl font-black text-amber-400 points-counter">
                  +{formatPoints(challenge.pointsReward)}
                </p>
                <p className="text-xs text-slate-500">Points on verification</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-400/10 flex items-center justify-center">
                <Coins size={16} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-xl font-black text-emerald-400">+{challenge.mstReward} MSTC</p>
                <p className="text-xs text-slate-500">On-chain reward</p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-3">
              Description
            </h2>
            <p className="text-slate-300 leading-relaxed">{challenge.description}</p>
          </div>

          {/* Meta info */}
          <div className="grid sm:grid-cols-2 gap-4">
            {challenge.githubRepo && (
              <div className="flex items-start gap-3">
                <GitBranch size={16} className="text-slate-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-600 mb-0.5">GitHub Repository</p>
                  <a
                    href={`https://github.com/${challenge.githubRepo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    {challenge.githubRepo}
                    <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            )}
            {challenge.githubIssueNumber && (
              <div className="flex items-start gap-3">
                <Hash size={16} className="text-slate-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-600 mb-0.5">Security Issue</p>
                  <p className="text-sm text-white">#{challenge.githubIssueNumber}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <Users size={16} className="text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-600 mb-0.5">Attempts</p>
                <p className="text-sm text-white">{challenge.attempts.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-600 mb-0.5">Solved</p>
                <p className="text-sm text-emerald-400 font-semibold">
                  {challenge.solved.toLocaleString()} participants
                </p>
              </div>
            </div>
          </div>

          {/* Tags */}
          {challenge.tags && challenge.tags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Tag size={14} className="text-slate-500" />
              {challenge.tags.map((tag) => (
                <span key={tag} className="sx-badge bg-white/5 border border-white/10 text-slate-400">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Challenge type info */}
          <div className="bg-blue-400/5 border border-blue-400/15 rounded-xl p-4 flex items-start gap-3">
            <Info size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-300">
                {challenge.type} Challenge
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {challenge.type === 'Fix'
                  ? 'Identify and submit a fix for the vulnerability in the repository.'
                  : challenge.type === 'Investigation'
                  ? 'Investigate the issue and answer structured questions about the vulnerability.'
                  : challenge.type === 'SecurityReport'
                  ? 'Write a full security report documenting the vulnerability, impact, and remediation.'
                  : 'Implement a code solution and submit your approach.'}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                ⚠️ Points are awarded <strong className="text-white">only after backend verification</strong>.
              </p>
            </div>
          </div>

          {/* CTA */}
          <button
            id={`start-challenge-${challenge.id}`}
            onClick={handleStart}
            disabled={starting || challenge.status === 'Verified'}
            className={cn(
              'sx-btn sx-btn-lg w-full gap-3',
              challenge.status === 'Verified'
                ? 'sx-btn-success'
                : 'sx-btn-primary',
            )}
          >
            {starting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Starting...
              </>
            ) : challenge.status === 'Verified' ? (
              <>
                <CheckCircle size={20} />
                Challenge Completed
              </>
            ) : (
              <>
                <Play size={20} />
                Start Challenge
              </>
            )}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
