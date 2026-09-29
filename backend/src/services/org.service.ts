import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { ref } from "../utils/sql.js";
import { z } from "zod";
import { challengeAttempts, challenges, githubIssues, githubOrganizations, repositories, rewards, submissions, users, verifications } from "../db/schema.js";
import { ROLE_RANK, type OrgRole } from "../middleware/auth.js";
import { challengeConfigSchema, publicConfig, readConfig, type ChallengeConfig } from "../verification/challenge-config.js";
import type { VerificationService } from "../verification/engine.js";
import { iso } from "../utils/dates.js";
import { badRequest, conflict, notFound, parse } from "../utils/http.js";
import { CHALLENGE_TYPE_LABEL, DIFFICULTY_LABEL, fromLabel, SUBMISSION_STATUS_LABEL, type DbChallengeType, type DbDifficulty } from "../utils/labels.js";
import { offsetOf, paginated, paginationSchema } from "../utils/pagination.js";
import { DEFAULT_POINTS_BY_DIFFICULTY } from "./gamification.rules.js";
import type { DbOrTx } from "../db/index.js";
import type { ServiceDeps } from "./deps.js";

const difficultySchema = z.string().trim().transform((v, ctx) => {
  const d = fromLabel(DIFFICULTY_LABEL, v);
  if (!d) ctx.addIssue({ code: "custom", message: "Unknown difficulty" });
  return d as DbDifficulty;
});
const challengeTypeSchema = z.string().trim().transform((v, ctx) => {
  const t = fromLabel(CHALLENGE_TYPE_LABEL, v);
  if (!t) ctx.addIssue({ code: "custom", message: "Unknown challenge type" });
  return t as DbChallengeType;
});

const challengeFields = {
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(20_000),
  category: z.string().trim().min(2).max(80),
  difficulty: difficultySchema,
  challengeType: challengeTypeSchema,
  verificationType: z.enum(["automated_test", "rule_based", "admin_review", "peer_review"]),
  pointsReward: z.number().int().min(1).max(10_000),
  mstReward: z.number().int().min(0).max(1_000_000),
  maxAttempts: z.number().int().min(1).max(100).nullable(),
  githubIssueId: z.uuid().nullable(),
  status: z.enum(["draft", "published", "archived"]),
  challengeConfig: challengeConfigSchema,
};

/** `securityCategory` is accepted as an alias of `category` (frontend draft naming). */
const aliasCategory = (v: unknown) => {
  if (v && typeof v === "object" && "securityCategory" in v && !("category" in v)) {
    const { securityCategory, ...rest } = v as Record<string, unknown>;
    return { ...rest, category: securityCategory };
  }
  return v;
};

export const createChallengeSchema = z.preprocess(aliasCategory, z.object({
  ...challengeFields,
  pointsReward: challengeFields.pointsReward.optional(),
  maxAttempts: challengeFields.maxAttempts.optional(),
  githubIssueId: challengeFields.githubIssueId.optional(),
  status: z.enum(["draft", "published"]).default("draft"),
  challengeConfig: challengeConfigSchema.default({}),
}).strict());

export const updateChallengeSchema = z.preprocess(aliasCategory, z.object(challengeFields).partial().strict()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field"));

/** Fields that decide scoring; frozen once participants have submitted. */
const LOCKED_AFTER_SUBMISSIONS = ["difficulty", "challengeType", "verificationType", "pointsReward", "mstReward"] as const;

function validateForPublish(c: { verificationType: string; challengeType: string; challengeConfig: ChallengeConfig }) {
  const qs = c.challengeConfig.questions ?? [];
  const ids = new Set<string>();
  for (const q of qs) {
    if (ids.has(q.id)) throw badRequest("INVALID_CHALLENGE_CONFIG", `Duplicate question id ${q.id}`);
    ids.add(q.id);
    if (q.type === "multiple_choice") {
      if (!q.options || q.options.length < 2) throw badRequest("INVALID_CHALLENGE_CONFIG", `Question ${q.id} needs at least two options`);
      if (q.correctAnswer && !q.options.some((o) => o.id === q.correctAnswer)) {
        throw badRequest("INVALID_CHALLENGE_CONFIG", `Question ${q.id} correctAnswer is not one of its options`);
      }
    }
  }
  if (c.verificationType === "rule_based") {
    if (c.challengeType !== "investigation") throw badRequest("INVALID_CHALLENGE_CONFIG", "Rule-based verification is supported for investigation challenges");
    if (qs.length === 0) throw badRequest("INVALID_CHALLENGE_CONFIG", "Rule-based challenges need questions with answer keys");
    for (const q of qs) {
      const keyed = q.type === "multiple_choice" ? Boolean(q.correctAnswer) : Boolean(c.challengeConfig.acceptedAnswers?.[q.id]?.length);
      if (!keyed) throw badRequest("INVALID_CHALLENGE_CONFIG", `Question ${q.id} has no answer key for rule-based verification`);
    }
  }
}

export const activityQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });
export const orgSubmissionsQuerySchema = paginationSchema.extend({
  status: z.enum(["pending", "verified", "rejected"]).optional(),
  challengeId: z.uuid().optional(),
});
export const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(3).max(2000),
}).strict();

