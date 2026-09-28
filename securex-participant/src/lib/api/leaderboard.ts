// ============================================================
// SECUREX — Leaderboard API Service
// ============================================================

import type { LeaderboardEntry, LeaderboardFilters } from '@/lib/types';
import { USE_MOCK, apiGet } from './client';
import { MOCK_LEADERBOARD } from './mock/data';

export async function getLeaderboard(
  filters?: LeaderboardFilters,
): Promise<LeaderboardEntry[]> {
  if (USE_MOCK) return MOCK_LEADERBOARD;
  const period = filters?.period ?? 'global';
  return apiGet(`/leaderboard?period=${period}`);
}
