// ============================================================
// SECUREX — Admin API Service Layer
// Follows the same USE_MOCK toggle pattern as other API modules
//
// Real endpoints (Member 3):
//   GET /api/admin/dashboard
//   GET /api/admin/users
//   GET /api/admin/organizations
//   GET /api/admin/challenges
//   GET /api/admin/submissions
//   GET /api/admin/rewards
//   GET /api/admin/github
//   GET /api/admin/analytics
// ============================================================

import { USE_MOCK } from '@/lib/api/client';
import type {
  AdminDashboardStats,
  AdminUserEntry,
  AdminOrgEntry,
  AdminChallengeEntry,
  AdminSubmissionEntry,
  AdminRewardEntry,
  AdminGithubEntry,
  AdminAnalytics,
} from '@/lib/types/admin';

// ----------------------------------------------------------
// Mock Data
// ----------------------------------------------------------

const MOCK_STATS: AdminDashboardStats = {
  totalUsers: 1248,
  totalOrganizations: 42,
  totalChallenges: 128,
  activeChallenges: 71,
  pendingReviews: 17,
  verifiedSubmissions: 842,
  totalMstDistributed: 4280,
  newUsersThisWeek: 23,
  newOrgsThisWeek: 4,
  newChallengesThisWeek: 12,
  submissionsThisWeek: 84,
  verifiedThisWeek: 51,
};

const MOCK_USERS: AdminUserEntry[] = [
  { id: 'u1', username: 'alexsec', displayName: 'Alex', email: 'alex@example.com', role: 'participant', points: 2500, reputation: 420, challengesSolved: 11, status: 'active', joinedAt: '2025-08-15T10:00:00Z', lastActiveAt: '2026-09-28T09:00:00Z' },
  { id: 'u2', username: 'john_sec', displayName: 'John', email: 'john@example.com', role: 'participant', points: 5200, reputation: 710, challengesSolved: 24, status: 'active', joinedAt: '2025-07-01T10:00:00Z', lastActiveAt: '2026-09-27T14:00:00Z' },
  { id: 'u3', username: 'sara_h', displayName: 'Sara H', email: 'sara@example.com', role: 'participant', points: 1750, reputation: 280, challengesSolved: 8, status: 'active', joinedAt: '2025-09-10T10:00:00Z' },
  { id: 'u4', username: 'orgadmin', displayName: 'AcmeCorp Admin', email: 'admin@acmecorp.example.com', role: 'organization', points: 0, reputation: 0, challengesSolved: 0, status: 'active', joinedAt: '2025-06-01T10:00:00Z' },
  { id: 'u5', username: 'securelabs_admin', displayName: 'SecureLabs Admin', email: 'admin@securelabs.io', role: 'organization', points: 0, reputation: 0, challengesSolved: 0, status: 'active', joinedAt: '2025-06-15T10:00:00Z' },
  { id: 'u6', username: 'mike_pen', displayName: 'Mike', email: 'mike@example.com', role: 'participant', points: 3100, reputation: 510, challengesSolved: 15, status: 'suspended', joinedAt: '2025-08-20T10:00:00Z' },
];

const MOCK_ORGS: AdminOrgEntry[] = [
  { id: 'org1', name: 'AcmeCorp Security', slug: 'acmecorp-security', githubOrg: 'acmecorp', repositoryCount: 12, challengeCount: 32, participantCount: 418, status: 'active', mstPaid: 50, createdAt: '2025-06-01T10:00:00Z' },
  { id: 'org2', name: 'SecureLabs', slug: 'securelabs', githubOrg: 'securelabs-io', repositoryCount: 5, challengeCount: 18, participantCount: 312, status: 'active', mstPaid: 25, createdAt: '2025-06-15T10:00:00Z' },
  { id: 'org3', name: 'CryptoDefense', slug: 'cryptodefense', githubOrg: 'cryptodef', repositoryCount: 8, challengeCount: 24, participantCount: 201, status: 'active', mstPaid: 30, createdAt: '2025-07-10T10:00:00Z' },
  { id: 'org4', name: 'NetGuard Inc', slug: 'netguard', githubOrg: 'netguard-inc', repositoryCount: 3, challengeCount: 9, participantCount: 87, status: 'pending_review', mstPaid: 10, createdAt: '2026-09-01T10:00:00Z' },
];

