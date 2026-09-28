// ============================================================
// SECUREX — Mock Data (Isolated)
// Toggle via NEXT_PUBLIC_USE_MOCK_API=true
// Math-verified: 5×100 + 4×250 + 2×500 = 2,500 Points ✅
// Replace with real API calls when Member 3 backend is ready
// ============================================================

import type {
  Participant,
  ParticipantStats,
  Challenge,
  ChallengeHistoryEntry,
  LeaderboardEntry,
  Streak,
  Reward,
  SecurityStat,
} from '@/lib/types';

// ============================================================
// Mock Participant (Alex — demo user)
// ============================================================

export const MOCK_PARTICIPANT: Participant = {
  id: 'user-alex-001',
  username: 'alexsec',
  displayName: 'Alex',
  githubUsername: 'alexsec',
  avatarUrl: undefined,
  level: 7, // 2,500 pts → Level 7 (Veteran)
  points: 2500, // 5×100 + 4×250 + 2×500 = 2,500 ✅
  reputation: 420,
  globalRank: 142,
  challengesSolved: 11,
  walletAddress: undefined,
  createdAt: '2025-01-15T10:00:00Z',
};

// ============================================================
// Mock Stats
// ============================================================

export const MOCK_STATS: ParticipantStats = {
  totalPoints: 2500,
  totalReputation: 420,
  challengesSolved: 11,
  solvedByDifficulty: {
    Easy: 5,   // 5 × 100 = 500
    Medium: 4, // 4 × 250 = 1,000
    Hard: 2,   // 2 × 500 = 1,000
    Expert: 0,
    // TOTAL = 2,500 ✅
  },
  globalRank: 142,
  streak: {
    current: 7,
    longest: 19,
    activityDays: generateActivityDays(),
    lastActiveDate: new Date().toISOString().split('T')[0],
  },
  securityStats: [
    { category: 'Web Security', score: 82 },
    { category: 'API Security', score: 64 },
    { category: 'Smart Contract', score: 71 },
    { category: 'Authentication', score: 58 },
    { category: 'Cloud / Infrastructure', score: 42 },
    { category: 'Cryptography', score: 35 },
    { category: 'Database Security', score: 48 },
  ],
};

function generateActivityDays(): string[] {
  const days: string[] = [];
  const today = new Date();
  // Add the last 7 days (current streak)
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  // Add some historical activity (for the calendar)
  const historicalGaps = [10, 12, 15, 18, 22, 24, 25, 26, 28, 30, 35, 38, 42];
  historicalGaps.forEach((gap) => {
    const d = new Date(today);
    d.setDate(d.getDate() - gap);
    days.push(d.toISOString().split('T')[0]);
  });
  return days;
}

// ============================================================
// Mock Challenges
// ============================================================

