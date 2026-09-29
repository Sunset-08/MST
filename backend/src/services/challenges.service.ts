import { and, count, desc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import { ref } from "../utils/sql.js";
import { z } from "zod";
import { challengeAttempts, challenges, githubIssues, organizations, repositories, submissions, users } from "../db/schema.js";
import type { Tx } from "../db/index.js";
import { DEFAULT_RULE_BASED_MAX_ATTEMPTS, publicConfig, readConfig } from "../verification/challenge-config.js";
import { iso } from "../utils/dates.js";
import { badRequest, conflict, forbidden, notFound, parse } from "../utils/http.js";
import { CHALLENGE_TYPE_LABEL, DIFFICULTY_LABEL, fromLabel, PARTICIPANT_STATUSES, type ParticipantChallengeStatus } from "../utils/labels.js";
import { likePattern, offsetOf, paginated, paginationSchema } from "../utils/pagination.js";
import { findMembership } from "../middleware/auth.js";
import type { ServiceDeps } from "./deps.js";

export const challengeListQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  difficulty: z.string().trim().max(20).optional(),
  category: z.string().trim().max(80).optional(),
  status: z.string().trim().max(20).optional(),
});

type ChallengeRow = typeof challenges.$inferSelect;

/** Per-participant status computed in SQL so it can be filtered and paginated. */
export function participantStatusSql(userId: string | undefined): SQL<string> {
  if (!userId) return sql<string>`'Not Started'`;
  return sql<string>`CASE
    WHEN EXISTS (SELECT 1 FROM ${submissions} s WHERE s.challenge_id = ${ref(challenges.id)} AND s.user_id = ${userId} AND s.status = 'verified') THEN 'Verified'
    WHEN EXISTS (SELECT 1 FROM ${submissions} s WHERE s.challenge_id = ${ref(challenges.id)} AND s.user_id = ${userId} AND s.status = 'pending')
      THEN CASE WHEN ${challenges.verificationType} IN ('admin_review', 'peer_review') THEN 'Under Review' ELSE 'Submitted' END
    WHEN EXISTS (SELECT 1 FROM ${challengeAttempts} a WHERE a.challenge_id = ${ref(challenges.id)} AND a.user_id = ${userId} AND a.status = 'started') THEN 'Attempted'
    WHEN EXISTS (SELECT 1 FROM ${challengeAttempts} a WHERE a.challenge_id = ${ref(challenges.id)} AND a.user_id = ${userId} AND a.status IN ('failed', 'expired')) THEN 'Failed'
    ELSE 'Not Started' END`;
}

const attemptsCountSql = sql<number>`(SELECT count(*)::int FROM ${challengeAttempts} a WHERE a.challenge_id = ${ref(challenges.id)})`;
const solvedCountSql = sql<number>`(SELECT count(DISTINCT s.user_id)::int FROM ${submissions} s WHERE s.challenge_id = ${ref(challenges.id)} AND s.status = 'verified')`;

export function effectiveMaxAttempts(challenge: ChallengeRow): number | null {
  if (challenge.maxAttempts) return challenge.maxAttempts;
  return challenge.verificationType === "rule_based" ? DEFAULT_RULE_BASED_MAX_ATTEMPTS : null;
}

export function isExpired(challenge: ChallengeRow, now: Date): boolean {
  const expiresAt = readConfig(challenge.challengeConfig).expiresAt;
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= now.getTime());
}

const shortOf = (challenge: ChallengeRow) => {
  const configured = readConfig(challenge.challengeConfig).shortDescription;
  if (configured) return configured;
  const text = challenge.description.replace(/\s+/g, " ").trim();
  return text.length <= 160 ? text : `${text.slice(0, 157).trimEnd()}...`;
};

export class ChallengesService {
  constructor(private readonly deps: ServiceDeps) {}

  private baseSelect(userId?: string) {
    return {
      challenge: challenges,
      organization: { id: organizations.id, name: organizations.name, slug: organizations.slug },
      repo: { fullName: repositories.fullName, url: repositories.url },
      issue: { number: githubIssues.issueNumber, url: githubIssues.url, state: githubIssues.state },
      attempts: attemptsCountSql,
      solved: solvedCountSql,
      participantStatus: participantStatusSql(userId),
    };
  }

  private toDto(row: Awaited<ReturnType<ChallengesService["listRows"]>>[number], authenticated: boolean, detail = false) {
    const c = row.challenge;
    const pub = publicConfig(c.challengeConfig);
    const now = this.deps.now();
    return {
      id: c.id,
      title: c.title,
      shortDescription: shortOf(c),
      description: c.description,
      category: c.category,
      difficulty: DIFFICULTY_LABEL[c.difficulty],
      type: CHALLENGE_TYPE_LABEL[c.challengeType],
      challengeType: CHALLENGE_TYPE_LABEL[c.challengeType],
      verificationType: c.verificationType,
      pointsReward: c.pointsReward,
      mstReward: c.mstReward,
      maxAttempts: effectiveMaxAttempts(c),
      githubRepo: row.repo?.fullName ?? undefined,
      githubRepoUrl: row.repo?.url ?? undefined,
      githubIssueNumber: row.issue?.number ?? undefined,
      githubIssueUrl: row.issue?.url ?? undefined,
      attempts: Number(row.attempts),
      solved: Number(row.solved),
      tags: pub.tags,
      expiresAt: pub.expiresAt,
      isOpen: !isExpired(c, now),
      organization: row.organization,
      status: authenticated ? (row.participantStatus as ParticipantChallengeStatus) : undefined,
      ...(detail ? { questions: pub.questions } : {}),
      createdAt: iso(c.createdAt),
      updatedAt: iso(c.updatedAt),
    };
  }

