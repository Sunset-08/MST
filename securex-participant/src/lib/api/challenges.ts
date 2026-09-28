// ============================================================
// SECUREX — Challenges API Service
// Uses mock data when NEXT_PUBLIC_USE_MOCK_API=true
// Member 3: connect real endpoints here
// ============================================================

import type { Challenge, ChallengeAttempt, ChallengeFilters, PaginatedResponse } from '@/lib/types';
import { USE_MOCK, apiGet, apiPost } from './client';
import { MOCK_CHALLENGES } from './mock/data';

export async function getChallenges(
  filters?: Partial<ChallengeFilters>,
): Promise<PaginatedResponse<Challenge>> {
  if (USE_MOCK) {
    let data = [...MOCK_CHALLENGES];

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      data = data.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.shortDescription.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q),
      );
    }
    if (filters?.difficulty && filters.difficulty !== 'All') {
      data = data.filter((c) => c.difficulty === filters.difficulty);
    }
    if (filters?.category && filters.category !== 'All') {
      data = data.filter((c) => c.category === filters.category);
    }
    if (filters?.status && filters.status !== 'All') {
      data = data.filter((c) => c.status === filters.status);
    }

    return { data, total: data.length, page: 1, pageSize: data.length, hasMore: false };
  }

  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.difficulty && filters.difficulty !== 'All') params.set('difficulty', filters.difficulty);
  if (filters?.category && filters.category !== 'All') params.set('category', filters.category);

  return apiGet(`/challenges?${params.toString()}`);
}

export async function getChallengeById(id: string): Promise<Challenge> {
  if (USE_MOCK) {
    const c = MOCK_CHALLENGES.find((ch) => ch.id === id);
    if (!c) throw new Error(`Challenge ${id} not found`);
    return c;
  }
  return apiGet(`/challenges/${id}`);
}

export async function startChallenge(id: string): Promise<ChallengeAttempt> {
  if (USE_MOCK) {
    return {
      id: `attempt-${Date.now()}`,
      challengeId: id,
      participantId: 'user-alex-001',
      status: 'Attempted',
      startedAt: new Date().toISOString(),
    };
  }
  return apiPost(`/challenges/${id}/start`, {});
}
