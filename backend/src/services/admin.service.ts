import { and, count, desc, eq, gte, ilike, or, sql, type SQL } from "drizzle-orm";
import { ref } from "../utils/sql.js";
import { z } from "zod";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { challenges, organizationMembers, organizations, rewards, submissions, users, verifications } from "../db/schema.js";
import { safeConfigReport } from "../config/env.js";
import type { GitHubService } from "../integrations/github/github.service.js";
import type { VerificationService } from "../verification/engine.js";
import { iso } from "../utils/dates.js";
import { notFound, parse } from "../utils/http.js";
import { CHALLENGE_TYPE_LABEL, DIFFICULTY_LABEL, REWARD_STATUS_LABEL, SUBMISSION_STATUS_LABEL } from "../utils/labels.js";
import { likePattern, offsetOf, paginated, paginationSchema } from "../utils/pagination.js";
import { levelInfo } from "./gamification.rules.js";
import type { RewardsService } from "./rewards.service.js";
import { reviewSchema } from "./org.service.js";
import type { ServiceDeps } from "./deps.js";

const search = z.string().trim().max(100).optional();

export class AdminService {
  constructor(
    private readonly deps: ServiceDeps,
    private readonly verification: VerificationService,
    private readonly rewardsService: RewardsService,
    private readonly github: GitHubService,
  ) {}

