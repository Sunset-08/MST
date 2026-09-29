// ============================================================
// SECUREX — Organization API Service (organization portal)
// Calls carry X-Organization-Id for the active organization.
// ============================================================

import type { PaginatedResponse } from '@/lib/types';
import { apiDelete, apiGet, apiPost, apiPut, toQuery } from './client';

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  website?: string;
  status: string;
  role?: 'owner' | 'admin' | 'member';
  memberCount?: number;
  challengeCount?: number;
  createdAt: string;
}

export interface OrgStats {
  activeChallenges: number;
  totalChallenges: number;
  draftChallenges: number;
  totalSubmissions: number;
  verifiedSolutions: number;
  pendingReviews: number;
  uniqueParticipants: number;
  mstDistributed: number;
  mstPending: number;
}

export interface OrgMstStatusResponse {
  minimumRequired: number;
  amountPaid: number;
  paymentStatus: 'PENDING_PAYMENT' | 'PAYMENT_REQUIRED' | 'PAYMENT_PROCESSING' | 'PAYMENT_CONFIRMED' | 'READY_TO_PUBLISH';
  fundingSource: string;
  blockchain: { configured: boolean; reason?: string };
}

export interface OrgChallengeConfig {
  securityIssue?: string;
  expectedSolutionCriteria?: string;
  targetFiles?: string[];
  expiresAt?: string;
  questions?: {
    id: string; type: 'multiple_choice' | 'short_answer' | 'structured_response' | 'security_reasoning'; questionText: string;
    options?: { id: string; text: string }[]; correctAnswer?: string; points: number;
  }[];
  acceptedAnswers?: Record<string, string[]>;
}

export interface OrgChallengeRow {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  challengeType: string;
  verificationType: string;
  pointsReward: number;
  mstReward: number;
  maxAttempts: number | null;
  status: 'draft' | 'published' | 'archived';
  githubIssueId: string | null;
  githubRepositoryId: string | null;
  githubRepository: string | null;
  githubIssueNumber: number | null;
  githubIssueTitle: string | null;
  challengeConfig: OrgChallengeConfig;
  submissions?: number;
  verified?: number;
  attempts?: number;
  createdAt: string;
}

export interface OrgActivityRow {
  submissionId: string;
  challengeId: string;
  challengeTitle: string;
  participant: { id: string; username: string; displayName: string };
  status: 'Pending' | 'Verified' | 'Failed';
  verificationStatus: string;
  submittedAt: string;
  verifiedAt: string | null;
}

export interface OrgSubmissionRow extends OrgActivityRow {
  attemptId: string;
  submissionType: string;
  submissionData: Record<string, unknown>;
  verificationType: string;
  reason: string | null;
}

export interface OrgGithubOverview {
  configured: boolean;
  installations: { id: string; installationId: string; login: string; name: string }[];
  repositories: { id: string; fullName: string; name: string; url: string; defaultBranch: string; isActive: boolean; issueCount: number; openIssueCount: number }[];
}

export interface OrgGithubAvailableInstallation {
  id: string;
  installationId: string;
  login: string;
  repositorySelection: string | null;
  /** Where the GitHub account owner grants the app access to more repositories. */
  manageUrl: string;
  repositories: { githubRepoId: string; name: string; fullName: string; url: string; private: boolean; archived: boolean; connected: boolean }[];
}

export interface OrgGithubIssue {
  id: string;
  repositoryId: string;
  repository: string;
  number: number;
  title: string;
  body?: string | null;
  state: string;
  url: string;
  labels: string[];
  linkedChallengeId: string | null;
}

// ---- organizations ----
export const listMyOrganizations = () => apiGet<OrgSummary[]>('/organizations');
export const createOrganization = (input: { name: string; description?: string; website?: string }) =>
  apiPost<OrgSummary>('/organizations', input);
export const getOrganization = (id: string) => apiGet<OrgSummary>(`/organizations/${id}`);
export const updateOrganization = (id: string, patch: { name?: string; description?: string | null; website?: string | null }) =>
  apiPut<OrgSummary>(`/organizations/${id}`, patch);

// ---- dashboard ----
export const getOrgStats = () => apiGet<OrgStats>('/org/stats', { org: true });
export const getOrgActivity = (limit = 10) => apiGet<OrgActivityRow[]>(`/org/activity${toQuery({ limit })}`, { org: true });
export const getOrgMstStatus = () => apiGet<OrgMstStatusResponse>('/org/mst-status', { org: true });

// ---- challenges ----
export const listOrgChallenges = (params: { status?: string; page?: number; limit?: number } = {}) =>
  apiGet<PaginatedResponse<OrgChallengeRow>>(`/org/challenges${toQuery(params)}`, { org: true });
export const getOrgChallenge = (id: string) => apiGet<OrgChallengeRow>(`/org/challenges/${encodeURIComponent(id)}`, { org: true });
export const createOrgChallenge = (payload: Record<string, unknown>) =>
  apiPost<OrgChallengeRow>('/org/challenges', payload, { org: true });
export const updateOrgChallenge = (id: string, payload: Record<string, unknown>) =>
  apiPut<OrgChallengeRow>(`/org/challenges/${id}`, payload, { org: true });

// ---- submissions ----
export const listOrgSubmissions = (params: { status?: string; page?: number; limit?: number } = {}) =>
  apiGet<PaginatedResponse<OrgSubmissionRow>>(`/org/submissions${toQuery(params)}`, { org: true });
export const reviewOrgSubmission = (id: string, decision: 'approve' | 'reject', reason: string) =>
  apiPost(`/org/submissions/${id}/review`, { decision, reason }, { org: true });

// ---- GitHub ----
export const getOrgGithub = () => apiGet<OrgGithubOverview>('/org/github', { org: true });
export const getGithubInstallUrl = () => apiGet<{ installUrl: string; appSlug: string }>('/org/github/install-url', { org: true });
export const linkGithubInstallation = (installationId: string, state?: string) =>
  apiPost<{ login: string; installationId: string }>('/org/github/installations', { installationId, state }, { org: true });
/** `importAll` is for the first import right after linking; a plain sync only refreshes connected repositories. */
export const syncOrgGithub = (importAll = false) =>
  apiPost<{ repositoriesSynced: number; issuesSynced: number; syncedAt: string }>('/org/github/sync', importAll ? { importAll: true } : {}, { org: true });
export const getAvailableGithubRepos = () =>
  apiGet<{ installations: OrgGithubAvailableInstallation[] }>('/org/github/repositories/available', { org: true });
export const connectGithubRepos = (githubRepoIds: string[]) =>
  apiPost<{ connected: { id: string; fullName: string }[]; issuesSynced: number }>('/org/github/repositories', { githubRepoIds }, { org: true });
export const updateGithubRepo = (id: string, patch: { isActive?: boolean; defaultBranch?: string }) =>
  apiPut<{ id: string; isActive: boolean; defaultBranch: string }>(`/org/github/repositories/${id}`, patch, { org: true });
export const removeGithubRepo = (id: string) => apiDelete<{ removed: boolean }>(`/org/github/repositories/${id}`, { org: true });
export const listOrgGithubIssues = (params: { repositoryId?: string; state?: string; search?: string; limit?: number } = {}) =>
  apiGet<PaginatedResponse<OrgGithubIssue>>(`/org/github/issues${toQuery(params)}`, { org: true });
