// ============================================================
// SECUREX — Organization / Admin Domain Types
// Member 2 — Organization Side Add-On
// ============================================================

// ----------------------------------------------------------
// Organization Wallet Status
// ----------------------------------------------------------

export interface OrgWallet {
  address: string;
  isConnected: boolean;
  network?: string;
}

// ----------------------------------------------------------
// Organization Profile
// ----------------------------------------------------------

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  website?: string;
  wallet?: OrgWallet;
  createdAt: string;
}

// ----------------------------------------------------------
// Org Admin / Member
// ----------------------------------------------------------

export interface OrgAdmin {
  id: string;
  username: string;
  displayName?: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  organization: Organization;
}

// ----------------------------------------------------------
// Challenge Question Types
// ----------------------------------------------------------

export type QuestionType =
  | 'multiple_choice'
  | 'short_answer'
  | 'structured_response'
  | 'security_reasoning';

export interface QuestionOption {
  id: string; // 'A' | 'B' | 'C' | 'D'
  text: string;
}

export interface ChallengeQuestion {
  id: string;
  type: QuestionType;
  questionText: string;
  /** For multiple_choice only */
  options?: QuestionOption[];
  /** For multiple_choice: the correct option id (e.g. 'A') */
  correctAnswer?: string;
  /** For short_answer / structured / reasoning: expected answer hint */
  expectedAnswer?: string;
  /** Points this question contributes to verification score */
  points: number;
}

// ----------------------------------------------------------
// Challenge Draft (being configured by Org)
// ----------------------------------------------------------

export type OrgChallengeStatus = 'draft' | 'published' | 'archived';
export type OrgVerificationType =
  | 'automated_test'
  | 'rule_based'
  | 'admin_review'
  | 'peer_review';
export type OrgChallengeType = 'code' | 'investigation' | 'fix' | 'security_report';
export type OrgChallengeDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface ChallengeDraft {
  // Identity
  title: string;
  securityIssue: string;
  description: string;

  // GitHub
  /** Full name (owner/repo) of a repository synchronized through the GitHub App. */
  githubRepository: string;
  /** DevArena id of the synchronized repository / issue (set by the pickers). */
  githubRepositoryId: string;
  githubIssueId: string;
  /** Legacy free-text reference; kept for display only. */
  githubIssueRef: string;

  // Classification
  securityCategory: string;
  difficulty: OrgChallengeDifficulty | '';
  challengeType: OrgChallengeType | '';
  verificationType: OrgVerificationType | '';

  // Rewards
  pointsReward: number | '';
  mstReward: number | '';

  // Constraints
  maxAttempts: number | '';
  expiresAt: string; // ISO datetime string

  // Verification
  expectedSolutionCriteria: string;

  // Questions
  questions: ChallengeQuestion[];

  // Status
  status: OrgChallengeStatus;
}

// ----------------------------------------------------------
// Publish Validation
// ----------------------------------------------------------

export interface PublishValidationResult {
  isValid: boolean;
  missingFields: string[];
}

export function validateChallengeDraft(
  draft: ChallengeDraft,
): PublishValidationResult {
  const missing: string[] = [];

  if (!draft.title.trim()) missing.push('Challenge title');
  if (!draft.securityIssue.trim()) missing.push('Security issue');
  if (!draft.difficulty) missing.push('Difficulty');
  if (!draft.securityCategory.trim()) missing.push('Security category');
  if (!draft.challengeType) missing.push('Challenge type');
  if (!draft.verificationType) missing.push('Verification type');
  if (draft.questions.length === 0) missing.push('At least one question');
  if (!draft.expectedSolutionCriteria.trim()) missing.push('Expected solution criteria');
  if (draft.pointsReward === '' || Number(draft.pointsReward) <= 0) missing.push('Points reward');
  if (draft.mstReward === '' || Number(draft.mstReward) <= 0) missing.push('MST reward');
  if (!draft.githubRepository.trim()) missing.push('GitHub repository');

  return {
    isValid: missing.length === 0,
    missingFields: missing,
  };
}

// ----------------------------------------------------------
// Default empty draft factory
// ----------------------------------------------------------

export function createEmptyDraft(): ChallengeDraft {
  return {
    title: '',
    securityIssue: '',
    description: '',
    githubRepository: '',
    githubRepositoryId: '',
    githubIssueId: '',
    githubIssueRef: '',
    securityCategory: '',
    difficulty: '',
    challengeType: '',
    verificationType: '',
    pointsReward: '',
    mstReward: '',
    maxAttempts: '',
    expiresAt: '',
    expectedSolutionCriteria: '',
    questions: [],
    status: 'draft',
  };
}
