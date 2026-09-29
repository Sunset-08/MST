// ============================================================
// SECUREX — Leaderboard API Service
// ============================================================

import type { LeaderboardEntry, LeaderboardFilters } from '@/lib/types';
import { apiGet, toQuery } from './client';

export async function getLeaderboard(filters?: LeaderboardFilters & { organizationId?: string }): Promise<LeaderboardEntry[]> {
  const period = filters?.period ?? 'global';
  if (period === 'organization' && !filters?.organizationId) return [];
  return apiGet(`/leaderboard${toQuery({ period, organizationId: period === 'organization' ? filters?.organizationId : undefined })}`);
}