  private listRows(where: SQL | undefined, userId: string | undefined, limit: number, offset: number) {
    return this.deps.db.select(this.baseSelect(userId)).from(challenges)
      .innerJoin(organizations, eq(organizations.id, challenges.organizationId))
      .leftJoin(githubIssues, eq(githubIssues.id, challenges.githubIssueId))
      .leftJoin(repositories, eq(repositories.id, githubIssues.repositoryId))
      .where(where)
      .orderBy(desc(challenges.createdAt), desc(challenges.id))
      .limit(limit).offset(offset);
  }

  async list(rawQuery: unknown, userId?: string) {
    const q = parse(challengeListQuerySchema, rawQuery);
    const conditions: SQL[] = [eq(challenges.status, "published"), ne(organizations.status, "deleted")];
    if (q.search) {
      const p = likePattern(q.search);
      conditions.push(or(ilike(challenges.title, p), ilike(challenges.description, p), ilike(challenges.category, p))!);
    }
    if (q.difficulty && q.difficulty !== "All") {
      const d = fromLabel(DIFFICULTY_LABEL, q.difficulty);
      if (!d) throw badRequest("INVALID_FILTER", "Unknown difficulty");
      conditions.push(eq(challenges.difficulty, d));
    }
    if (q.category && q.category !== "All") conditions.push(sql`lower(${challenges.category}) = lower(${q.category})`);
    if (q.status && q.status !== "All") {
      const status = PARTICIPANT_STATUSES.find((s) => s.toLowerCase() === q.status!.toLowerCase());
      if (!status) throw badRequest("INVALID_FILTER", "Unknown status");
      conditions.push(sql`${participantStatusSql(userId)} = ${status}`);
    }
    const where = and(...conditions);
    const [{ total } = { total: 0 }] = await this.deps.db.select({ total: count() }).from(challenges)
      .innerJoin(organizations, eq(organizations.id, challenges.organizationId)).where(where);
    const rows = await this.listRows(where, userId, q.limit, offsetOf(q));
    return paginated(rows.map((r) => this.toDto(r, Boolean(userId))), Number(total), q);
  }

  async get(id: string, userId?: string) {
    if (!z.uuid().safeParse(id).success) throw notFound("Challenge");
    const [row] = await this.listRows(
      and(eq(challenges.id, id), eq(challenges.status, "published"), ne(organizations.status, "deleted")), userId, 1, 0);
    if (!row) throw notFound("Challenge");
    return this.toDto(row, Boolean(userId), true);
  }

  /** Locks the participant row so concurrent start/submit requests for one user are serialized. */
  static async lockUser(tx: Tx, userId: string) {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
  }

  async start(challengeId: string, user: { id: string; githubUsername?: string | null }) {
    if (!z.uuid().safeParse(challengeId).success) throw notFound("Challenge");
    if (this.deps.config.requireGithubConnection && !user.githubUsername) {
      throw forbidden("Connect your GitHub account before starting challenges", "GITHUB_CONNECTION_REQUIRED");
    }
    const now = this.deps.now();
    const { db } = this.deps;
    const [row] = await db.select({ challenge: challenges, orgStatus: organizations.status }).from(challenges)
      .innerJoin(organizations, eq(organizations.id, challenges.organizationId))
      .where(eq(challenges.id, challengeId)).limit(1);
    if (!row || row.challenge.status !== "published" || row.orgStatus === "deleted") throw notFound("Challenge");
    const challenge = row.challenge;
    if (isExpired(challenge, now)) throw conflict("CHALLENGE_EXPIRED", "This challenge is no longer accepting attempts");
    if (await findMembership(db, challenge.organizationId, user.id)) {
      throw forbidden("Members of the publishing organization cannot attempt its challenges", "ORG_MEMBER_CANNOT_ATTEMPT");
    }

    return db.transaction(async (tx) => {
      await ChallengesService.lockUser(tx, user.id);
      const attempts = await tx.select().from(challengeAttempts)
        .where(and(eq(challengeAttempts.challengeId, challengeId), eq(challengeAttempts.userId, user.id)))
        .orderBy(desc(challengeAttempts.startedAt));
      if (attempts.some((a) => a.status === "verified")) throw conflict("CHALLENGE_ALREADY_SOLVED", "You have already solved this challenge");
      const active = attempts.find((a) => a.status === "started");
      if (active) return { created: false, attempt: this.attemptDto(active, challenge) };
      if (attempts.some((a) => a.status === "submitted")) {
        throw conflict("SUBMISSION_PENDING", "Your previous submission is still being verified");
      }
      const max = effectiveMaxAttempts(challenge);
      if (max !== null && attempts.length >= max) throw conflict("MAX_ATTEMPTS_REACHED", `Maximum of ${max} attempts reached`);
      const [attempt] = await tx.insert(challengeAttempts).values({
        challengeId, userId: user.id, status: "started", attemptCount: attempts.length + 1, startedAt: now,
      }).returning();
      return { created: true, attempt: this.attemptDto(attempt!, challenge) };
    });
  }

  attemptDto(a: typeof challengeAttempts.$inferSelect, challenge: ChallengeRow) {
    const statusLabel = { started: "Attempted", submitted: "Submitted", verified: "Verified", failed: "Failed", expired: "Failed" } as const;
    const max = effectiveMaxAttempts(challenge);
    return {
      id: a.id,
      attemptId: a.id,
      challengeId: a.challengeId,
      participantId: a.userId,
      status: statusLabel[a.status],
      attemptNumber: a.attemptCount,
      maxAttempts: max,
      attemptsRemaining: max === null ? null : Math.max(0, max - a.attemptCount),
      startedAt: iso(a.startedAt),
      completedAt: iso(a.completedAt),
    };
  }
}
