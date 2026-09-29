import { z } from "zod";

/** Server-side challenge configuration stored in challenges.challenge_config. */
export const questionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  type: z.enum(["multiple_choice", "short_answer", "structured_response", "security_reasoning"]),
  questionText: z.string().trim().min(1).max(4000),
  options: z.array(z.object({ id: z.string().trim().min(1).max(16), text: z.string().trim().min(1).max(1000) })).max(10).optional(),
  correctAnswer: z.string().trim().min(1).max(200).optional(),
  expectedAnswer: z.string().trim().max(4000).optional(),
  points: z.number().int().min(0).max(10_000).default(1),
});
export type ChallengeQuestion = z.infer<typeof questionSchema>;

export const challengeConfigSchema = z.object({
  shortDescription: z.string().trim().max(300).optional(),
  securityIssue: z.string().trim().max(4000).optional(),
  /** Files (or directories ending in "/") in the challenge repository that a solution is expected to change. */
  targetFiles: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
  questions: z.array(questionSchema).max(50).optional(),
  /** Exact (case/space-insensitive) accepted answers for non-multiple-choice questions, by question id. */
  acceptedAnswers: z.record(z.string(), z.array(z.string().trim().min(1).max(1000)).max(20)).optional(),
  /** Percentage of question points required to pass rule-based verification (default 100). */
  passingScore: z.number().int().min(1).max(100).optional(),
  expectedSolutionCriteria: z.string().trim().max(8000).optional(),
  reputationReward: z.number().int().min(0).max(10_000).optional(),
}).strict();
export type ChallengeConfig = z.infer<typeof challengeConfigSchema>;

export function readConfig(raw: unknown): ChallengeConfig {
  const parsed = challengeConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

/** What participants may see: never answer keys, accepted answers or grading criteria. */
export function publicConfig(raw: unknown) {
  const c = readConfig(raw);
  return {
    shortDescription: c.shortDescription,
    securityIssue: c.securityIssue,
    targetFiles: c.targetFiles ?? [],
    tags: c.tags ?? [],
    expiresAt: c.expiresAt ?? null,
    questions: (c.questions ?? []).map((q) => ({
      id: q.id,
      type: q.type,
      questionText: q.questionText,
      options: q.options,
      points: q.points,
    })),
  };
}

/** Rule-based challenges without an explicit maxAttempts are capped to limit answer guessing. */
export const DEFAULT_RULE_BASED_MAX_ATTEMPTS = 5;
