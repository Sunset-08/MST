// ============================================================
// SECUREX — Level Thresholds (Points-based progression)
// Points → Level  — NO XP
// ============================================================

export interface LevelThreshold {
  level: number;
  minPoints: number;
  maxPoints: number;
  title: string;
  color: string; // tailwind color class
}

export const LEVEL_THRESHOLDS: LevelThreshold[] = [
  { level: 1, minPoints: 0, maxPoints: 249, title: 'Recruit', color: 'text-slate-400' },
  { level: 2, minPoints: 250, maxPoints: 599, title: 'Analyst', color: 'text-green-400' },
  { level: 3, minPoints: 600, maxPoints: 999, title: 'Scout', color: 'text-teal-400' },
  { level: 4, minPoints: 1000, maxPoints: 1499, title: 'Hunter', color: 'text-cyan-400' },
  { level: 5, minPoints: 1500, maxPoints: 1999, title: 'Specialist', color: 'text-blue-400' },
  { level: 6, minPoints: 2000, maxPoints: 2499, title: 'Expert', color: 'text-indigo-400' },
  { level: 7, minPoints: 2500, maxPoints: 2999, title: 'Veteran', color: 'text-violet-400' },
  { level: 8, minPoints: 3000, maxPoints: 3999, title: 'Elite', color: 'text-purple-400' },
  { level: 9, minPoints: 4000, maxPoints: 5999, title: 'Master', color: 'text-fuchsia-400' },
  { level: 10, minPoints: 6000, maxPoints: Infinity, title: 'Legend', color: 'text-amber-400' },
] as const;

/**
 * Returns the level info for a given total points value.
 * Uses Points — not XP.
 */
export function getLevelFromPoints(points: number): LevelThreshold {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (points >= LEVEL_THRESHOLDS[i].minPoints) {
      return LEVEL_THRESHOLDS[i];
    }
  }
  return LEVEL_THRESHOLDS[0];
}

/**
 * Returns progress percentage within current level (0–100).
 */
export function getLevelProgress(points: number): number {
  const level = getLevelFromPoints(points);
  if (level.maxPoints === Infinity) return 100;
  const range = level.maxPoints - level.minPoints;
  const progress = points - level.minPoints;
  return Math.min(100, Math.round((progress / range) * 100));
}

/**
 * Returns points needed to reach next level.
 */
export function getPointsToNextLevel(points: number): number {
  const level = getLevelFromPoints(points);
  if (level.maxPoints === Infinity) return 0;
  return level.maxPoints - points + 1;
}
