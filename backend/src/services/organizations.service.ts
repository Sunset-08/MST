import { and, asc, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { challenges, organizationMembers, organizations, users } from "../db/schema.js";
import { assertOrgRole, ROLE_RANK, type OrgRole } from "../middleware/auth.js";
import { iso } from "../utils/dates.js";
import { conflict, forbidden, notFound, parse } from "../utils/http.js";
import type { ServiceDeps } from "./deps.js";

const slugSchema = z.string().trim().toLowerCase().min(3).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens");
const httpsUrl = z.url({ protocol: /^https$/ }).max(500);

export const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: slugSchema.optional(),
  description: z.string().trim().max(2000).optional(),
  logoUrl: httpsUrl.optional(),
  website: httpsUrl.optional(),
}).strict();

export const updateOrgSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  logoUrl: httpsUrl.nullable().optional(),
  website: httpsUrl.nullable().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, "Provide at least one field");

export const addMemberSchema = z.object({
  userId: z.uuid().optional(),
  username: z.string().trim().min(3).max(24).optional(),
  email: z.email().max(254).optional(),
  role: z.enum(["owner", "admin", "member"]).default("member"),
}).strict().refine((v) => [v.userId, v.username, v.email].filter(Boolean).length === 1, "Provide exactly one of userId, username or email");

export const updateMemberSchema = z.object({ role: z.enum(["owner", "admin", "member"]) }).strict();

const slugify = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";

type Org = typeof organizations.$inferSelect;

export class OrganizationsService {
  constructor(private readonly deps: ServiceDeps) {}

  toDto(o: Org, role?: OrgRole) {
    return {
      id: o.id, name: o.name, slug: o.slug, description: o.description ?? undefined, logoUrl: o.logoUrl ?? undefined,
      website: o.website ?? undefined, status: o.status, createdAt: iso(o.createdAt), updatedAt: iso(o.updatedAt),
      ...(role ? { role } : {}),
    };
  }

  async create(user: { id: string }, body: unknown) {
    const input = parse(createOrgSchema, body);
    const now = this.deps.now();
    return this.deps.db.transaction(async (tx) => {
      let slug = input.slug ?? slugify(input.name);
      if (!input.slug) {
        const [taken] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
        if (taken) slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
      } else {
        const [taken] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
        if (taken) throw conflict("ORGANIZATION_SLUG_TAKEN", "An organization with this slug already exists");
      }
      const [org] = await tx.insert(organizations).values({
        name: input.name, slug, description: input.description, logoUrl: input.logoUrl, website: input.website, createdAt: now, updatedAt: now,
      }).returning();
      await tx.insert(organizationMembers).values({ organizationId: org!.id, userId: user.id, role: "owner", createdAt: now });
      return this.toDto(org!, "owner");
    });
  }

  async listMine(userId: string) {
    const rows = await this.deps.db.select({ org: organizations, role: organizationMembers.role }).from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(and(eq(organizationMembers.userId, userId), ne(organizations.status, "deleted")))
      .orderBy(asc(organizations.name));
    return rows.map((r) => this.toDto(r.org, r.role));
  }

  private async load(id: string): Promise<Org> {
    if (!z.uuid().safeParse(id).success) throw notFound("Organization");
    const [org] = await this.deps.db.select().from(organizations).where(and(eq(organizations.id, id), ne(organizations.status, "deleted"))).limit(1);
    if (!org) throw notFound("Organization");
    return org;
  }

  async get(id: string, user: { id: string }) {
    const org = await this.load(id);
    const role = await assertOrgRole(this.deps.db, id, user.id, "member");
    const [members] = await this.deps.db.select({ n: count() }).from(organizationMembers).where(eq(organizationMembers.organizationId, id));
    const [chs] = await this.deps.db.select({ n: count() }).from(challenges).where(eq(challenges.organizationId, id));
    return { ...this.toDto(org, role), memberCount: Number(members?.n ?? 0), challengeCount: Number(chs?.n ?? 0) };
  }

  async update(id: string, user: { id: string }, body: unknown) {
    await this.load(id);
    const role = await assertOrgRole(this.deps.db, id, user.id, "admin");
    const input = parse(updateOrgSchema, body);
    const [org] = await this.deps.db.update(organizations).set({ ...input, updatedAt: this.deps.now() })
      .where(eq(organizations.id, id)).returning();
    return this.toDto(org!, role);
  }

