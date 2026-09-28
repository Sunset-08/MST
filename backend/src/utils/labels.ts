// Maps database enum values to the labels used by the frontend contract (and back).

export const DIFFICULTY_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert" } as const;
export type DbDifficulty = keyof typeof DIFFICULTY_LABEL;

export const CHALLENGE_TYPE_LABEL = {
  code: "Code",
  investigation: "Investigation",
  fix: "Fix",
  security_report: "SecurityReport",
} as const;
export type DbChallengeType = keyof typeof CHALLENGE_TYPE_LABEL;

export const REWARD_STATUS_LABEL = {
  pending: "Pending",
  submitted: "Processing",
  confirmed: "Confirmed",
  failed: "Failed",
} as const;

export const SUBMISSION_STATUS_LABEL = { pending: "Pending", verified: "Verified", rejected: "Failed" } as const;

export const PARTICIPANT_STATUSES = ["Not Started", "Attempted", "Submitted", "Under Review", "Verified", "Failed"] as const;
export type ParticipantChallengeStatus = (typeof PARTICIPANT_STATUSES)[number];

/** Accepts either the DB value or the frontend label, case-insensitively. */
export function fromLabel<T extends Record<string, string>>(map: T, input: string): keyof T | undefined {
  const needle = input.trim().toLowerCase().replace(/[\s_-]/g, "");
  for (const [key, label] of Object.entries(map)) {
    if (key.replace(/_/g, "") === needle || label.toLowerCase().replace(/[\s_-]/g, "") === needle) return key as keyof T;
  }
  return undefined;
}