export const MOCK_CHALLENGES: Challenge[] = [
  {
    id: 'ch-001',
    title: 'XSS Sanitization Bypass',
    shortDescription: 'Identify and fix an XSS vulnerability in a React application input handler.',
    description:
      'A React web application has a user-facing comment input that fails to sanitize HTML. The application uses dangerouslySetInnerHTML without proper escaping, allowing stored XSS attacks. Your task is to identify the vulnerable code path and submit a patch that sanitizes input while preserving valid formatting.',
    category: 'Web Security',
    difficulty: 'Easy',
    pointsReward: 100,
    mstReward: 2,
    githubRepo: 'securex/vulnerable-react-app',
    githubIssueNumber: 7,
    attempts: 523,
    solved: 389,
    type: 'Fix',
    tags: ['XSS', 'React', 'Sanitization'],
    status: 'Verified',
    createdAt: '2025-02-01T00:00:00Z',
  },
  {
    id: 'ch-002',
    title: 'SQL Injection in Search API',
    shortDescription: 'Locate and remediate a SQL injection vulnerability in a REST API endpoint.',
    description:
      'A Node.js REST API endpoint constructs SQL queries using string concatenation with user-supplied input. No parameterized queries or ORMs are used. A malicious user can extract the entire users table. Identify the vulnerability and submit a fix using parameterized queries.',
    category: 'API Security',
    difficulty: 'Medium',
    pointsReward: 250,
    mstReward: 5,
    githubRepo: 'securex/vulnerable-api',
    githubIssueNumber: 17,
    attempts: 342,
    solved: 201,
    type: 'Fix',
    tags: ['SQL Injection', 'Node.js', 'API'],
    status: 'Verified',
    createdAt: '2025-02-05T00:00:00Z',
  },
  {
    id: 'ch-003',
    title: 'JWT Authentication Bypass',
    shortDescription: 'Exploit and fix a JWT algorithm confusion vulnerability.',
    description:
      'A backend service accepts JWTs with the "none" algorithm, allowing attackers to forge tokens without a valid signature. The authentication middleware does not verify the algorithm field. Identify the vulnerable middleware, explain the attack vector, and submit a fix that enforces RS256 algorithm validation.',
    category: 'Authentication',
    difficulty: 'Hard',
    pointsReward: 500,
    mstReward: 10,
    githubRepo: 'securex/jwt-bypass-lab',
    githubIssueNumber: 3,
    attempts: 187,
    solved: 64,
    type: 'Fix',
    tags: ['JWT', 'Algorithm Confusion', 'Authentication'],
    status: 'Verified',
    createdAt: '2025-02-10T00:00:00Z',
  },
  {
    id: 'ch-004',
    title: 'Smart Contract Reentrancy',
    shortDescription: 'Find and fix a reentrancy vulnerability in an ERC-20 vault contract.',
    description:
      'A Solidity smart contract implements a token vault with a withdraw function. The contract sends ETH before updating the internal balance, creating a classic reentrancy attack vector. Identify the bug and submit a fix using the Checks-Effects-Interactions pattern.',
    category: 'Smart Contract',
    difficulty: 'Hard',
    pointsReward: 500,
    mstReward: 10,
    githubRepo: 'securex/reentrancy-lab',
    githubIssueNumber: 2,
    attempts: 156,
    solved: 43,
    type: 'Fix',
    tags: ['Reentrancy', 'Solidity', 'EVM'],
    createdAt: '2025-02-12T00:00:00Z',
  },
  {
    id: 'ch-005',
    title: 'IDOR in User Profile API',
    shortDescription: 'Discover an Insecure Direct Object Reference in a profile management API.',
    description:
      'A REST API endpoint allows authenticated users to retrieve profile data using their user ID. However, the endpoint does not verify that the requesting user is the owner of the requested resource. Identify and fix the authorization flaw.',
    category: 'Authorization',
    difficulty: 'Easy',
    pointsReward: 100,
    mstReward: 2,
    githubRepo: 'securex/idor-lab',
    githubIssueNumber: 11,
    attempts: 612,
    solved: 481,
    type: 'Investigation',
    tags: ['IDOR', 'Authorization', 'REST'],
    createdAt: '2025-02-15T00:00:00Z',
  },
  {
    id: 'ch-006',
    title: 'Log4Shell Detection',
    shortDescription: 'Investigate a vulnerable dependency and document the attack surface.',
    description:
      'A Java application uses an outdated version of log4j that is vulnerable to CVE-2021-44228 (Log4Shell). Analyze the dependency tree, identify affected versions, document the attack vector with JNDI injection examples, and propose a mitigation strategy.',
    category: 'Dependency / Supply Chain',
    difficulty: 'Medium',
    pointsReward: 250,
    mstReward: 5,
    githubRepo: 'securex/log4shell-lab',
    githubIssueNumber: 5,
    attempts: 298,
    solved: 167,
    type: 'SecurityReport',
    tags: ['Log4j', 'CVE-2021-44228', 'Supply Chain'],
    createdAt: '2025-02-18T00:00:00Z',
  },
  {
    id: 'ch-007',
    title: 'S3 Bucket Misconfiguration',
    shortDescription: 'Identify and remediate a publicly exposed AWS S3 bucket.',
    description:
      'An application stores sensitive documents in an S3 bucket that has public read access enabled. Identify the misconfiguration, explain the data exposure risk, and propose the correct IAM and bucket policy to restrict access.',
    category: 'Cloud / Infrastructure',
    difficulty: 'Easy',
    pointsReward: 100,
    mstReward: 2,
    githubRepo: 'securex/cloud-misconfig-lab',
    githubIssueNumber: 8,
    attempts: 445,
    solved: 321,
    type: 'SecurityReport',
    tags: ['AWS', 'S3', 'Cloud Security'],
    createdAt: '2025-02-20T00:00:00Z',
  },
  {
    id: 'ch-008',
    title: 'Cryptographic Weakness in Token Generation',
    shortDescription: 'Find a weak PRNG used for session token generation.',
    description:
      'A web application generates session tokens using Math.random() which is not cryptographically secure. An attacker who observes several tokens can predict future tokens. Identify the vulnerable code and replace it with a cryptographically secure random number generator.',
    category: 'Cryptography',
    difficulty: 'Medium',
    pointsReward: 250,
    mstReward: 5,
    githubRepo: 'securex/crypto-weakness-lab',
    githubIssueNumber: 14,
    attempts: 203,
    solved: 98,
    type: 'Fix',
    tags: ['PRNG', 'Cryptography', 'Session'],
    createdAt: '2025-02-22T00:00:00Z',
  },
  {
    id: 'ch-009',
    title: 'Docker Container Escape',
    shortDescription: 'Identify a misconfigured Docker container that allows privilege escalation.',
    description:
      'A Docker container is run with the --privileged flag and mounts the host /etc directory. Identify the security risk, demonstrate the attack path to host filesystem access, and provide the secure container configuration.',
    category: 'DevSecOps',
    difficulty: 'Hard',
    pointsReward: 500,
    mstReward: 10,
    githubRepo: 'securex/container-escape-lab',
    githubIssueNumber: 22,
    attempts: 134,
    solved: 31,
    type: 'SecurityReport',
    tags: ['Docker', 'Container', 'Privilege Escalation'],
    createdAt: '2025-02-25T00:00:00Z',
  },
  {
    id: 'ch-010',
    title: 'CSRF Token Bypass',
    shortDescription: 'Exploit a broken CSRF protection mechanism in a form submission.',
    description:
      'A web application implements CSRF tokens but verifies them using a simple string comparison that is vulnerable to timing attacks. Additionally, the token is reused across sessions. Identify the flaw and provide a secure implementation.',
    category: 'Web Security',
    difficulty: 'Medium',
    pointsReward: 250,
    mstReward: 5,
    githubRepo: 'securex/csrf-bypass-lab',
    githubIssueNumber: 19,
    attempts: 276,
    solved: 142,
    type: 'Fix',
    tags: ['CSRF', 'Timing Attack', 'Web Security'],
    createdAt: '2025-03-01T00:00:00Z',
  },
  {
    id: 'ch-011',
    title: 'Path Traversal in File Upload',
    shortDescription: 'Find and fix a path traversal vulnerability in a file upload handler.',
    description:
      'A file upload endpoint uses the client-provided filename directly to save files without sanitization. An attacker can upload a file named ../../../../etc/cron.d/malicious to write to arbitrary filesystem locations. Fix the filename sanitization.',
    category: 'Backend Security',
    difficulty: 'Easy',
    pointsReward: 100,
    mstReward: 2,
    githubRepo: 'securex/path-traversal-lab',
    githubIssueNumber: 6,
    attempts: 389,
    solved: 278,
    type: 'Fix',
    tags: ['Path Traversal', 'File Upload', 'Backend'],
    createdAt: '2025-03-05T00:00:00Z',
  },
  {
    id: 'ch-012',
    title: 'Private Key in Git History',
    shortDescription: 'Detect a leaked private key in a public repository commit history.',
    description:
      'A developer accidentally committed an AWS private key in a previous commit and then deleted it in a subsequent commit. The key is still recoverable from git history. Detect the leaked credential, identify the commit, and document the remediation steps.',
    category: 'Configuration',
    difficulty: 'Easy',
    pointsReward: 100,
    mstReward: 2,
    githubRepo: 'securex/secrets-in-git-lab',
    githubIssueNumber: 4,
    attempts: 498,
    solved: 412,
    type: 'Investigation',
    tags: ['Secrets', 'Git', 'Credential Leak'],
    createdAt: '2025-03-08T00:00:00Z',
  },
];

