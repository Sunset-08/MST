// Backend source of truth for progression. The frontend displays these values; it does not compute awards.
import { daysBetweenUtc } from "../utils/dates.js";
import type { DbDifficulty } from "../utils/labels.js";

/** Default points when an organization does not set one (mentor defaults: Easy 100 / Medium 250 / Hard 500). */
export const DEFAULT_POINTS_BY_DIFFICULTY: Record<DbDifficulty, number> = { easy: 100, medium: 250, hard: 500, expert: 750 };

export const REPUTATION_BY_DIFFICULTY: Record<DbDifficulty, number> = { easy: 10, medium: 20, hard: 40, expert: 80 };

export const LEVELS = [
  { level: 1, minPoints: 0, title: "Recruit" },
  { level: 2, minPoints: 250, title: "Analyst" },
  { level: 3, minPoints: 600, title: "Scout" },
  { level: 4, minPoints: 1000, title: "Hunter" },
  { level: 5, minPoints: 1500, title: "Specialist" },
  { level: 6, minPoints: 2000, title: "Expert" },
  { level: 7, minPoints: 2500, title: "Veteran" },
  { level: 8, minPoints: 3000, title: "Elite" },
  { level: 9, minPoints: 4000, title: "Master" },
  { level: 10, minPoints: 6000, title: "Legend" },
] as const;

export function levelInfo(points: number) {
  let idx = 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (points >= LEVELS[i]!.minPoints) {
      idx = i;
      break;
    }
  }
  const current = LEVELS[idx]!;
  const next = LEVELS[idx + 1];
  return {
    level: current.level,
    title: current.title,
    minPoints: current.minPoints,
    nextLevelAt: next?.minPoints ?? null,
    pointsToNextLevel: next ? next.minPoints - points : 0,
  };
}

export const levelFromPoints = (points: number) => levelInfo(points).level;

/** Streak after a verified solve at `now`, given the previous activity time. Day boundaries are UTC. */
export function nextStreak(previous: { current: number; longest: number; lastActivityAt: Date | null }, now: Date) {
  let current: number;
  if (!previous.lastActivityAt) current = 1;
  else {
    const gap = daysBetweenUtc(previous.lastActivityAt, now);
    if (gap <= 0) current = Math.max(previous.current, 1);
    else if (gap === 1) current = previous.current + 1;
    else current = 1;
  }
  const longest = Math.max(previous.longest, current);
  return { current, longest, changed: current !== previous.current || longest !== previous.longest };
}

/** Current streak as displayed today: a streak whose last activity is older than yesterday has lapsed. */
export function displayedStreak(current: number, lastActivityAt: Date | null, now: Date): number {
  if (!lastActivityAt) return 0;
  return daysBetweenUtc(lastActivityAt, now) <= 1 ? current : 0;
}
