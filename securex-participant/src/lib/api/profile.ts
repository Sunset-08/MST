// ============================================================
// SECUREX — Profile / Participant API Service
// ============================================================

import type { ChallengeHistoryEntry, Me, Participant, ParticipantStats, Reward } from '@/lib/types';
import { apiGet, apiPut } from './client';

export const getMe = () => apiGet<Me>('/users/me');
export const getMyStats = () => apiGet<ParticipantStats>('/users/me/stats');
export const getMyHistory = () => apiGet<ChallengeHistoryEntry[]>('/users/me/history');
export const getMyRewards = () => apiGet<Reward[]>('/rewards');
export const getProfile = (username: string) => apiGet<Participant>(`/users/${encodeURIComponent(username)}`, { auth: false });
export const updateProfile = (patch: { displayName?: string; bio?: string | null }) => apiPut<Me>('/users/me', patch);
