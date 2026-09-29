// ============================================================
// SECUREX — Challenges API Service
// ============================================================

import type { Challenge, ChallengeAttempt, ChallengeFilters, PaginatedResponse } from '@/lib/types';
import { apiGet, apiPost, toQuery } from './client';

export async function getChallenges(
  filters?: Partial<ChallengeFilters> & { page?: number; limit?: number },
): Promise<PaginatedResponse<Challenge>> {
  return apiGet(
    `/challenges${toQuery({
      search: filters?.search?.trim(),
      difficulty: filters?.difficulty && filters.difficulty !== 'All' ? filters.difficulty : undefined,
      category: filters?.category && filters.category !== 'All' ? filters.category : undefined,
      status: filters?.status && filters.status !== 'All' ? filters.status : undefined,
      page: filters?.page,
      limit: filters?.limit,
    })}`,
  );
}

export const getChallengeById = (id: string) => apiGet<Challenge>(`/challenges/${encodeURIComponent(id)}`);

/** Creates an attempt, or returns the participant's active one (idempotent). */
export const startChallenge = (id: string) => apiPost<ChallengeAttempt>(`/challenges/${encodeURIComponent(id)}/start`, {});
