import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { AuthServiceError, toPublicUser } from "../services/auth.service.js";
import type { SecurexUser } from "../services/auth.service.js";
import { logout, login, register } from "../services/auth.service.js";
import { requireAuth } from "../security/auth.js";

const usernameSchema = z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/);
const registerSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(80),
}).strict();
const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(128) }).strict();

export interface AuthRouteDependencies {
  register(input: z.infer<typeof registerSchema>): Promise<{
    user: unknown;
    session: unknown;
    emailConfirmationRequired: boolean;
  }>;
  login(input: z.infer<typeof loginSchema>): Promise<{ user: unknown; session: unknown }>;
  logout(token: string): Promise<void>;
  authenticate: RequestHandler;
  publicUser(user: SecurexUser): unknown;
}

function sendValidationError(issues: unknown, res: Parameters<RequestHandler>[1]): void {
  const safeIssues = Array.isArray(issues) ? issues.map((issue) => {
    if (typeof issue !== "object" || issue === null) return { message: "Invalid value" };
    const item = issue as { path?: unknown; code?: unknown; message?: unknown };
    return {
      path: Array.isArray(item.path) ? item.path : [],
      code: typeof item.code === "string" ? item.code : "invalid_value",
      message: typeof item.message === "string" ? item.message : "Invalid value",
    };
  }) : [];
  res.status(400).json({
    success: false,
    error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: safeIssues },
  });
}

export function createAuthRouter(dependencies: AuthRouteDependencies): Router {
  const router = Router();

  router.post("/register", async (req, res, next) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(parsed.error.issues, res);
    try {
      const result = await dependencies.register(parsed.data);
      res.status(result.emailConfirmationRequired ? 202 : 201).json({ success: true, data: result });
    } catch (error) { next(error); }
  });

  router.post("/login", async (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(parsed.error.issues, res);
    try {
      res.json({ success: true, data: await dependencies.login(parsed.data) });
    } catch (error) { next(error); }
  });

  router.post("/logout", dependencies.authenticate, async (req, res, next) => {
    try {
      await dependencies.logout(req.accessToken!);
      res.json({ success: true, data: { message: "Logged out" } });
    } catch (error) { next(error); }
  });

  router.get("/me", dependencies.authenticate, (req, res) => {
    res.json({ success: true, data: { user: dependencies.publicUser(req.securexUser!) } });
  });

  return router;
}

export const authRouter = createAuthRouter({
  register,
  login,
  logout,
  authenticate: requireAuth,
  publicUser: toPublicUser,
});

export function authErrorHandler(error: unknown, _req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1], _next: Parameters<RequestHandler>[2]): void {
  if (error instanceof AuthServiceError) {
    res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    return;
  }
  // Avoid serializing upstream errors, request bodies, or credential-bearing objects.
  res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
}
