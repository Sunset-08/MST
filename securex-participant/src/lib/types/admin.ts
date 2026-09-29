// ============================================================
// SECUREX — Admin Types
// Platform-level administration domain
// ============================================================

// ----------------------------------------------------------
// Roles
// ----------------------------------------------------------

export type SXRole = 'participant' | 'organization' | 'admin';

// ----------------------------------------------------------
// Admin User
// ----------------------------------------------------------

export interface AdminUser {
  id: string;
  username: string;
  displayName?: string;
  email: string;
  role: SXRole;
  createdAt: string;
}

// ----------------------------------------------------------
// Platform Stats (from GET /api/admin/dashboard)
// ----------------------------------------------------------

export interface AdminDashboardStats {
  totalUsers: number;
  totalOrganizations: number;
  totalChallenges: number;
  activeChallenges: number;
  pendingReviews: number;
  verifiedSubmissions: number;
  totalMstDistributed: number;
  /** Share (0-100) of all submissions that were verified. */
  submissionRate: number;

  // Recent activity (last 7 days)
  newUsersThisWeek: number;
  newOrgsThisWeek: number;
  newChallengesThisWeek: number;
  submissionsThisWeek: number;
  verifiedThisWeek: number;
}

// ----------------------------------------------------------
// User Management
// ----------------------------------------------------------

export type UserStatus = 'active' | 'suspended' | 'pending';

export interface AdminUserEntry {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  role: SXRole;
  points: number;
  reputation: number;
  challengesSolved: number;
  status: UserStatus;
  joinedAt: string;
  lastActiveAt?: string;
}

// ----------------------------------------------------------
// Organization Management
// ----------------------------------------------------------

export type OrgStatus = 'active' | 'suspended' | 'pending_review';

export interface AdminOrgEntry {
  id: string;
  name: string;
  slug: string;
  githubOrg?: string;
  repositoryCount: number;
  challengeCount: number;
  participantCount: number;
  status: OrgStatus;
  mstPaid: number;
  createdAt: string;
}

// ----------------------------------------------------------
// Challenge Management (admin view)
// ----------------------------------------------------------

export type AdminChallengeStatus = 'draft' | 'published' | 'archived' | 'flagged';

export interface AdminChallengeEntry {
  id: string;
  title: string;
  organization: string;
  category: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  pointsReward: number;
  mstReward: number;
  status: AdminChallengeStatus;
  submissionCount: number;
  solvedCount: number;
  createdAt: string;
}

// ----------------------------------------------------------
// Submission / Verification Oversight
// ----------------------------------------------------------

export type SubmissionStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Verified'
  | 'Failed'
  | 'Rejected';

export interface AdminSubmissionEntry {
  id: string;
  participant: string;
  organization: string;
  challengeTitle: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  status: SubmissionStatus;
  submittedAt: string;
  verifiedAt?: string;
}

// ----------------------------------------------------------
// Reward Oversight
// ----------------------------------------------------------

export type RewardStatus = 'Pending' | 'Processing' | 'Confirmed' | 'Failed';

export interface AdminRewardEntry {
  id: string;
  participant: string;
  organization: string;
  challengeTitle: string;
  mstAmount: number;
  status: RewardStatus;
  transactionHash?: string;
  createdAt: string;
}

// ----------------------------------------------------------
// GitHub Integration
// ----------------------------------------------------------

export interface AdminGithubEntry {
  id: string;
  orgName: string;
  githubOrg: string;
  installationStatus: 'connected' | 'disconnected' | 'pending';
  repositoryCount: number;
  lastSyncAt?: string;
  webhookStatus: 'active' | 'inactive' | 'error';
}

// ----------------------------------------------------------
// Analytics
// ----------------------------------------------------------

export interface AdminAnalytics {
  challengesByDifficulty: Record<string, number>;
  challengesByCategory: Record<string, number>;
  submissionsByStatus: Record<SubmissionStatus, number>;
  verificationSuccessRate: number;
  totalPointsAwarded: number;
  totalMstDistributed: number;
  activeParticipantsLast30Days: number;
}
