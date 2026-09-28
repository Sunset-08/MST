'use client';

// ============================================================
// SECUREX — LevelProgress (Points-based, no XP)
// ============================================================

import { getLevelFromPoints, getLevelProgress, getPointsToNextLevel } from '@/lib/constants/levels';
import { formatPoints } from '@/lib/utils';

interface LevelProgressProps {
  points: number;
  showDetails?: boolean;
  compact?: boolean;
}

export function LevelProgress({ points, showDetails = true, compact = false }: LevelProgressProps) {
  const level = getLevelFromPoints(points);
  const progress = getLevelProgress(points);
  const remaining = getPointsToNextLevel(points);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold ${level.color}`}>Lv.{level.level}</span>
        <div className="flex-1 sx-progress-bar h-1.5">
          <div className="sx-progress-fill h-full" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs text-slate-500">{progress}%</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xl font-black ${level.color}`}>LEVEL {level.level}</span>
          <span className={`text-sm font-semibold ${level.color} opacity-70`}>{level.title}</span>
        </div>
        {showDetails && (
          <span className="text-sm text-slate-400">
            {level.maxPoints === Infinity
              ? 'Max Level'
              : `${formatPoints(remaining)} pts to next`}
          </span>
        )}
      </div>

      {showDetails && (
        <>
          <div className="sx-progress-bar">
            <div className="sx-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span className="font-bold text-white points-counter">{formatPoints(points)} pts</span>
            {level.maxPoints !== Infinity && (
              <span>{formatPoints(level.maxPoints + 1)} pts</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
