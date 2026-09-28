import { sql } from "drizzle-orm";
import { z } from "zod";
import { challenges, reputationEvents, submissions, users } from "../db/schema.js";
import { assertOrgRole } from "../middleware/auth.js";
import { badRequest, parse } from "../utils/http.js";
import { displayedStreak } from "./gamification.rules.js";
import { VERIFIED_EVENT } from "./gamification.service.js";
import type { ServiceDeps } from "./deps.js";

export const leaderboardQuerySchema = z.object({
  period: z.enum(["global", "weekly", "monthly", "organization"]).default("global"),
  organizationId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

interface Row { user_id: string; username: string; display_name: string; avatar_url: string | null; points: number; level: number;
  current_streak: number; last_activity_at: Date | string | null; solved: number; rank: number; total: number }

export class LeaderboardService {
  constructor(private readonly deps: ServiceDeps) {}

  async get(rawQuery: unknown, viewer?: { id: string; role: string }) {
    const q = parse(leaderboardQuerySchema, rawQuery);
    const offset = (q.page - 1) * q.limit;
    const now = this.deps.now();
    let scored;
    if (q.period === "global") {
      scored = sql`SELECT u.id AS user_id, u.points AS score FROM ${users} u WHERE u.role = 'participant' AND u.points > 0`;
    } else if (q.period === "weekly" || q.period === "monthly") {
      const since = new Date(now.getTime() - (q.period === "weekly" ? 7 : 30) * 86_400_000);
      scored = sql`SELECT e.user_id, sum(e.points)::int AS score FROM ${reputationEvents} e
        JOIN ${users} u ON u.id = e.user_id AND u.role = 'participant'
        WHERE e.created_at >= ${since.toISOString()} GROUP BY e.user_id HAVING sum(e.points) > 0`;
    } else {
      if (!q.organizationId) throw badRequest("ORGANIZATION_REQUIRED", "organizationId is required for the organization leaderboard");
      if (!viewer) throw badRequest("AUTH_REQUIRED", "Sign in to view an organization leaderboard");
      if (viewer.role !== "platform_admin") await assertOrgRole(this.deps.db, q.organizationId, viewer.id, "member");
      scored = sql`SELECT e.user_id, sum(e.points)::int AS score FROM ${reputationEvents} e
        JOIN ${challenges} c ON c.id = e.challenge_id AND c.organization_id = ${q.organizationId}
        JOIN ${users} u ON u.id = e.user_id AND u.role = 'participant'
        WHERE e.event_type = ${VERIFIED_EVENT} GROUP BY e.user_id HAVING sum(e.points) > 0`;
    }
    const result = await this.deps.db.execute(sql`
      WITH scored AS (${scored}),
      ranked AS (
        SELECT s.user_id, s.score, RANK() OVER (ORDER BY s.score DESC) AS rank, count(*) OVER () AS total FROM scored s
      )
      SELECT r.user_id, u.username, u.display_name, u.avatar_url, r.score::int AS points, u.level, u.current_streak,
        u.last_activity_at, r.rank::int AS rank, r.total::int AS total,
        (SELECT count(DISTINCT sub.challenge_id)::int FROM ${submissions} sub WHERE sub.user_id = r.user_id AND sub.status = 'verified') AS solved
      FROM ranked r JOIN ${users} u ON u.id = r.user_id
      ORDER BY r.rank, u.username
      LIMIT ${q.limit} OFFSET ${offset}`);
    const rows = (result as unknown as { rows: Row[] }).rows;
    const entries = rows.map((r) => ({
      rank: Number(r.rank),
      participantId: r.user_id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url ?? undefined,
      points: Number(r.points),
      level: Number(r.level),
      challengesSolved: Number(r.solved),
      currentStreak: displayedStreak(Number(r.current_streak), r.last_activity_at ? new Date(r.last_activity_at) : null, now),
      isCurrentUser: viewer ? r.user_id === viewer.id : false,
    }));
    return { entries, total: rows.length ? Number(rows[0]!.total) : 0, period: q.period, page: q.page, pageSize: q.limit };
  }
}
