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
  /** Files (or directories ending in "/") a solution must change; one per line. */
  targetFiles: string;

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

  // Mirrors the backend contract so the API never receives something it will reject.
  const described = (draft.description.trim() || draft.securityIssue.trim());
  if (draft.title.trim() && draft.title.trim().length < 3) missing.push('Title (at least 3 characters)');
  if (described.length > 0 && described.length < 10) missing.push('Description (at least 10 characters)');
  if (draft.pointsReward !== '' && !Number.isInteger(Number(draft.pointsReward))) missing.push('Points reward (whole number)');
  if (draft.mstReward !== '' && !Number.isInteger(Number(draft.mstReward))) missing.push('MST reward (whole number)');
  if (draft.maxAttempts !== '' && (!Number.isInteger(Number(draft.maxAttempts)) || Number(draft.maxAttempts) < 1)) {
    missing.push('Max attempts (whole number, 1 or more)');
  }
  draft.questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.questionText.trim()) missing.push(`Question ${n}: text`);
    if (!Number.isInteger(q.points) || q.points < 0) missing.push(`Question ${n}: points (whole number)`);
    if (q.type === 'multiple_choice') {
      const filled = (q.options ?? []).filter((o) => o.text.trim());
      if (filled.length < 2) missing.push(`Question ${n}: at least two answer options`);
      else if (!filled.some((o) => o.id === q.correctAnswer)) missing.push(`Question ${n}: mark a filled option as correct`);
    } else if (draft.verificationType === 'rule_based' && !q.expectedAnswer?.trim()) {
      missing.push(`Question ${n}: expected answer (needed for rule-based checking)`);
    }
  });
  if (draft.verificationType === 'rule_based' && draft.challengeType && draft.challengeType !== 'investigation') {
    missing.push('Rule-based verification needs the Investigation challenge type');
  }

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
    targetFiles: '',
    questions: [],
    status: 'draft',
  };
}