export class OrgService {
  constructor(private readonly deps: ServiceDeps, private readonly verification: VerificationService) {}

  /**
   * Funding gate for publishing. Rewards are paid from the platform RewardVault, so by default no organization
   * deposit is required (MST_ORG_MIN_FUNDING=0). A positive minimum reports PAYMENT_REQUIRED because
   * per-organization deposits are not tracked yet.
   */
  mstStatus() {
    const minimumRequired = this.deps.config.orgMinFunding;
    return {
      minimumRequired,
      amountPaid: 0,
      paymentStatus: minimumRequired <= 0 ? "READY_TO_PUBLISH" : "PAYMENT_REQUIRED",
      fundingSource: "platform_vault",
      blockchain: this.deps.blockchain.status(),
    };
  }

  async stats(organizationId: string) {
    const { db } = this.deps;
    const [ch] = await db.select({
      total: count(),
      active: sql<number>`count(*) FILTER (WHERE ${challenges.status} = 'published')::int`,
      drafts: sql<number>`count(*) FILTER (WHERE ${challenges.status} = 'draft')::int`,
    }).from(challenges).where(eq(challenges.organizationId, organizationId));
    const [sub] = await db.select({
      total: count(),
      verified: sql<number>`count(*) FILTER (WHERE ${submissions.status} = 'verified')::int`,
      pending: sql<number>`count(*) FILTER (WHERE ${submissions.status} = 'pending')::int`,
      participants: sql<number>`count(DISTINCT ${submissions.userId})::int`,
    }).from(submissions).innerJoin(challenges, eq(challenges.id, submissions.challengeId))
      .where(eq(challenges.organizationId, organizationId));
    const [rw] = await db.select({
      distributed: sql<number>`coalesce(sum(${rewards.amount}) FILTER (WHERE ${rewards.status} = 'confirmed'), 0)::int`,
      inFlight: sql<number>`coalesce(sum(${rewards.amount}) FILTER (WHERE ${rewards.status} IN ('pending', 'submitted')), 0)::int`,
    }).from(rewards).where(eq(rewards.organizationId, organizationId));
    return {
      activeChallenges: Number(ch?.active ?? 0),
      totalChallenges: Number(ch?.total ?? 0),
      draftChallenges: Number(ch?.drafts ?? 0),
      totalSubmissions: Number(sub?.total ?? 0),
      verifiedSolutions: Number(sub?.verified ?? 0),
      pendingReviews: Number(sub?.pending ?? 0),
      uniqueParticipants: Number(sub?.participants ?? 0),
      mstDistributed: Number(rw?.distributed ?? 0),
      mstPending: Number(rw?.inFlight ?? 0),
    };
  }

  async activity(organizationId: string, rawQuery: unknown) {
    const { limit } = parse(activityQuerySchema, rawQuery);
    const rows = await this.deps.db.select({ s: submissions, c: challenges, u: users, v: verifications }).from(submissions)
      .innerJoin(challenges, eq(challenges.id, submissions.challengeId))
      .innerJoin(users, eq(users.id, submissions.userId))
      .leftJoin(verifications, eq(verifications.submissionId, submissions.id))
      .where(eq(challenges.organizationId, organizationId))
      .orderBy(desc(submissions.submittedAt)).limit(limit);
    return rows.map(({ s, c, u, v }) => ({
      type: "submission",
      submissionId: s.id,
      challengeId: c.id,
      challengeTitle: c.title,
      participant: { id: u.id, username: u.username, displayName: u.displayName },
      status: SUBMISSION_STATUS_LABEL[s.status],
      verificationStatus: v?.status ?? "pending",
      submittedAt: iso(s.submittedAt),
      verifiedAt: iso(v?.verifiedAt),
    }));
  }

  private orgChallengeDto(
    c: typeof challenges.$inferSelect, role: OrgRole, counts?: { submissions: number; verified: number; attempts: number },
    github?: { repositoryId: string | null; repository: string | null; issueNumber: number | null; issueTitle: string | null } | null,
  ) {
    const full = ROLE_RANK[role] >= ROLE_RANK.admin;
    return {
      id: c.id,
      organizationId: c.organizationId,
      title: c.title,
      description: c.description,
      category: c.category,
      difficulty: DIFFICULTY_LABEL[c.difficulty],
      challengeType: CHALLENGE_TYPE_LABEL[c.challengeType],
      verificationType: c.verificationType,
      pointsReward: c.pointsReward,
      mstReward: c.mstReward,
      maxAttempts: c.maxAttempts,
      githubIssueId: c.githubIssueId,
      githubRepositoryId: github?.repositoryId ?? null,
      githubRepository: github?.repository ?? null,
      githubIssueNumber: github?.issueNumber ?? null,
      githubIssueTitle: github?.issueTitle ?? null,
      status: c.status,
      challengeConfig: full ? readConfig(c.challengeConfig) : publicConfig(c.challengeConfig),
      ...(counts ?? {}),
      createdAt: iso(c.createdAt),
      updatedAt: iso(c.updatedAt),
    };
  }

