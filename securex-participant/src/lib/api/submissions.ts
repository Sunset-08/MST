// ============================================================
// SECUREX — Submission API Service
// ============================================================

import type { Submission, VerificationResult } from '@/lib/types';
import { USE_MOCK, apiPost } from './client';

export async function submitAttempt(
  attemptId: string,
  submission: Omit<Submission, 'id' | 'attemptId' | 'submittedAt'>,
): Promise<VerificationResult> {
  if (USE_MOCK) {
    // Simulate a pending verification (backend will verify asynchronously)
    await new Promise((r) => setTimeout(r, 1500));
    return {
      submissionId: `sub-${Date.now()}`,
      challengeId: submission.challengeId,
      status: 'Pending',
      pointsAwarded: 0,
      reputationAwarded: 0,
      mstAwarded: 0,
      streakUpdated: false,
    };
  }
  return apiPost(`/attempts/${attemptId}/submit`, submission);
}

export async function getVerificationResult(submissionId: string): Promise<VerificationResult> {
  if (USE_MOCK) {
    // Simulate verification completing after a delay
    await new Promise((r) => setTimeout(r, 2000));
    return {
      submissionId,
      challengeId: 'ch-002',
      status: 'Verified',
      pointsAwarded: 250,
      reputationAwarded: 20,
      mstAwarded: 5,
      streakUpdated: true,
    };
  }
  const { apiGet } = await import('./client');
  return apiGet(`/submissions/${submissionId}/result`);
}
