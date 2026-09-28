import type { RequestHandler } from "express";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { organizationMembers, organizations } from "../db/schema.js";
import { AppError, badRequest, forbidden } from "../utils/http.js";

export type OrgRole = "owner" | "admin" | "member";

declare global {
  namespace Express {
    interface Request {
      orgContext?: { organizationId: string; role: OrgRole };
    }
  }
}

/** Authenticates when a bearer token is present; anonymous otherwise. An invalid token is still rejected. */
export function optionalAuth(authenticate: RequestHandler): RequestHandler {
  return (req, res, next) => (req.header("authorization") ? authenticate(req, res, next) : next());
}

export const requirePlatformAdmin: RequestHandler = (req, _res, next) => {
  if (req.securexUser?.role !== "platform_admin") return next(forbidden("Platform administrator access required", "ADMIN_REQUIRED"));
  next();
};

export const ROLE_RANK: Record<OrgRole, number> = { member: 1, admin: 2, owner: 3 };

/** Active organization membership of a user, or undefined. Deleted organizations have no members. */
export async function findMembership(db: Db, organizationId: string, userId: string) {
  const [row] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.userId, userId),
      ne(organizations.status, "deleted"),
    ))
    .limit(1);
  return row?.role as OrgRole | undefined;
}

/** Throws 404 for non-members (no enumeration) and 403 for members below `minRole`. */
export async function assertOrgRole(db: Db, organizationId: string, userId: string, minRole: OrgRole): Promise<OrgRole> {
  const role = await findMembership(db, organizationId, userId);
  if (!role) throw new AppError(404, "NOT_FOUND", "Organization not found");
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) throw forbidden(`Requires organization ${minRole} role`, "ORG_ROLE_REQUIRED");
  return role;
}

const uuid = z.uuid();

/**
 * Resolves the organization for /api/org/* from `X-Organization-Id` (or `?organizationId=`), else the user's
 * only membership. Requires membership with at least `minRole`.
 */
export function requireOrgContext(db: Db, minRole: OrgRole = "member"): RequestHandler {
  return async (req, _res, next) => {
    try {
      const user = req.securexUser!;
      const requested = req.header("x-organization-id") ?? (typeof req.query.organizationId === "string" ? req.query.organizationId : undefined);
      let organizationId: string;
      if (requested) {
        if (!uuid.safeParse(requested).success) throw badRequest("INVALID_ORGANIZATION_ID", "Invalid organization id");
        organizationId = requested;
      } else {
        const memberships = await db
          .select({ organizationId: organizationMembers.organizationId })
          .from(organizationMembers)
          .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
          .where(and(eq(organizationMembers.userId, user.id), ne(organizations.status, "deleted")))
          .limit(2);
        if (memberships.length === 0) throw forbidden("Organization membership required", "ORG_MEMBERSHIP_REQUIRED");
        if (memberships.length > 1) {
          throw badRequest("ORGANIZATION_REQUIRED", "Select an organization with the X-Organization-Id header");
        }
        organizationId = memberships[0]!.organizationId;
      }
      const role = await findMembership(db, organizationId, user.id);
      if (!role) throw forbidden("Organization membership required", "ORG_MEMBERSHIP_REQUIRED");
      if (ROLE_RANK[role] < ROLE_RANK[minRole]) throw forbidden(`Requires organization ${minRole} role`, "ORG_ROLE_REQUIRED");
      req.orgContext = { organizationId, role };
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Per-route role gate after requireOrgContext. */
export function requireOrgRole(minRole: OrgRole): RequestHandler {
  return (req, _res, next) => {
    const ctx = req.orgContext;
    if (!ctx || ROLE_RANK[ctx.role] < ROLE_RANK[minRole]) return next(forbidden(`Requires organization ${minRole} role`, "ORG_ROLE_REQUIRED"));
    next();
  };
}