// ============================================================
// Mock Challenge History (math-verified: 2,500 pts total)
// ============================================================

export const MOCK_CHALLENGE_HISTORY: ChallengeHistoryEntry[] = [
  // 5 Easy = 500
  {
    challengeId: 'ch-001',
    title: 'XSS Sanitization Bypass',
    category: 'Web Security',
    difficulty: 'Easy',
    pointsAwarded: 100,
    status: 'Verified',
    completedAt: '2025-03-10T14:22:00Z',
  },
  {
    challengeId: 'ch-005',
    title: 'IDOR in User Profile API',
    category: 'Authorization',
    difficulty: 'Easy',
    pointsAwarded: 100,
    status: 'Verified',
    completedAt: '2025-03-09T11:05:00Z',
  },
  {
    challengeId: 'ch-007',
    title: 'S3 Bucket Misconfiguration',
    category: 'Cloud / Infrastructure',
    difficulty: 'Easy',
    pointsAwarded: 100,
    status: 'Verified',
    completedAt: '2025-03-08T09:30:00Z',
  },
  {
    challengeId: 'ch-011',
    title: 'Path Traversal in File Upload',
    category: 'Backend Security',
    difficulty: 'Easy',
    pointsAwarded: 100,
    status: 'Verified',
    completedAt: '2025-03-07T16:48:00Z',
  },
  {
    challengeId: 'ch-012',
    title: 'Private Key in Git History',
    category: 'Configuration',
    difficulty: 'Easy',
    pointsAwarded: 100,
    status: 'Verified',
    completedAt: '2025-03-06T13:22:00Z',
  },
  // 4 Medium = 1,000
  {
    challengeId: 'ch-002',
    title: 'SQL Injection in Search API',
    category: 'API Security',
    difficulty: 'Medium',
    pointsAwarded: 250,
    status: 'Verified',
    completedAt: '2025-03-05T10:15:00Z',
  },
  {
    challengeId: 'ch-006',
    title: 'Log4Shell Detection',
    category: 'Dependency / Supply Chain',
    difficulty: 'Medium',
    pointsAwarded: 250,
    status: 'Verified',
    completedAt: '2025-03-04T14:33:00Z',
  },
  {
    challengeId: 'ch-008',
    title: 'Cryptographic Weakness in Token Generation',
    category: 'Cryptography',
    difficulty: 'Medium',
    pointsAwarded: 250,
    status: 'Verified',
    completedAt: '2025-03-03T09:12:00Z',
  },
  {
    challengeId: 'ch-010',
    title: 'CSRF Token Bypass',
    category: 'Web Security',
    difficulty: 'Medium',
    pointsAwarded: 250,
    status: 'Verified',
    completedAt: '2025-03-02T17:45:00Z',
  },
  // 2 Hard = 1,000
  {
    challengeId: 'ch-003',
    title: 'JWT Authentication Bypass',
    category: 'Authentication',
    difficulty: 'Hard',
    pointsAwarded: 500,
    status: 'Verified',
    completedAt: '2025-03-01T12:00:00Z',
  },
  {
    challengeId: 'ch-004',
    title: 'Smart Contract Reentrancy',
    category: 'Smart Contract',
    difficulty: 'Hard',
    pointsAwarded: 500,
    status: 'Verified',
    completedAt: '2025-02-28T15:30:00Z',
  },
];

