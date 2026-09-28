import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { RequestHandler } from "express";
import { AuthServiceError, findSecurexUser, verifyAccessToken, type SecurexUser } from "../services/auth.service.js";

declare global {
  namespace Express {
    interface Request {
      securexUser?: SecurexUser;
      supabaseUser?: SupabaseUser;
      accessToken?: string;
    }
  }
}

export interface AuthMiddlewareDependencies {
  verify(token: string): Promise<SupabaseUser>;
  findUser(authUserId: string): Promise<SecurexUser | undefined>;
}

export function createAuthMiddleware(dependencies: AuthMiddlewareDependencies): RequestHandler {
  return async (req, res, next) => {
    const authorization = req.header("authorization");
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) {
      res.status(401).json({ success: false, error: { code: "AUTH_REQUIRED", message: "Bearer authentication is required" } });
      return;
    }

    const token = match[1]!;
    let authUser: SupabaseUser;
    try {
      authUser = await dependencies.verify(token);
    } catch (error) {
      if (error instanceof AuthServiceError && error.status !== 401) {
        next(error);
        return;
      }
      res.status(401).json({ success: false, error: { code: "AUTH_INVALID_TOKEN", message: "Invalid or expired access token" } });
      return;
    }

    try {
      const user = await dependencies.findUser(authUser.id);
      if (!user) {
        res.status(401).json({ success: false, error: { code: "AUTH_PROFILE_NOT_FOUND", message: "SECUREX profile not found" } });
        return;
      }
      req.securexUser = user;
      req.supabaseUser = authUser;
      req.accessToken = token;
      next();
    } catch (error) { next(error); }
  };
}

export const requireAuth = createAuthMiddleware({ verify: verifyAccessToken, findUser: findSecurexUser });