const MOCK_CHALLENGES: AdminChallengeEntry[] = [
  { id: 'ch1', title: 'SQL Injection in Auth Module', organization: 'AcmeCorp Security', category: 'Web Security', difficulty: 'Medium', pointsReward: 250, mstReward: 5, status: 'published', submissionCount: 84, solvedCount: 31, createdAt: '2025-08-01T10:00:00Z' },
  { id: 'ch2', title: 'Smart Contract Reentrancy', organization: 'AcmeCorp Security', category: 'Smart Contract', difficulty: 'Hard', pointsReward: 500, mstReward: 12, status: 'published', submissionCount: 62, solvedCount: 14, createdAt: '2025-08-10T10:00:00Z' },
  { id: 'ch3', title: 'JWT Algorithm Confusion', organization: 'SecureLabs', category: 'Authentication', difficulty: 'Medium', pointsReward: 250, mstReward: 5, status: 'published', submissionCount: 103, solvedCount: 48, createdAt: '2025-09-01T10:00:00Z' },
  { id: 'ch4', title: 'SSRF via Image Upload', organization: 'CryptoDefense', category: 'Web Security', difficulty: 'Hard', pointsReward: 500, mstReward: 10, status: 'published', submissionCount: 47, solvedCount: 9, createdAt: '2025-09-15T10:00:00Z' },
  { id: 'ch5', title: 'Path Traversal in API', organization: 'SecureLabs', category: 'API Security', difficulty: 'Easy', pointsReward: 100, mstReward: 2, status: 'published', submissionCount: 201, solvedCount: 178, createdAt: '2025-07-20T10:00:00Z' },
  { id: 'ch6', title: 'Insecure Deserialization', organization: 'NetGuard Inc', category: 'Backend Security', difficulty: 'Hard', pointsReward: 500, mstReward: 12, status: 'draft', submissionCount: 0, solvedCount: 0, createdAt: '2026-09-20T10:00:00Z' },
];

const MOCK_SUBMISSIONS: AdminSubmissionEntry[] = [
  { id: 's1', participant: 'alexsec', organization: 'AcmeCorp Security', challengeTitle: 'SQL Injection in Auth Module', difficulty: 'Medium', status: 'Verified', submittedAt: '2026-09-25T10:00:00Z', verifiedAt: '2026-09-25T10:05:00Z' },
  { id: 's2', participant: 'john_sec', organization: 'AcmeCorp Security', challengeTitle: 'Smart Contract Reentrancy', difficulty: 'Hard', status: 'Verified', submittedAt: '2026-09-24T14:00:00Z', verifiedAt: '2026-09-24T14:10:00Z' },
  { id: 's3', participant: 'sara_h', organization: 'SecureLabs', challengeTitle: 'JWT Algorithm Confusion', difficulty: 'Medium', status: 'Under Review', submittedAt: '2026-09-28T09:00:00Z' },
  { id: 's4', participant: 'mike_pen', organization: 'CryptoDefense', challengeTitle: 'SSRF via Image Upload', difficulty: 'Hard', status: 'Failed', submittedAt: '2026-09-27T16:00:00Z' },
  { id: 's5', participant: 'alexsec', organization: 'SecureLabs', challengeTitle: 'Path Traversal in API', difficulty: 'Easy', status: 'Verified', submittedAt: '2026-09-23T11:00:00Z', verifiedAt: '2026-09-23T11:03:00Z' },
  { id: 's6', participant: 'john_sec', organization: 'SecureLabs', challengeTitle: 'JWT Algorithm Confusion', difficulty: 'Medium', status: 'Submitted', submittedAt: '2026-09-29T00:10:00Z' },
];

