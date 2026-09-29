// ============================================================
// SECUREX — Submission API Service
// ============================================================

import type { VerificationResult } from '@/lib/types';
import { apiGet, apiPost } from './client';

/** Free-form submission fields; empty values are dropped so optional fields validate server-side. */
export type SubmissionPayload = Record<string, string | string[] | Record<string, string> | undefined>;

function clean(payload: SubmissionPayload): SubmissionPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([, v]) => {
      if (v === undefined) return false;
      if (typeof v === 'string') return v.trim() !== '';
      if (Array.isArray(v)) return v.length > 0;
      return Object.keys(v).length > 0;
    }),
  );
}

export const submitAttempt = (attemptId: string, payload: SubmissionPayload) =>
  apiPost<VerificationResult>(`/attempts/${encodeURIComponent(attemptId)}/submit`, clean(payload));

export const getVerificationResult = (submissionId: string) =>
  apiGet<VerificationResult>(`/submissions/${encodeURIComponent(submissionId)}/result`);

/** Polls until verification leaves Pending or `timeoutMs` elapses (manual reviews stay Pending). */
export async function waitForVerification(
  submissionId: string,
  onUpdate?: (r: VerificationResult) => void,
  timeoutMs = 20_000,
): Promise<VerificationResult> {
  const started = Date.now();
  let result = await getVerificationResult(submissionId);
  onUpdate?.(result);
  while (result.status === 'Pending' && Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1500));
    result = await getVerificationResult(submissionId);
    onUpdate?.(result);
  }
  return result;
}