  private async dailySeries(days: number) {
    const since = new Date(this.deps.now().getTime() - (days - 1) * 86_400_000);
    since.setUTCHours(0, 0, 0, 0);
    const day = (col: SQL | AnyPgColumn) => sql<string>`to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
    const [regs, subs, verified, rw] = await Promise.all([
      this.deps.db.select({ day: day(users.createdAt), n: count() }).from(users).where(gte(users.createdAt, since)).groupBy(sql`1`),
      this.deps.db.select({ day: day(submissions.submittedAt), n: count() }).from(submissions).where(gte(submissions.submittedAt, since)).groupBy(sql`1`),
      this.deps.db.select({ day: day(verifications.verifiedAt), n: count() }).from(verifications)
        .where(and(eq(verifications.status, "passed"), gte(verifications.verifiedAt, since))).groupBy(sql`1`),
      this.deps.db.select({ day: day(rewards.paidAt), n: sql<number>`coalesce(sum(${rewards.amount}), 0)::int` }).from(rewards)
        .where(and(eq(rewards.status, "confirmed"), gte(rewards.paidAt, since))).groupBy(sql`1`),
    ]);
    const map = (rows: { day: string; n: number }[]) => new Map(rows.map((r) => [r.day, Number(r.n)]));
    const [mr, ms, mv, mw] = [map(regs), map(subs), map(verified), map(rw)];
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      return { date: d, registrations: mr.get(d) ?? 0, submissions: ms.get(d) ?? 0, verified: mv.get(d) ?? 0, mstDistributed: mw.get(d) ?? 0 };
    });
  }

  async dashboard() {
    const { db } = this.deps;
    const [[u], [o], [c], [s], [r]] = await Promise.all([
      db.select({ n: count() }).from(users),
      db.select({ n: count() }).from(organizations).where(sql`${organizations.status} <> 'deleted'`),
      db.select({ n: count(), published: sql<number>`count(*) FILTER (WHERE ${challenges.status} = 'published')::int` }).from(challenges),
      db.select({
        n: count(),
        pending: sql<number>`count(*) FILTER (WHERE ${submissions.status} = 'pending')::int`,
        verified: sql<number>`count(*) FILTER (WHERE ${submissions.status} = 'verified')::int`,
      }).from(submissions),
      db.select({ distributed: sql<number>`coalesce(sum(${rewards.amount}) FILTER (WHERE ${rewards.status} = 'confirmed'), 0)::int` }).from(rewards),
    ]);
    const total = Number(s?.n ?? 0);
    const verified = Number(s?.verified ?? 0);
    return {
      totalUsers: Number(u?.n ?? 0),
      organizations: Number(o?.n ?? 0),
      challenges: Number(c?.n ?? 0),
      publishedChallenges: Number(c?.published ?? 0),
      totalSubmissions: total,
      pendingReviews: Number(s?.pending ?? 0),
      verifiedSubmissions: verified,
      totalMstDistributed: Number(r?.distributed ?? 0),
      /** Share of submissions that were verified (0-100). */
      submissionRate: total === 0 ? 0 : Math.round((verified / total) * 1000) / 10,
      recentActivity: await this.dailySeries(7),
    };
  }

  async users(rawQuery: unknown) {
    const q = parse(paginationSchema.extend({ search, role: z.enum(["participant", "platform_admin"]).optional() }), rawQuery);
    const where = and(
      q.search ? or(ilike(users.username, likePattern(q.search)), ilike(users.displayName, likePattern(q.search)), ilike(users.email, likePattern(q.search))) : undefined,
      q.role ? eq(users.role, q.role) : undefined,
    );
    const [{ total } = { total: 0 }] = await this.deps.db.select({ total: count() }).from(users).where(where);
    const rows = await this.deps.db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(q.limit).offset(offsetOf(q));
    return paginated(rows.map((u) => ({
      id: u.id, username: u.username, displayName: u.displayName, email: u.email, role: u.role, points: u.points,
      reputation: u.reputation, level: levelInfo(u.points).level, currentStreak: u.currentStreak, longestStreak: u.longestStreak,
      lastActivityAt: iso(u.lastActivityAt), createdAt: iso(u.createdAt),
    })), Number(total), q);
  }

  async organizations(rawQuery: unknown) {
    const q = parse(paginationSchema.extend({ search, status: z.string().trim().max(20).optional() }), rawQuery);
    const where = and(
      q.search ? or(ilike(organizations.name, likePattern(q.search)), ilike(organizations.slug, likePattern(q.search))) : undefined,
      q.status ? eq(organizations.status, q.status) : undefined,
    );
    const [{ total } = { total: 0 }] = await this.deps.db.select({ total: count() }).from(organizations).where(where);
    const rows = await this.deps.db.select({
      o: organizations,
      members: sql<number>`(SELECT count(*)::int FROM ${organizationMembers} m WHERE m.organization_id = ${ref(organizations.id)})`,
      challenges: sql<number>`(SELECT count(*)::int FROM ${challenges} c WHERE c.organization_id = ${ref(organizations.id)})`,
    }).from(organizations).where(where).orderBy(desc(organizations.createdAt)).limit(q.limit).offset(offsetOf(q));
    return paginated(rows.map(({ o, members, challenges: ch }) => ({
      id: o.id, name: o.name, slug: o.slug, status: o.status, website: o.website, members: Number(members), challenges: Number(ch), createdAt: iso(o.createdAt),
    })), Number(total), q);
  }

  async challenges(rawQuery: unknown) {
    const q = parse(paginationSchema.extend({ search, status: z.enum(["draft", "published", "archived"]).optional(), organizationId: z.uuid().optional() }), rawQuery);
    const where = and(
      q.search ? or(ilike(challenges.title, likePattern(q.search)), ilike(challenges.category, likePattern(q.search))) : undefined,
      q.status ? eq(challenges.status, q.status) : undefined,
      q.organizationId ? eq(challenges.organizationId, q.organizationId) : undefined,
    );
    const [{ total } = { total: 0 }] = await this.deps.db.select({ total: count() }).from(challenges).where(where);
    const rows = await this.deps.db.select({ c: challenges, org: organizations.name,
      submissions: sql<number>`(SELECT count(*)::int FROM ${submissions} s WHERE s.challenge_id = ${ref(challenges.id)})` })
      .from(challenges).innerJoin(organizations, eq(organizations.id, challenges.organizationId))
      .where(where).orderBy(desc(challenges.createdAt)).limit(q.limit).offset(offsetOf(q));
    return paginated(rows.map(({ c, org, submissions: n }) => ({
      id: c.id, title: c.title, organizationId: c.organizationId, organization: org, category: c.category,
      difficulty: DIFFICULTY_LABEL[c.difficulty], challengeType: CHALLENGE_TYPE_LABEL[c.challengeType], verificationType: c.verificationType,
      pointsReward: c.pointsReward, mstReward: c.mstReward, status: c.status, submissions: Number(n), createdAt: iso(c.createdAt),
    })), Number(total), q);
  }

  async submissions(rawQuery: unknown) {
    const q = parse(paginationSchema.extend({ status: z.enum(["pending", "verified", "rejected"]).optional(), challengeId: z.uuid().optional() }), rawQuery);
    const where = and(q.status ? eq(submissions.status, q.status) : undefined, q.challengeId ? eq(submissions.challengeId, q.challengeId) : undefined);
    const [{ total } = { total: 0 }] = await this.deps.db.select({ total: count() }).from(submissions).where(where);
    const rows = await this.deps.db.select({ s: submissions, c: challenges, u: users, v: verifications }).from(submissions)
      .innerJoin(challenges, eq(challenges.id, submissions.challengeId))
      .innerJoin(users, eq(users.id, submissions.userId))
      .leftJoin(verifications, eq(verifications.submissionId, submissions.id))
      .where(where).orderBy(desc(submissions.submittedAt)).limit(q.limit).offset(offsetOf(q));
    return paginated(rows.map(({ s, c, u, v }) => ({
      submissionId: s.id, challengeId: c.id, challengeTitle: c.title, organizationId: c.organizationId,
      participant: { id: u.id, username: u.username }, submissionType: s.submissionType, submissionData: s.submissionData,
      status: SUBMISSION_STATUS_LABEL[s.status], verificationType: v?.verificationType ?? c.verificationType,
      verificationStatus: v?.status ?? "pending", reason: v?.reason ?? null, submittedAt: iso(s.submittedAt), verifiedAt: iso(v?.verifiedAt),
    })), Number(total), q);
  }

  async reviewSubmission(reviewerId: string, submissionId: string, body: unknown) {
    if (!z.uuid().safeParse(submissionId).success) throw notFound("Submission");
    const input = parse(reviewSchema, body);
    return this.verification.review(submissionId, reviewerId, input.decision, input.reason);
  }

  async rewards(rawQuery: unknown) {
    const q = parse(paginationSchema.extend({ status: z.enum(["pending", "submitted", "confirmed", "failed"]).optional() }), rawQuery);
    const where = q.status ? eq(rewards.status, q.status) : undefined;
    const [{ total } = { total: 0 }] = await this.deps.db.select({ total: count() }).from(rewards).where(where);
    const rows = await this.deps.db.select({ r: rewards, title: challenges.title, username: users.username }).from(rewards)
      .innerJoin(challenges, eq(challenges.id, rewards.challengeId)).innerJoin(users, eq(users.id, rewards.userId))
      .where(where).orderBy(desc(rewards.createdAt)).limit(q.limit).offset(offsetOf(q));
    return {
      ...paginated(rows.map(({ r, title, username }) => ({ ...this.rewardsService.toDto(r, title), username, rawStatus: r.status })), Number(total), q),
      blockchain: this.rewardsService.blockchainStatus(),
    };
  }

  processRewards() {
    return this.rewardsService.processPending();
  }

  refreshReward(rewardId: string) {
    return this.rewardsService.refresh(rewardId);
  }

  githubOverview() {
    return this.github.adminOverview();
  }

  async analytics(rawQuery: unknown) {
    const { days } = parse(z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }), rawQuery);
    const byDifficulty = await this.deps.db.select({ difficulty: challenges.difficulty, n: count() }).from(submissions)
      .innerJoin(challenges, eq(challenges.id, submissions.challengeId)).where(eq(submissions.status, "verified")).groupBy(challenges.difficulty);
    const byCategory = await this.deps.db.select({ category: challenges.category, n: count() }).from(submissions)
      .innerJoin(challenges, eq(challenges.id, submissions.challengeId)).where(eq(submissions.status, "verified"))
      .groupBy(challenges.category).orderBy(desc(count())).limit(20);
    const rewardStatus = await this.deps.db.select({ status: rewards.status, n: count(), amount: sql<number>`coalesce(sum(${rewards.amount}),0)::int` })
      .from(rewards).groupBy(rewards.status);
    return {
      days,
      daily: await this.dailySeries(days),
      verifiedByDifficulty: Object.fromEntries(byDifficulty.map((r) => [DIFFICULTY_LABEL[r.difficulty], Number(r.n)])),
      verifiedByCategory: byCategory.map((r) => ({ category: r.category, verified: Number(r.n) })),
      rewardsByStatus: rewardStatus.map((r) => ({ status: REWARD_STATUS_LABEL[r.status], count: Number(r.n), amount: Number(r.amount) })),
    };
  }

  settings() {
    const report = safeConfigReport(this.deps.config);
    const providers = Object.fromEntries(Object.values(this.verification.providers).map((p) => [p.type, {
      automatic: p.automatic, configured: p.configured,
      mode: p.type === "automated_test" ? "not_configured" : p.automatic ? "automatic" : "manual_review",
    }]));
    return { ...report, blockchainProvider: this.rewardsService.blockchainStatus(), verification: { providers } };
  }
}