// Verify: 5*100 + 4*250 + 2*500 = 500 + 1000 + 1000 = 2500 ✅

// ============================================================
// Mock Leaderboard
// ============================================================

export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, participantId: 'u1', username: 'user123', points: 12500, level: 10, challengesSolved: 47, currentStreak: 21 },
  { rank: 2, participantId: 'u2', username: 'hacker42', points: 11500, level: 10, challengesSolved: 43, currentStreak: 14 },
  { rank: 3, participantId: 'u3', username: 'cyberkid', points: 10500, level: 9, challengesSolved: 40, currentStreak: 9 },
  { rank: 4, participantId: 'u4', username: 'sec_ninja', points: 9750, level: 9, challengesSolved: 37, currentStreak: 5 },
  { rank: 5, participantId: 'u5', username: 'zeroday_z', points: 8900, level: 9, challengesSolved: 34, currentStreak: 12 },
  { rank: 6, participantId: 'u6', username: 'pwnmaster', points: 8200, level: 9, challengesSolved: 31, currentStreak: 3 },
  { rank: 7, participantId: 'u7', username: 'vulnhunter', points: 7500, level: 8, challengesSolved: 29, currentStreak: 18 },
  { rank: 8, participantId: 'u8', username: 'redteam_r', points: 6800, level: 8, challengesSolved: 26, currentStreak: 7 },
  { rank: 9, participantId: 'u9', username: 'hashcrack', points: 6100, level: 8, challengesSolved: 23, currentStreak: 0 },
  { rank: 10, participantId: 'u10', username: 'malware_m', points: 5500, level: 7, challengesSolved: 21, currentStreak: 4 },
  // ... (many more entries)
  { rank: 140, participantId: 'u140', username: 'secure_sam', points: 2600, level: 7, challengesSolved: 10, currentStreak: 3 },
  { rank: 141, participantId: 'u141', username: 'cryptoh4x', points: 2550, level: 7, challengesSolved: 11, currentStreak: 6 },
  {
    rank: 142,
    participantId: 'user-alex-001',
    username: 'alexsec',
    displayName: 'Alex',
    points: 2500,
    level: 7,
    challengesSolved: 11,
    currentStreak: 7,
    isCurrentUser: true,
  },
  { rank: 143, participantId: 'u143', username: 'redhat_r', points: 2450, level: 7, challengesSolved: 10, currentStreak: 2 },
  { rank: 144, participantId: 'u144', username: 'appsec_a', points: 2400, level: 6, challengesSolved: 9, currentStreak: 0 },
];