  async listChallenges(organizationId: string, role: OrgRole, rawQuery: unknown) {
    const q = parse(paginationSchema.extend({ status: z.enum(["draft", "published", "archived"]).optional() }), rawQuery);
    const where = and(eq(challenges.organizationId, organizationId), q.status ? eq(challenges.status, q.status) : undefined);
    const [{ total } = { total: 0 }] = await this.deps.db.select({ total: count() }).from(challenges).where(where);
    const rows = await this.deps.db.select({
      c: challenges,
      submissions: sql<number>`(SELECT count(*)::int FROM ${submissions} s WHERE s.challenge_id = ${ref(challenges.id)})`,
      verified: sql<number>`(SELECT count(*)::int FROM ${submissions} s WHERE s.challenge_id = ${ref(challenges.id)} AND s.status = 'verified')`,
      attempts: sql<number>`(SELECT count(*)::int FROM ${challengeAttempts} a WHERE a.challenge_id = ${ref(challenges.id)})`,
      github: { repositoryId: repositories.id, repository: repositories.fullName, issueNumber: githubIssues.issueNumber, issueTitle: githubIssues.title },
    }).from(challenges)
      .leftJoin(githubIssues, eq(githubIssues.id, challenges.githubIssueId))
      .leftJoin(repositories, eq(repositories.id, githubIssues.repositoryId))
      .where(where).orderBy(desc(challenges.createdAt)).limit(q.limit).offset(offsetOf(q));
    return paginated(rows.map((r) => this.orgChallengeDto(r.c, role, {
      submissions: Number(r.submissions), verified: Number(r.verified), attempts: Number(r.attempts),
    }, r.github)), Number(total), q);
  }

  /** One challenge of this organization (any status), with everything the edit form needs. */
  async getChallenge(organizationId: string, role: OrgRole, challengeId: string) {
    if (!z.uuid().safeParse(challengeId).success) throw notFound("Challenge");
    const [row] = await this.deps.db.select({
      c: challenges,
      submissions: sql<number>`(SELECT count(*)::int FROM ${submissions} s WHERE s.challenge_id = ${ref(challenges.id)})`,
      verified: sql<number>`(SELECT count(*)::int FROM ${submissions} s WHERE s.challenge_id = ${ref(challenges.id)} AND s.status = 'verified')`,
      attempts: sql<number>`(SELECT count(*)::int FROM ${challengeAttempts} a WHERE a.challenge_id = ${ref(challenges.id)})`,
      github: { repositoryId: repositories.id, repository: repositories.fullName, issueNumber: githubIssues.issueNumber, issueTitle: githubIssues.title },
    }).from(challenges)
      .leftJoin(githubIssues, eq(githubIssues.id, challenges.githubIssueId))
      .leftJoin(repositories, eq(repositories.id, githubIssues.repositoryId))
      .where(and(eq(challenges.id, challengeId), eq(challenges.organizationId, organizationId))).limit(1);
    if (!row) throw notFound("Challenge");
    return this.orgChallengeDto(row.c, role, { submissions: Number(row.submissions), verified: Number(row.verified), attempts: Number(row.attempts) }, row.github);
  }

  private async assertIssueInOrg(organizationId: string, githubIssueId: string, db: DbOrTx = this.deps.db) {
    const [row] = await db.select({ id: githubIssues.id }).from(githubIssues)
      .innerJoin(repositories, eq(repositories.id, githubIssues.repositoryId))
      .innerJoin(githubOrganizations, eq(githubOrganizations.id, repositories.githubOrganizationId))
      .where(and(eq(githubIssues.id, githubIssueId), eq(githubOrganizations.organizationId, organizationId))).limit(1);
    if (!row) throw badRequest("INVALID_GITHUB_ISSUE", "GitHub issue is not synchronized for this organization");
  }

