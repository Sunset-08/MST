import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";

/** Minimal hardening headers for a JSON API. */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Cache-Control", "no-store");
  res.removeHeader("X-Powered-By");
  next();
};

const limitedResponse = { success: false, error: { code: "RATE_LIMITED", message: "Too many requests, try again later" } };

export function createRateLimiters(enabled = true) {
  const make = (windowMs: number, limit: number): RequestHandler =>
    enabled
      ? rateLimit({ windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false, message: limitedResponse })
      : (_req, _res, next) => next();
  return {
    /** Credential endpoints: brute-force protection. */
    auth: make(15 * 60_000, 30),
    /** Writes that create attempts/submissions/links. */
    write: make(60_000, 30),
    /** Everything else under /api. */
    api: make(60_000, 300),
    webhook: make(60_000, 600),
  };
}