// ============================================================
// Mock Rewards
// ============================================================

export const MOCK_REWARDS: Reward[] = [
  {
    id: 'reward-001',
    challengeId: 'ch-003',
    challengeTitle: 'JWT Authentication Bypass',
    mstAmount: 10,
    status: 'Confirmed',
    transactionHash: '0x7a83f4c2e1b9d5a8c3f6e2b1d4a7c9e3f5b2d1a4c6e8b3d5a7c2e4f1b6d3a8',
    confirmedAt: '2025-03-01T12:05:00Z',
    createdAt: '2025-03-01T12:00:00Z',
  },
  {
    id: 'reward-002',
    challengeId: 'ch-004',
    challengeTitle: 'Smart Contract Reentrancy',
    mstAmount: 10,
    status: 'Confirmed',
    transactionHash: '0x3d5a7c2e4f1b6d3a8c9e3f5b2d1a4c6e8b7f4c2e1b9d5a8c3f6e2b1d4a7c9',
    confirmedAt: '2025-02-28T15:35:00Z',
    createdAt: '2025-02-28T15:30:00Z',
  },
  {
    id: 'reward-003',
    challengeId: 'ch-002',
    challengeTitle: 'SQL Injection in Search API',
    mstAmount: 5,
    status: 'Confirmed',
    transactionHash: '0x1a4c6e8b7f4c2e1b9d5a8c3f6e2b1d4a7c9e3f5b2d3d5a7c2e4f1b6d3a8c9',
    confirmedAt: '2025-03-05T10:20:00Z',
    createdAt: '2025-03-05T10:15:00Z',
  },
];

// ============================================================
// Mock Streak
// ============================================================

export const MOCK_STREAK: Streak = MOCK_STATS.streak;
