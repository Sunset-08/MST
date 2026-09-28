import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { challengeAttempts, challenges, organizations, submissions, verifications } from "../db/schema.js";
import { findMembership, ROLE_RANK } from "../middleware/auth.js";
import { canonicalJson, sha256Hex } from "../utils/crypto.js";
import { iso } from "../utils/dates.js";
import { badRequest, conflict, notFound, parse } from "../utils/http.js";
import { CHALLENGE_TYPE_LABEL, fromLabel, type DbChallengeType } from "../utils/labels.js";
import type { VerificationService } from "../verification/engine.js";
import type { VerificationType } from "../verification/types.js";
import { ChallengesService, isExpired } from "./challenges.service.js";
import type { ServiceDeps } from "./deps.js";

const text = (max: number) => z.string().trim().min(1).max(max);

/** Accepts the frontend Submission shape; unknown fields are rejected. */
export const submitSchema = z.object({
  challengeId: z.uuid().optional(),
  type: z.string().trim().max(32).optional(),
  patch: z.string().min(1).max(200_000).optional(),
  repositoryUrl: z.url({ protocol: /^https$/ }).max(500).optional(),
  commitHash: z.string().trim().regex(/^[0-9a-fA-F]{7,64}$/).optional(),
  explanation: text(10_000).optional(),
  selectedAnswers: z.array(text(200)).max(50).optional(),
  structuredAnswers: z.record(z.string().trim().min(1).max(64), text(10_000)).optional(),
  vulnerability: text(20_000).optional(),
  impact: text(20_000).optional(),
  attackPath: text(20_000).optional(),
  recommendedFix: text(20_000).optional(),
  evidence: text(50_000).optional(),
}).strict();
type SubmitInput = z.infer<typeof submitSchema>;

const SUBMISSION_TYPE: Record<DbChallengeType, "code" | "patch" | "investigation" | "report"> = {
  code: "code", fix: "patch", investigation: "investigation", security_report: "report",
};

const FIELDS: Record<DbChallengeType, (keyof SubmitInput)[]> = {
  code: ["patch", "repositoryUrl", "commitHash", "explanation"],
  fix: ["patch", "repositoryUrl", "commitHash", "explanation"],
  investigation: ["selectedAnswers", "structuredAnswers", "explanation"],
  security_report: ["vulnerability", "impact", "attackPath", "recommendedFix", "evidence"],
};

/** Keeps only the fields that belong to the challenge type and enforces the required ones. */
function payloadFor(type: DbChallengeType, input: SubmitInput): Record<string, unknown> {
  const allowed = FIELDS[type];
  const extra = (Object.keys(input) as (keyof SubmitInput)[])
    .filter((k) => k !== "challengeId" && k !== "type" && input[k] !== undefined && !allowed.includes(k));
  if (extra.length) throw badRequest("SUBMISSION_FIELDS_INVALID", `Fields not allowed for this challenge type: ${extra.join(", ")}`);
  const data = Object.fromEntries(allowed.filter((k) => input[k] !== undefined).map((k) => [k, input[k]]));
  if (type === "code" || type === "fix") {
    if (!input.patch && !(input.repositoryUrl && input.commitHash)) {
      throw badRequest("SUBMISSION_INCOMPLETE", "Provide a patch, or a repositoryUrl with a commitHash");
    }
  } else if (type === "investigation") {
    if (!input.selectedAnswers?.length && !Object.keys(input.structuredAnswers ?? {}).length) {
      throw badRequest("SUBMISSION_INCOMPLETE", "Provide selectedAnswers or structuredAnswers");
    }
  } else if (!input.vulnerability || !input.impact || !input.recommendedFix) {
    throw badRequest("SUBMISSION_INCOMPLETE", "Security reports require vulnerability, impact and recommendedFix");
  }
  return data;
}

export class SubmissionsService {
  constructor(private readonly deps: ServiceDeps, private readonly verification: VerificationService) {}