const MOCK_REWARDS: AdminRewardEntry[] = [
  { id: 'r1', participant: 'alexsec', organization: 'AcmeCorp Security', challengeTitle: 'SQL Injection in Auth Module', mstAmount: 5, status: 'Confirmed', transactionHash: '0xabc123def456', createdAt: '2026-09-25T10:06:00Z' },
  { id: 'r2', participant: 'john_sec', organization: 'AcmeCorp Security', challengeTitle: 'Smart Contract Reentrancy', mstAmount: 12, status: 'Confirmed', transactionHash: '0xdef789abc012', createdAt: '2026-09-24T14:11:00Z' },
  { id: 'r3', participant: 'alexsec', organization: 'SecureLabs', challengeTitle: 'Path Traversal in API', mstAmount: 2, status: 'Confirmed', transactionHash: '0x789abc345def', createdAt: '2026-09-23T11:04:00Z' },
  { id: 'r4', participant: 'sara_h', organization: 'SecureLabs', challengeTitle: 'JWT Algorithm Confusion', mstAmount: 5, status: 'Pending', createdAt: '2026-09-28T09:01:00Z' },
];

const MOCK_GITHUB: AdminGithubEntry[] = [
  { id: 'gh1', orgName: 'AcmeCorp Security', githubOrg: 'acmecorp', installationStatus: 'connected', repositoryCount: 12, lastSyncAt: '2026-09-29T00:30:00Z', webhookStatus: 'active' },
  { id: 'gh2', orgName: 'SecureLabs', githubOrg: 'securelabs-io', installationStatus: 'connected', repositoryCount: 5, lastSyncAt: '2026-09-28T23:45:00Z', webhookStatus: 'active' },
  { id: 'gh3', orgName: 'CryptoDefense', githubOrg: 'cryptodef', installationStatus: 'connected', repositoryCount: 8, lastSyncAt: '2026-09-28T22:00:00Z', webhookStatus: 'error' },
  { id: 'gh4', orgName: 'NetGuard Inc', githubOrg: 'netguard-inc', installationStatus: 'pending', repositoryCount: 0, webhookStatus: 'inactive' },
];

const MOCK_ANALYTICS: AdminAnalytics = {
  challengesByDifficulty: { Easy: 28, Medium: 52, Hard: 38, Expert: 10 },
  challengesByCategory: {
    'Web Security': 32, 'Smart Contract': 18, 'Authentication': 14,
    'API Security': 22, 'Cloud / Infrastructure': 12, 'Database Security': 10,
    'DevSecOps': 8, 'Cryptography': 12,
  },
  submissionsByStatus: {
    Submitted: 47, 'Under Review': 28, Verified: 842, Failed: 312, Rejected: 24,
  },
  verificationSuccessRate: 72.8,
  totalPointsAwarded: 324500,
  totalMstDistributed: 4280,
  activeParticipantsLast30Days: 487,
};

// ----------------------------------------------------------
// API Functions
// ----------------------------------------------------------

const DELAY = () => new Promise((r) => setTimeout(r, 400));

export async function getAdminStats(): Promise<AdminDashboardStats> {
  if (USE_MOCK) { await DELAY(); return MOCK_STATS; }
  const r = await fetch('/api/admin/dashboard');
  return r.json();
}

export async function getAdminUsers(): Promise<AdminUserEntry[]> {
  if (USE_MOCK) { await DELAY(); return MOCK_USERS; }
  const r = await fetch('/api/admin/users');
  return r.json();
}

export async function getAdminOrganizations(): Promise<AdminOrgEntry[]> {
  if (USE_MOCK) { await DELAY(); return MOCK_ORGS; }
  const r = await fetch('/api/admin/organizations');
  return r.json();
}

export async function getAdminChallenges(): Promise<AdminChallengeEntry[]> {
  if (USE_MOCK) { await DELAY(); return MOCK_CHALLENGES; }
  const r = await fetch('/api/admin/challenges');
  return r.json();
}

export async function getAdminSubmissions(): Promise<AdminSubmissionEntry[]> {
  if (USE_MOCK) { await DELAY(); return MOCK_SUBMISSIONS; }
  const r = await fetch('/api/admin/submissions');
  return r.json();
}

export async function getAdminRewards(): Promise<AdminRewardEntry[]> {
  if (USE_MOCK) { await DELAY(); return MOCK_REWARDS; }
  const r = await fetch('/api/admin/rewards');
  return r.json();
}

export async function getAdminGithub(): Promise<AdminGithubEntry[]> {
  if (USE_MOCK) { await DELAY(); return MOCK_GITHUB; }
  const r = await fetch('/api/admin/github');
  return r.json();
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  if (USE_MOCK) { await DELAY(); return MOCK_ANALYTICS; }
  const r = await fetch('/api/admin/analytics');
  return r.json();
}
