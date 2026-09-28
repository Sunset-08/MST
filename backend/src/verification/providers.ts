import { readConfig } from "./challenge-config.js";
import type { VerificationInput, VerificationOutcome, VerificationProvider, VerificationType } from "./types.js";

const norm = (s: string) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s._-]/gu, " ").replace(/\s+/g, " ").trim();
/** Free-text answers longer than this are only accepted on an exact match, so an essay cannot pass by listing keywords. */
const MAX_CONTAINS_LENGTH = 400;

/**
 * Multiple-choice: exact option id. Free text: equal to an accepted answer, or (for short answers) containing an
 * accepted phrase as whole words, e.g. accepted "second verifier" matches "Require a second verifier".
 */
function matches(question: { type: string }, accepted: string[], answer: string): boolean {
  const a = norm(answer);
  if (!a) return false;
  return accepted.some((k) => {
    const key = norm(k);
    if (!key) return false;
    if (a === key) return true;
    if (question.type === "multiple_choice" || answer.length > MAX_CONTAINS_LENGTH) return false;
    return ` ${a} `.includes(` ${key} `);
  });
}

/** Grades question answers against server-held answer keys. */
export class RuleBasedVerificationProvider implements VerificationProvider {
  readonly type = "rule_based" as const;
  readonly automatic = true;
  readonly configured = true;

  async verify({ submission, challenge }: VerificationInput): Promise<VerificationOutcome> {
    const config = readConfig(challenge.challengeConfig);
    const questions = config.questions ?? [];
    if (questions.length === 0) {
      return { status: "pending", reason: "Rule-based verification requires challenge questions with answer keys; awaiting manual review" };
    }
    const data = submission.submissionData as { selectedAnswers?: unknown; structuredAnswers?: unknown };
    const selected = Array.isArray(data.selectedAnswers) ? data.selectedAnswers.map(String) : [];
    const structured = data.structuredAnswers && typeof data.structuredAnswers === "object"
      ? (data.structuredAnswers as Record<string, unknown>) : {};

    let mcIndex = 0;
    let earned = 0;
    let total = 0;
    let correct = 0;
    for (const q of questions) {
      const fromStructured = structured[q.id];
      let answer: string | undefined = typeof fromStructured === "string" ? fromStructured : undefined;
      if (q.type === "multiple_choice") {
        answer ??= selected[mcIndex];
        mcIndex++;
      }
      const keys = q.type === "multiple_choice" && q.correctAnswer ? [q.correctAnswer] : config.acceptedAnswers?.[q.id];
      if (!keys || keys.length === 0) {
        return { status: "pending", reason: "This challenge includes answers that require manual review" };
      }
      total += q.points;
      if (answer !== undefined && matches(q, keys, answer)) {
        earned += q.points;
        correct++;
      }
    }
    const score = total === 0 ? (correct === questions.length ? 100 : 0) : Math.round((earned / total) * 100);
    const required = config.passingScore ?? 100;
    const evidence = { score, correctAnswers: correct, totalQuestions: questions.length, requiredScore: required };
    return score >= required
      ? { status: "passed", reason: `All required answers verified (score ${score}%)`, score, evidence }
      : { status: "failed", reason: `${correct} of ${questions.length} answers correct (score ${score}%, required ${required}%)`, score, evidence };
  }
}

/** Automated test execution needs a sandboxed runner, which is not configured in this deployment. */
export class AutomatedTestVerificationProvider implements VerificationProvider {
  readonly type = "automated_test" as const;
  readonly automatic = true;
  readonly configured = false;

  async verify(): Promise<VerificationOutcome> {
    return { status: "pending", reason: "Automated test runner is not configured; submission awaits configuration or manual review" };
  }
}

/** Decided by an authorized reviewer through the review endpoints. */
export class ManualReviewVerificationProvider implements VerificationProvider {
  readonly automatic = false;
  readonly configured = true;
  constructor(readonly type: "admin_review" | "peer_review") {}

  async verify(): Promise<VerificationOutcome> {
    return {
      status: "pending",
      reason: this.type === "admin_review" ? "Awaiting review by the challenge organization" : "Awaiting peer review decision",
    };
  }
}

export function createVerificationProviders(): Record<VerificationType, VerificationProvider> {
  return {
    rule_based: new RuleBasedVerificationProvider(),
    automated_test: new AutomatedTestVerificationProvider(),
    admin_review: new ManualReviewVerificationProvider("admin_review"),
    peer_review: new ManualReviewVerificationProvider("peer_review"),
  };
}
