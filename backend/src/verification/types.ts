import type { challenges, submissions } from "../db/schema.js";

export type VerificationType = "automated_test" | "rule_based" | "admin_review" | "peer_review";

export interface VerificationInput {
  submission: typeof submissions.$inferSelect;
  challenge: typeof challenges.$inferSelect;
}

/** `pending` means no decision could be made automatically; it is never converted into success. */
export interface VerificationOutcome {
  status: "passed" | "failed" | "pending";
  reason: string;
  score?: number;
  evidence?: Record<string, unknown>;
}

export interface VerificationProvider {
  readonly type: VerificationType;
  /** Whether this provider can decide without a human reviewer. */
  readonly automatic: boolean;
  /** Whether the provider has what it needs to run in this deployment. */
  readonly configured: boolean;
  verify(input: VerificationInput): Promise<VerificationOutcome>;
}
