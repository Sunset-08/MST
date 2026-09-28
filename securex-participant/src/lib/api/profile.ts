// ============================================================
// SECUREX — Profile / Participant API Service
// ============================================================

import type { Participant, ParticipantStats, ChallengeHistoryEntry, Reward } from '@/lib/types';
import { USE_MOCK, apiGet } from './client';
import { MOCK_PARTICIPANT, MOCK_STATS, MOCK_CHALLENGE_HISTORY, MOCK_REWARDS } from './mock/data';

export async function getMe(): Promise<Participant> {
  if (USE_MOCK) return MOCK_PARTICIPANT;
  return apiGet('/users/me');
}

export async function getMyStats(): Promise<ParticipantStats> {
  if (USE_MOCK) return MOCK_STATS;
  return apiGet('/users/me/stats');
}

export async function getMyHistory(): Promise<ChallengeHistoryEntry[]> {
  if (USE_MOCK) return MOCK_CHALLENGE_HISTORY;
  return apiGet('/users/me/history');
}

export async function getMyRewards(): Promise<Reward[]> {
  if (USE_MOCK) return MOCK_REWARDS;
  return apiGet('/rewards');
}

export async function getProfile(username: string): Promise<Participant> {
  if (USE_MOCK) return { ...MOCK_PARTICIPANT, username };
  return apiGet(`/users/${username}`);
}
