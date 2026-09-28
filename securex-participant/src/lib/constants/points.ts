// ============================================================
// SECUREX — Points Constants
// Centralized — EASY=100, MEDIUM=250, HARD=500
// NEVER award points without backend VERIFIED status
// ============================================================

import type { Difficulty } from '@/lib/types';

export const POINTS_BY_DIFFICULTY: Record<Difficulty, number> = {
  Easy: 100,
  Medium: 250,
  Hard: 500,
  Expert: 750,
} as const;

export const REPUTATION_BY_DIFFICULTY: Record<Difficulty, number> = {
  Easy: 10,
  Medium: 20,
  Hard: 40,
  Expert: 80,
} as const;

export const MST_REWARD_BY_DIFFICULTY: Record<Difficulty, number> = {
  Easy: 2,
  Medium: 5,
  Hard: 10,
  Expert: 20,
} as const;
