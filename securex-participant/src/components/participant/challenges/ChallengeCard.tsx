'use client';

// ============================================================
// SECUREX — ChallengeCard
// ============================================================

import Link from 'next/link';
import { Users, CheckCircle, Zap, Coins, ArrowRight } from 'lucide-react';
import type { Challenge } from '@/lib/types';
import { DIFFICULTY_BG, CATEGORY_COLORS, STATUS_COLORS, cn, formatPoints } from '@/lib/utils';

interface ChallengeCardProps {
  challenge: Challenge;
}

const CATEGORY_ICON: Record<string, string> = {
  'Smart Contract': '⛓',
  'Web Security': '🌐',
  'API Security': '🔌',
  Authentication: '🔐',
  Authorization: '🛡',
  Cryptography: '🔑',
  'Dependency / Supply Chain': '📦',
  'Cloud / Infrastructure': '☁️',
  DevSecOps: '🛠',
  'Frontend Security': '🖼',
  'Backend Security': '⚙️',
  'Database Security': '🗄',
  Privacy: '👁',
  Configuration: '⚙️',
};

export function ChallengeCard({ challenge }: ChallengeCardProps) {
  const categoryColor = CATEGORY_COLORS[challenge.category] ?? 'text-slate-400';
  const statusStyle = challenge.status ? STATUS_COLORS[challenge.status] : null;

  return (
    <div className="sx-card sx-card-interactive p-5 flex flex-col gap-4 group">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {/* Difficulty badge */}
            <span className={cn('sx-badge', DIFFICULTY_BG[challenge.difficulty])}>
              {challenge.difficulty.toUpperCase()}
            </span>

            {/* Status badge (if user has started) */}
            {challenge.status && challenge.status !== 'Not Started' && (
              <span className={cn('sx-badge', statusStyle ?? '')}>
                {challenge.status === 'Verified' ? '✅ ' : ''}{challenge.status}
              </span>
            )}
          </div>

          <h3 className="font-bold text-white text-base leading-tight group-hover:text-blue-300 transition-colors line-clamp-2">
            {challenge.title}
          </h3>
        </div>

        {/* Category icon */}
        <div className="text-2xl flex-shrink-0 mt-0.5">
          {CATEGORY_ICON[challenge.category] ?? '🔒'}
        </div>
      </div>

      {/* Category */}
      <p className={cn('text-xs font-semibold uppercase tracking-widest', categoryColor)}>
        {challenge.category}
      </p>

      {/* Description */}
      <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
        {challenge.shortDescription}
      </p>

      {/* Rewards */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Zap size={14} className="text-amber-400" />
          <span className="text-sm font-bold text-amber-400 points-counter">
            +{formatPoints(challenge.pointsReward)} pts
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Coins size={14} className="text-emerald-400" />
          <span className="text-sm font-bold text-emerald-400">
            +{challenge.mstReward} MSTC
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Users size={11} />
            {challenge.attempts.toLocaleString()} attempts
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle size={11} className="text-emerald-500" />
            {challenge.solved.toLocaleString()} solved
          </span>
        </div>

        <Link
          href={`/challenges/${challenge.id}`}
          id={`challenge-card-start-${challenge.id}`}
          className="sx-btn sx-btn-sm sx-btn-primary flex items-center gap-1 group-hover:gap-2 transition-all"
        >
          {challenge.status === 'Verified' ? 'Review' : 'Start'}
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}