  /** Soft delete: keeps challenges, submissions and reward history; archives the organization's challenges. */
  async remove(id: string, user: { id: string; role: string }) {
    await this.load(id);
    if (user.role !== "platform_admin") await assertOrgRole(this.deps.db, id, user.id, "owner");
    const now = this.deps.now();
    await this.deps.db.transaction(async (tx) => {
      await tx.update(organizations).set({ status: "deleted", updatedAt: now }).where(eq(organizations.id, id));
      await tx.update(challenges).set({ status: "archived", updatedAt: now }).where(eq(challenges.organizationId, id));
    });
    return { id, deleted: true };
  }

  async listMembers(id: string, user: { id: string }) {
    await this.load(id);
    const viewerRole = await assertOrgRole(this.deps.db, id, user.id, "member");
    const rows = await this.deps.db.select({ m: organizationMembers, u: users }).from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, id)).orderBy(asc(organizationMembers.createdAt)).limit(500);
    const showEmail = ROLE_RANK[viewerRole] >= ROLE_RANK.admin;
    return rows.map(({ m, u }) => ({
      userId: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl ?? undefined,
      ...(showEmail ? { email: u.email } : {}), role: m.role, joinedAt: iso(m.createdAt),
    }));
  }

  async addMember(id: string, actor: { id: string }, body: unknown) {
    await this.load(id);
    const actorRole = await assertOrgRole(this.deps.db, id, actor.id, "admin");
    const input = parse(addMemberSchema, body);
    if (input.role !== "member" && actorRole !== "owner") throw forbidden("Only owners can grant admin or owner roles", "ORG_ROLE_REQUIRED");
    const [target] = await this.deps.db.select().from(users).where(
      input.userId ? eq(users.id, input.userId) : input.username ? eq(users.username, input.username) : eq(users.email, input.email!),
    ).limit(1);
    if (!target) throw notFound("User");
    const [row] = await this.deps.db.insert(organizationMembers).values({ organizationId: id, userId: target.id, role: input.role })
      .onConflictDoNothing().returning();
    if (!row) throw conflict("ALREADY_MEMBER", "User is already a member of this organization");
    return { userId: target.id, username: target.username, displayName: target.displayName, role: row.role, joinedAt: iso(row.createdAt) };
  }

  async updateMember(id: string, actor: { id: string }, userId: string, body: unknown) {
    await this.load(id);
    if (!z.uuid().safeParse(userId).success) throw notFound("Member");
    const actorRole = await assertOrgRole(this.deps.db, id, actor.id, "admin");
    const { role } = parse(updateMemberSchema, body);
    return this.deps.db.transaction(async (tx) => {
      const members = await tx.select().from(organizationMembers).where(eq(organizationMembers.organizationId, id)).for("update");
      const target = members.find((m) => m.userId === userId);
      if (!target) throw notFound("Member");
      if (actorRole !== "owner" && (target.role !== "member" || role !== "member")) {
        throw forbidden("Only owners can change admin or owner roles", "ORG_ROLE_REQUIRED");
      }
      if (target.role === "owner" && role !== "owner" && members.filter((m) => m.role === "owner").length === 1) {
        throw conflict("LAST_OWNER", "An organization must keep at least one owner");
      }
      const [updated] = await tx.update(organizationMembers).set({ role }).where(eq(organizationMembers.id, target.id)).returning();
      return { userId, role: updated!.role };
    });
  }

  async removeMember(id: string, actor: { id: string }, userId: string) {
    await this.load(id);
    if (!z.uuid().safeParse(userId).success) throw notFound("Member");
    const self = actor.id === userId;
    const actorRole = await assertOrgRole(this.deps.db, id, actor.id, self ? "member" : "admin");
    return this.deps.db.transaction(async (tx) => {
      const members = await tx.select().from(organizationMembers).where(eq(organizationMembers.organizationId, id)).for("update");
      const target = members.find((m) => m.userId === userId);
      if (!target) throw notFound("Member");
      if (!self && actorRole !== "owner" && target.role !== "member") throw forbidden("Only owners can remove admins or owners", "ORG_ROLE_REQUIRED");
      if (target.role === "owner" && members.filter((m) => m.role === "owner").length === 1) {
        throw conflict("LAST_OWNER", "An organization must keep at least one owner");
      }
      await tx.delete(organizationMembers).where(eq(organizationMembers.id, target.id));
      return { userId, removed: true };
    });
  }

}
