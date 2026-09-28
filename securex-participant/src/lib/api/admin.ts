// ============================================================
// SECUREX — Admin API Service Layer
// Real endpoints (platform_admin only). Backend rows are mapped onto the admin console's view types.
// ============================================================

import { apiGet, apiPost, toQuery } from './client';
import type {
  AdminDashboardStats,
  AdminUserEntry,
  AdminOrgEntry,
  AdminChallengeEntry,
  AdminSubmissionEntry,
  AdminRewardEntry,
  AdminGithubEntry,
  AdminAnalytics,
  OrgStatus,
} from '@/lib/types/admin';

interface Page<T> { data: T[]; total: number }
const LIMIT = 100;
const list = async <T>(path: string, params: Record<string, string | number> = {}) =>
  (await apiGet<Page<T>>(`${path}${toQuery({ limit: LIMIT, ...params })}`)).data;

export const getAdminStats = () => apiGet<AdminDashboardStats>('/admin/dashboard');

export async function getAdminUsers(): Promise<AdminUserEntry[]> {
  const rows = await list<Record<string, any>>('/admin/users');
  return rows.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    role: u.role === 'platform_admin' ? 'admin' : u.organizationCount > 0 ? 'organization' : 'participant',
    points: u.points,
    reputation: u.reputation,
    challengesSolved: u.challengesSolved ?? 0,
    status: 'active',
    joinedAt: u.createdAt,
    lastActiveAt: u.lastActivityAt ?? undefined,
  }));
}

export async function getAdminOrganizations(): Promise<AdminOrgEntry[]> {
  const rows = await list<Record<string, any>>('/admin/organizations');
  return rows.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    githubOrg: o.githubOrg ?? undefined,
    repositoryCount: o.repositoryCount ?? 0,
    challengeCount: o.challengeCount ?? 0,
    participantCount: o.participantCount ?? 0,
    status: (o.status === 'active' ? 'active' : o.status === 'suspended' ? 'suspended' : 'pending_review') as OrgStatus,
    mstPaid: o.mstPaid ?? 0,
    createdAt: o.createdAt,
  }));
}

export async function getAdminChallenges(): Promise<AdminChallengeEntry[]> {
  const rows = await list<Record<string, any>>('/admin/challenges');
  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    organization: c.organization,
    category: c.category,
    difficulty: c.difficulty,
    pointsReward: c.pointsReward,
    mstReward: c.mstReward,
    status: c.status,
    submissionCount: c.submissionCount ?? 0,
    solvedCount: c.solvedCount ?? 0,
    createdAt: c.createdAt,
  }));
}

export async function getAdminSubmissions(): Promise<AdminSubmissionEntry[]> {
  const rows = await list<Record<string, any>>('/admin/submissions');
  return rows.map((s) => ({
    id: s.id,
    participant: s.participantName ?? s.participant?.username,
    organization: s.organization,
    challengeTitle: s.challengeTitle,
    difficulty: s.difficulty,
    status: s.displayStatus,
    submittedAt: s.submittedAt,
    verifiedAt: s.verifiedAt ?? undefined,
  }));
}

export const reviewAdminSubmission = (id: string, decision: 'approve' | 'reject', reason: string) =>
  apiPost(`/admin/submissions/${id}/review`, { decision, reason });

export async function getAdminRewards(): Promise<AdminRewardEntry[]> {
  const rows = await list<Record<string, any>>('/admin/rewards');
  return rows.map((r) => ({
    id: r.id,
    participant: r.participant,
    organization: r.organization,
    challengeTitle: r.challengeTitle,
    mstAmount: r.mstAmount,
    status: r.status,
    transactionHash: r.transactionHash,
    createdAt: r.createdAt,
  }));
}

export async function getAdminGithub(): Promise<AdminGithubEntry[]> {
  const overview = await apiGet<{ installations: Record<string, any>[] }>('/admin/github');
  return overview.installations.map((i) => ({
    id: i.id,
    orgName: i.orgName,
    githubOrg: i.githubOrg,
    installationStatus: i.installationStatus,
    repositoryCount: i.repositoryCount,
    lastSyncAt: i.lastSyncAt ?? undefined,
    webhookStatus: i.webhookStatus,
  }));
}

export const getAdminAnalytics = () => apiGet<AdminAnalytics>('/admin/analytics');

export interface AdminSettings {
  environment: string;
  github: {
    appConfigured: boolean; appId: string | null; appName: string | null; userConnectConfigured: boolean;
    participantConnectionRequired: boolean; privateKeyConfigured: boolean; webhookSecretConfigured: boolean; apiVersion: string;
  };
  blockchain: { network: string | null; chainId: number | null; rpcConfigured: boolean; rewardContractConfigured: boolean; onChainClaimsConfigured: boolean; verifierKeyConfigured: boolean; explorerUrl: string | null };
  blockchainProvider: { configured: boolean; canSend: boolean; canReadTransactions: boolean; reason?: string };
  claims: { claimsConfigured: boolean; reason?: string };
  walletLinking: { configured: boolean };
  verification: { providers: Record<string, { automatic: boolean; configured: boolean; mode: string }> };
}
export const getAdminSettings = () => apiGet<AdminSettings>('/admin/settings');