  async submit(attemptId: string, user: { id: string }, body: unknown) {
    if (!z.uuid().safeParse(attemptId).success) throw notFound("Attempt");
    const input = parse(submitSchema, body);
    const now = this.deps.now();

    const result = await this.deps.db.transaction(async (tx) => {
      await ChallengesService.lockUser(tx, user.id);
      // Ownership is part of the lookup: another user's attempt is indistinguishable from a missing one.
      const [attempt] = await tx.select().from(challengeAttempts)
        .where(and(eq(challengeAttempts.id, attemptId), eq(challengeAttempts.userId, user.id))).limit(1);
      if (!attempt) throw notFound("Attempt");
      const [existing] = await tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.attemptId, attempt.id)).limit(1);
      if (existing) throw conflict("DUPLICATE_SUBMISSION", "This attempt already has a submission");
      if (attempt.status !== "started") throw conflict("ATTEMPT_NOT_ACTIVE", "This attempt is no longer active");

      const [row] = await tx.select({ challenge: challenges, orgStatus: organizations.status }).from(challenges)
        .innerJoin(organizations, eq(organizations.id, challenges.organizationId))
        .where(eq(challenges.id, attempt.challengeId)).limit(1);
      if (!row || row.challenge.status !== "published" || row.orgStatus === "deleted") throw notFound("Challenge");
      const challenge = row.challenge;
      if (isExpired(challenge, now)) throw conflict("CHALLENGE_EXPIRED", "This challenge is no longer accepting submissions");
      if (input.challengeId && input.challengeId !== challenge.id) throw badRequest("CHALLENGE_MISMATCH", "challengeId does not match the attempt");
      if (input.type && fromLabel(CHALLENGE_TYPE_LABEL, input.type) !== challenge.challengeType) {
        throw badRequest("SUBMISSION_TYPE_MISMATCH", "Submission type does not match the challenge type");
      }

      const data = payloadFor(challenge.challengeType, input);
      const [submission] = await tx.insert(submissions).values({
        attemptId: attempt.id,
        userId: user.id,
        challengeId: challenge.id,
        submissionType: SUBMISSION_TYPE[challenge.challengeType],
        submissionData: data,
        solutionHash: sha256Hex(canonicalJson(data)),
        status: "pending",
        submittedAt: now,
      }).returning();
      const provider = this.verification.providers[challenge.verificationType as VerificationType];
      const reason = provider.automatic && provider.configured
        ? "Queued for automated verification"
        : (await provider.verify({ submission: submission!, challenge })).reason;
      await tx.insert(verifications).values({ submissionId: submission!.id, verificationType: challenge.verificationType, status: "pending", reason });
      await tx.update(challengeAttempts).set({ status: "submitted" }).where(eq(challengeAttempts.id, attempt.id));
      return { submission: submission!, challenge, reason, automatic: provider.automatic && provider.configured };
    });

    if (result.automatic) this.scheduleVerification(result.submission.id);
    return {
      submissionId: result.submission.id,
      attemptId,
      challengeId: result.challenge.id,
      status: "Pending" as const,
      verificationStatus: "pending" as const,
      verificationType: result.challenge.verificationType,
      pointsAwarded: 0,
      reputationAwarded: 0,
      mstAwarded: 0,
      streakUpdated: false,
      reason: result.reason,
      submittedAt: iso(result.submission.submittedAt),
    };
  }

  /** Background verification; failures are logged and retried lazily when the result is requested. */
  scheduleVerification(submissionId: string): void {
    setImmediate(() => {
      this.verification.process(submissionId).catch((error: unknown) => {
        console.error(`[securex] verification failed for submission ${submissionId}: ${(error as Error)?.message ?? error}`);
      });
    });
  }

  /** Owner, owner/admin of the challenge's organization, or platform admin; everyone else gets 404. */
  async result(submissionId: string, user: { id: string; role: string }) {
    if (!z.uuid().safeParse(submissionId).success) throw notFound("Submission");
    const [row] = await this.deps.db.select({ userId: submissions.userId, status: submissions.status, organizationId: challenges.organizationId })
      .from(submissions).innerJoin(challenges, eq(challenges.id, submissions.challengeId))
      .where(eq(submissions.id, submissionId)).limit(1);
    if (!row) throw notFound("Submission");
    if (row.userId !== user.id && user.role !== "platform_admin") {
      const role = await findMembership(this.deps.db, row.organizationId, user.id);
      if (!role || ROLE_RANK[role] < ROLE_RANK.admin) throw notFound("Submission");
    }
    if (row.status === "pending") await this.verification.process(submissionId);
    return this.verification.result(submissionId);
  }
}