  async createChallenge(organizationId: string, role: OrgRole, body: unknown) {
    const input = parse(createChallengeSchema, body);
    if (input.githubIssueId) await this.assertIssueInOrg(organizationId, input.githubIssueId);
    validateForPublish({ verificationType: input.verificationType, challengeType: input.challengeType, challengeConfig: input.challengeConfig });
    const now = this.deps.now();
    const [c] = await this.deps.db.insert(challenges).values({
      organizationId,
      githubIssueId: input.githubIssueId ?? null,
      title: input.title,
      description: input.description,
      category: input.category,
      difficulty: input.difficulty,
      challengeType: input.challengeType,
      verificationType: input.verificationType,
      pointsReward: input.pointsReward ?? DEFAULT_POINTS_BY_DIFFICULTY[input.difficulty],
      mstReward: input.mstReward,
      maxAttempts: input.maxAttempts ?? null,
      challengeConfig: input.challengeConfig,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return this.getChallenge(organizationId, role, c!.id);
  }

  async updateChallenge(organizationId: string, role: OrgRole, challengeId: string, body: unknown) {
    if (!z.uuid().safeParse(challengeId).success) throw notFound("Challenge");
    const input = parse(updateChallengeSchema, body);
    await this.deps.db.transaction(async (tx) => {
      const [current] = await tx.select().from(challenges)
        .where(and(eq(challenges.id, challengeId), eq(challenges.organizationId, organizationId))).for("update");
      if (!current) throw notFound("Challenge");
      const [subs] = await tx.select({ n: count() }).from(submissions).where(eq(submissions.challengeId, challengeId));
      if (Number(subs?.n ?? 0) > 0) {
        const locked = LOCKED_AFTER_SUBMISSIONS.filter((k) => input[k] !== undefined && input[k] !== current[k]);
        const current_ = readConfig(current.challengeConfig);
        const next_ = input.challengeConfig;
        const gradingChanged = next_ && JSON.stringify([next_.questions, next_.acceptedAnswers, next_.passingScore]) !==
          JSON.stringify([current_.questions, current_.acceptedAnswers, current_.passingScore]);
        if (locked.length || gradingChanged) {
          throw conflict("CHALLENGE_LOCKED", `Cannot change ${[...locked, ...(gradingChanged ? ["grading configuration"] : [])].join(", ")} after submissions exist`);
        }
      }
      if (input.githubIssueId) await this.assertIssueInOrg(organizationId, input.githubIssueId, tx);
      const merged = {
        verificationType: input.verificationType ?? current.verificationType,
        challengeType: input.challengeType ?? current.challengeType,
        challengeConfig: input.challengeConfig ?? readConfig(current.challengeConfig),
      };
      validateForPublish(merged);
      await tx.update(challenges).set({ ...input, updatedAt: this.deps.now() }).where(eq(challenges.id, challengeId));
    });
    return this.getChallenge(organizationId, role, challengeId);
  }

  async listSubmissions(organizationId: string, rawQuery: unknown) {
    const q = parse(orgSubmissionsQuerySchema, rawQuery);
    const conditions: SQL[] = [eq(challenges.organizationId, organizationId)];
    if (q.status) conditions.push(eq(submissions.status, q.status));
    if (q.challengeId) conditions.push(eq(submissions.challengeId, q.challengeId));
    const where = and(...conditions);
    const [{ total } = { total: 0 }] = await this.deps.db.select({ total: count() }).from(submissions)
      .innerJoin(challenges, eq(challenges.id, submissions.challengeId)).where(where);
    const rows = await this.deps.db.select({ s: submissions, c: challenges, u: users, v: verifications }).from(submissions)
      .innerJoin(challenges, eq(challenges.id, submissions.challengeId))
      .innerJoin(users, eq(users.id, submissions.userId))
      .leftJoin(verifications, eq(verifications.submissionId, submissions.id))
      .where(where).orderBy(desc(submissions.submittedAt)).limit(q.limit).offset(offsetOf(q));
    return paginated(rows.map(({ s, c, u, v }) => ({
      submissionId: s.id, attemptId: s.attemptId, challengeId: c.id, challengeTitle: c.title,
      participant: { id: u.id, username: u.username, displayName: u.displayName },
      submissionType: s.submissionType, submissionData: s.submissionData, status: SUBMISSION_STATUS_LABEL[s.status],
      verificationType: v?.verificationType ?? c.verificationType, verificationStatus: v?.status ?? "pending",
      reason: v?.reason ?? null, submittedAt: iso(s.submittedAt), verifiedAt: iso(v?.verifiedAt),
    })), Number(total), q);
  }

  async review(organizationId: string, reviewerId: string, submissionId: string, body: unknown) {
    if (!z.uuid().safeParse(submissionId).success) throw notFound("Submission");
    const input = parse(reviewSchema, body);
    const [row] = await this.deps.db.select({ id: submissions.id }).from(submissions)
      .innerJoin(challenges, eq(challenges.id, submissions.challengeId))
      .where(and(eq(submissions.id, submissionId), eq(challenges.organizationId, organizationId))).limit(1);
    if (!row) throw notFound("Submission");
    return this.verification.review(submissionId, reviewerId, input.decision, input.reason);
  }

}
