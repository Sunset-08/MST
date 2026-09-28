// ============================================================
// SECUREX — Organization / Admin Domain Types
// Member 2 — Organization Side Add-On
// ============================================================

// ----------------------------------------------------------
// MST Payment States (provided by Member 4 / backend)
// Member 2 only displays these states — no blockchain logic here
// ----------------------------------------------------------

export type OrgMstPaymentStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_PROCESSING'
  | 'PAYMENT_CONFIRMED'
  | 'READY_TO_PUBLISH';

// ----------------------------------------------------------
// Organization MST Funding Status
// ----------------------------------------------------------

export interface OrgMstStatus {
  /** Minimum MSTC required to publish challenges (configured by platform admin) */
  minimumRequired: number;
  /** Amount already paid/deposited by the organization */
  amountPaid: number;
  /** Current lifecycle state */
  paymentStatus: OrgMstPaymentStatus;
  /** Organization's registered wallet address */
  walletAddress?: string;
  /** Last deposit transaction hash (if any) */
  transactionHash?: string;
  /** Timestamp of last payment update */
  lastUpdatedAt?: string;
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
  mstStatus: OrgMstStatus;
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
  /** SECUREX id of the synchronized repository / issue (set by the pickers). */
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
  isMstSatisfied: boolean;
  missingFields: string[];
}

export function validateChallengeDraft(
  draft: ChallengeDraft,
  mstStatus: OrgMstStatus,
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

  const isMstSatisfied =
    mstStatus.paymentStatus === 'PAYMENT_CONFIRMED' ||
    mstStatus.paymentStatus === 'READY_TO_PUBLISH';

  if (!isMstSatisfied) missing.push('MST funding requirement');

  return {
    isValid: missing.length === 0,
    isMstSatisfied,
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
