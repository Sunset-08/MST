// ============================================================
// SECUREX — Participant Domain Data Types
// Member 1 Implementation
// NO XP ANYWHERE — Points only
// ============================================================

export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Expert';

export type SecurityCategory =
  | 'Smart Contract'
  | 'Web Security'
  | 'API Security'
  | 'Authentication'
  | 'Authorization'
  | 'Cryptography'
  | 'Dependency / Supply Chain'
  | 'Cloud / Infrastructure'
  | 'DevSecOps'
  | 'Frontend Security'
  | 'Backend Security'
  | 'Database Security'
  | 'Privacy'
  | 'Configuration';

export type ChallengeStatus =
  | 'Not Started'
  | 'Attempted'
  | 'Submitted'
  | 'Under Review'
  | 'Verified'
  | 'Failed';

export type ChallengeType = 'Code' | 'Investigation' | 'Fix' | 'SecurityReport';

export type LeaderboardPeriod = 'global' | 'weekly' | 'monthly' | 'organization';

// ============================================================
// Core Entities
// ============================================================

export interface Participant {
  id: string;
  username: string;
  displayName?: string;
  githubUsername?: string;
  avatarUrl?: string;
  level: number;
  points: number; // ONLY metric for scoring — NO XP
  reputation: number; // Separate from points
  globalRank: number;
  challengesSolved: number;
  walletAddress?: string;
  createdAt: string;
}

export interface LinkedWallet {
  id: string;
  address: string;
  network: string;
  isPrimary: boolean;
  isVerified?: boolean;
  verifiedAt: string | null;
}

export interface OrgMembership {
  organizationId: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'member';
}

/** Authenticated user as returned by GET /users/me (server-side truth for roles and gamification). */
export interface Me extends Participant {
  email: string;
  bio: string | null;
  role: 'participant' | 'platform_admin';
  levelTitle: string;
  pointsToNextLevel: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityAt: string | null;
  wallets: LinkedWallet[];
  github: { username: string | null; connected: boolean };
  organizations: OrgMembership[];
  requirements: { githubConnection: boolean };
}

export interface ParticipantStats {
  totalPoints: number; // same as participant.points
  totalReputation: number;
  challengesSolved: number;
  solvedByDifficulty: Record<Difficulty, number>;
  globalRank: number;
  streak: Streak;
  securityStats: SecurityStat[];
}

export interface ChallengeQuestionPublic {
  id: string;
  type: 'multiple_choice' | 'short_answer' | 'structured_response' | 'security_reasoning';
  questionText: string;
  options?: { id: string; text: string }[];
  points: number;
}

export interface Challenge {
  id: string;
  title: string;
  shortDescription: string;
  description: string;
  category: SecurityCategory;
  difficulty: Difficulty;
  pointsReward: number; // Easy=100, Medium=250, Hard=500
  mstReward: number;
  githubRepo?: string;
  githubRepoUrl?: string;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  attempts: number;
  solved: number;
  type: ChallengeType;
  verificationType?: string;
  maxAttempts?: number | null;
  expiresAt?: string | null;
  isOpen?: boolean;
  organization?: { id: string; name: string; slug: string };
  questions?: ChallengeQuestionPublic[];
  tags?: string[];
  status?: ChallengeStatus; // per-participant status
  createdAt: string;
}

export interface ChallengeAttempt {
  id: string;
  challengeId: string;
  participantId: string;
  status: ChallengeStatus;
  attemptNumber?: number;
  maxAttempts?: number | null;
  attemptsRemaining?: number | null;
  startedAt: string;
  submittedAt?: string;
  verifiedAt?: string;
}

export interface Submission {
  id: string;
  attemptId: string;
  challengeId: string;
  type: ChallengeType;
  // Code/Fix submission
  patch?: string;
  repositoryUrl?: string;
  commitHash?: string;
  explanation?: string;
  // Investigation submission
  selectedAnswers?: string[];
  structuredAnswers?: Record<string, string>;
  // Security Report submission
  vulnerability?: string;
  impact?: string;
  attackPath?: string;
  recommendedFix?: string;
  evidence?: string;
  submittedAt: string;
}

export interface VerificationResult {
  submissionId: string;
  challengeId: string;
  status: 'Pending' | 'Verified' | 'Failed';
  attemptId?: string;
  verificationType?: string;
  pointsAwarded: number; // 0 if Failed, actual amount if Verified
  reputationAwarded: number;
  mstAwarded: number;
  /** Pending / Processing / Confirmed / Failed once a reward exists; WalletRequired when a wallet must be linked. */
  mstRewardStatus?: string | null;
  streakUpdated: boolean;
  reason?: string | null; // provided by backend if failed
  verifiedAt?: string | null;
}

// ============================================================
// Points & Gamification (NO XP)
// ============================================================

/** A record of points earned — only created after VERIFIED status */
export interface PointEvent {
  id: string;
  challengeId: string;
  challengeTitle: string;
  difficulty: Difficulty;
  points: number; // always positive, from verified challenges only
  status: 'Verified'; // Points are ONLY awarded for verified challenges
  timestamp: string;
}

export interface Streak {
  current: number;
  longest: number;
  activityDays: string[]; // ISO date strings from backend
  lastActiveDate?: string;
}

export interface SecurityStat {
  category: SecurityCategory;
  score: number; // 0–100, backend-calculated
}

// ============================================================
// Leaderboard
// ============================================================

export interface LeaderboardEntry {
  rank: number;
  participantId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  points: number; // Primary ranking metric — NO XP
  level: number;
  challengesSolved: number;
  currentStreak?: number;
  isCurrentUser?: boolean;
}

// ============================================================
// Rewards (MST)
// ============================================================

export interface Reward {
  id: string;
  challengeId: string;
  challengeTitle: string;
  submissionId?: string;
  mstAmount: number;
  token?: string;
  network?: string;
  walletAddress?: string;
  status: 'Pending' | 'Processing' | 'Confirmed' | 'Failed';
  transactionHash?: string;
  explorerUrl?: string;
  confirmedAt?: string;
  paidAt?: string | null;
  createdAt: string;
}

// ============================================================
// Challenge History
// ============================================================

export interface ChallengeHistoryEntry {
  challengeId: string;
  title: string;
  category: SecurityCategory;
  difficulty: Difficulty;
  pointsAwarded: number;
  status: ChallengeStatus;
  completedAt?: string;
  reward?: Reward;
  attempts?: number;
}

// ============================================================
// API Response Wrappers
// ============================================================

export interface ApiResponse<T> {
  data: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================
// Filter State (UI only)
// ============================================================

export interface ChallengeFilters {
  search: string;
  difficulty: Difficulty | 'All';
  category: SecurityCategory | 'All';
  status: ChallengeStatus | 'All';
}

export interface LeaderboardFilters {
  period: LeaderboardPeriod;
}
