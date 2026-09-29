import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { challengeAttempts, challenges, githubIssues, githubOrganizations, organizations, repositories, submissions, users, verifications } from "../db/schema.js";
import { findMembership, ROLE_RANK } from "../middleware/auth.js";
import { canonicalJson, sha256Hex } from "../utils/crypto.js";
import { iso } from "../utils/dates.js";
import { AppError, badRequest, conflict, forbidden, notFound, parse, unavailable } from "../utils/http.js";
import { CHALLENGE_TYPE_LABEL, fromLabel, type DbChallengeType } from "../utils/labels.js";
import { readConfig } from "../verification/challenge-config.js";
import type { VerificationService } from "../verification/engine.js";
import type { VerificationType } from "../verification/types.js";
import { ChallengesService, isExpired } from "./challenges.service.js";
import type { DbOrTx } from "../db/index.js";
import type { ServiceDeps } from "./deps.js";

const text = (max: number) => z.string().trim().min(1).max(max);

/** Accepts the frontend Submission shape; unknown fields are rejected. */
export const submitSchema = z.object({
  challengeId: z.uuid().optional(),
  type: z.string().trim().max(32).optional(),
  patch: z.string().min(1).max(200_000).optional(),
  /** Pull request against the challenge's own repository; the commit SHA is read from GitHub, never typed in. */
  pullRequestUrl: z.url({ protocol: /^https$/ }).max(500).optional(),
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
  code: ["patch", "pullRequestUrl", "explanation"],
  fix: ["patch", "pullRequestUrl", "explanation"],
  investigation: ["selectedAnswers", "structuredAnswers", "explanation"],
  security_report: ["vulnerability", "impact", "attackPath", "recommendedFix", "evidence"],
};

/** Keeps only the fields that belong to the challenge type and enforces the required ones. */
function payloadFor(type: DbChallengeType, input: SubmitInput, hasRepository: boolean): Record<string, unknown> {
  const allowed = FIELDS[type];
  const extra = (Object.keys(input) as (keyof SubmitInput)[])
    .filter((k) => k !== "challengeId" && k !== "type" && input[k] !== undefined && !allowed.includes(k));
  if (extra.length) throw badRequest("SUBMISSION_FIELDS_INVALID", `Fields not allowed for this challenge type: ${extra.join(", ")}`);
  const data = Object.fromEntries(allowed.filter((k) => input[k] !== undefined).map((k) => [k, input[k]]));
  if (type === "code" || type === "fix") {
    if (hasRepository && !input.pullRequestUrl) {
      throw badRequest("SUBMISSION_INCOMPLETE", "Submit the URL of your pull request to the challenge repository");
    }
    if (!hasRepository && input.pullRequestUrl) throw badRequest("SUBMISSION_FIELDS_INVALID", "This challenge has no GitHub repository; submit a patch instead");
    if (!hasRepository && !input.patch) throw badRequest("SUBMISSION_INCOMPLETE", "Provide your patch or solution");
  } else if (type === "investigation") {
    if (!input.selectedAnswers?.length && !Object.keys(input.structuredAnswers ?? {}).length) {
      throw badRequest("SUBMISSION_INCOMPLETE", "Provide selectedAnswers or structuredAnswers");
    }
  } else if (!input.vulnerability || !input.impact || !input.recommendedFix) {
    throw badRequest("SUBMISSION_INCOMPLETE", "Security reports require vulnerability, impact and recommendedFix");
  }
  return data;
}


interface ChallengeTarget { fullName: string; owner: string; name: string; installationId: string; issueNumber: number; issueUrl: string }

/** Verified facts about the participant's pull request, read from GitHub. `commitSha` is the PR's real head commit. */
type PullRequestFacts = Record<string, unknown> & { commitSha: string };

const PR_PATH = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/;
const SHA_40 = /^[0-9a-f]{40}$/;

/** True when a changed file is one of the organization's target files (a target ending in "/" is a directory). */
export function touchesTarget(changed: string[], targets: string[]): boolean {
  return changed.some((f) => targets.some((t) => (t.endsWith("/") ? f.startsWith(t) : f === t)));
}

export class SubmissionsService {
  constructor(private readonly deps: ServiceDeps, private readonly verification: VerificationService) {}

  /** The repository and issue an organization attached to a challenge, with the installation that can read it. */
  private async targetOf(challenge: typeof challenges.$inferSelect, db: DbOrTx = this.deps.db): Promise<ChallengeTarget | null> {
    if (!challenge.githubIssueId) return null;
    const [row] = await db.select({
      fullName: repositories.fullName, name: repositories.name, installationId: githubOrganizations.installationId,
      issueNumber: githubIssues.issueNumber, issueUrl: githubIssues.url,
    }).from(githubIssues)
      .innerJoin(repositories, eq(repositories.id, githubIssues.repositoryId))
      .innerJoin(githubOrganizations, eq(githubOrganizations.id, repositories.githubOrganizationId))
      .where(eq(githubIssues.id, challenge.githubIssueId)).limit(1);
    if (!row) return null;
    return { ...row, owner: row.fullName.split("/")[0]! };
  }

  /**
   * Reads the participant's pull request from GitHub and checks that it belongs to this challenge: same repository,
   * opened by the participant's connected GitHub account, created after the challenge, touching the target files.
   * The commit SHA comes from GitHub; there is no way to supply one.
   */
  private async resolvePullRequest(
    challenge: typeof challenges.$inferSelect, target: ChallengeTarget, user: { id: string }, pullRequestUrl: string,
  ): Promise<PullRequestFacts> {
    const url = new URL(pullRequestUrl);
    const match = url.hostname === "github.com" ? PR_PATH.exec(url.pathname) : null;
    if (!match) throw badRequest("PR_URL_INVALID", "Enter a GitHub pull request URL such as https://github.com/owner/repo/pull/12");
    const [owner, repo, number] = [match[1]!, match[2]!, Number(match[3])];
    if (`${owner}/${repo}`.toLowerCase() !== target.fullName.toLowerCase()) {
      throw badRequest("PR_REPOSITORY_MISMATCH", `The pull request must be opened against ${target.fullName}`);
    }
    if (!this.deps.github.isConfigured()) throw unavailable("GITHUB_NOT_CONFIGURED", "GitHub is not configured, so pull requests cannot be verified");

    const [profile] = await this.deps.db.select({ githubUsername: users.githubUsername }).from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile?.githubUsername) throw forbidden("Connect your GitHub account before submitting a pull request", "GITHUB_CONNECTION_REQUIRED");

    let pr;
    try {
      pr = await this.deps.github.getPullRequest(target.installationId, target.owner, target.name, number);
    } catch (error) {
      if (error instanceof AppError && error.code === "GITHUB_NOT_FOUND") throw badRequest("PR_NOT_FOUND", `Pull request #${number} was not found in ${target.fullName}`);
      throw error;
    }
    if (pr.baseRepository.toLowerCase() !== target.fullName.toLowerCase()) {
      throw badRequest("PR_REPOSITORY_MISMATCH", `The pull request must be opened against ${target.fullName}`);
    }
    if (!pr.author || pr.author.toLowerCase() !== profile.githubUsername.toLowerCase()) {
      throw forbidden(`This pull request was opened by ${pr.author ?? "another account"}, not by your connected GitHub account (${profile.githubUsername})`, "PR_AUTHOR_MISMATCH");
    }
    if (pr.state === "closed" && !pr.merged) throw conflict("PR_CLOSED", "This pull request was closed without being merged");
    if (Date.parse(pr.createdAt) < challenge.createdAt.getTime()) {
      throw conflict("PR_PREDATES_CHALLENGE", "This pull request was created before the challenge; open a new one for this challenge");
    }
    if (!SHA_40.test(pr.headSha)) throw new AppError(502, "GITHUB_API_ERROR", "GitHub did not return a commit SHA for this pull request");
    const targets = readConfig(challenge.challengeConfig).targetFiles ?? [];
    if (targets.length && !touchesTarget(pr.changedFiles, targets)) {
      throw badRequest("PR_MISSES_TARGET", `The pull request must change one of: ${targets.join(", ")}`);
    }
    const mentions = [`#${target.issueNumber}`, target.issueUrl];
    return {
      pullRequestUrl: pr.url,
      pullRequestNumber: pr.number,
      pullRequestTitle: pr.title,
      pullRequestState: pr.merged ? "merged" : pr.state,
      repository: target.fullName,
      issueNumber: target.issueNumber,
      referencesIssue: mentions.some((m) => `${pr.title}\n${pr.body ?? ""}`.includes(m)),
      authorLogin: pr.author,
      baseRef: pr.baseRef,
      headRef: pr.headRef,
      headRepository: pr.headRepository,
      commitSha: pr.headSha,
      mergeCommitSha: pr.mergeCommitSha,
      changedFiles: pr.changedFiles.slice(0, 100),
      retrievedAt: this.deps.now().toISOString(),
    };
  }

  async submit(attemptId: string, user: { id: string }, body: unknown) {
    if (!z.uuid().safeParse(attemptId).success) throw notFound("Attempt");
    const input = parse(submitSchema, body);
    const now = this.deps.now();

    // GitHub is contacted before the database transaction so no lock is held during a network call.
    let pullRequest: { challengeId: string; facts: PullRequestFacts } | undefined;
    if (input.pullRequestUrl) {
      const [pre] = await this.deps.db.select({ challenge: challenges }).from(challengeAttempts)
        .innerJoin(challenges, eq(challenges.id, challengeAttempts.challengeId))
        .where(and(eq(challengeAttempts.id, attemptId), eq(challengeAttempts.userId, user.id))).limit(1);
      const target = pre ? await this.targetOf(pre.challenge) : null;
      if (pre && target && (pre.challenge.challengeType === "code" || pre.challenge.challengeType === "fix")) {
        pullRequest = { challengeId: pre.challenge.id, facts: await this.resolvePullRequest(pre.challenge, target, user, input.pullRequestUrl) };
      }
    }

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

      const hasRepository = Boolean(await this.targetOf(challenge, tx));
      const data = payloadFor(challenge.challengeType, input, hasRepository);
      if (hasRepository) {
        if (!pullRequest || pullRequest.challengeId !== challenge.id) throw badRequest("SUBMISSION_INCOMPLETE", "Submit the URL of your pull request to the challenge repository");
        const sha = pullRequest.facts.commitSha;
        const [reused] = await tx.select({ id: submissions.id }).from(submissions)
          .where(and(eq(submissions.challengeId, challenge.id), ne(submissions.userId, user.id), sql`${submissions.submissionData}->>'commitSha' = ${sha}`)).limit(1);
        if (reused) throw conflict("COMMIT_ALREADY_SUBMITTED", "Another participant already submitted this commit for the challenge");
        delete data.pullRequestUrl;
        Object.assign(data, pullRequest.facts);
      }
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
      ...(typeof result.submission.submissionData === "object" && result.submission.submissionData && "commitSha" in result.submission.submissionData
        ? { commitSha: (result.submission.submissionData as { commitSha: string }).commitSha, pullRequestUrl: (result.submission.submissionData as { pullRequestUrl: string }).pullRequestUrl }
        : {}),
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
