import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { z } from "zod";

/** Domain error with a stable machine-readable code and an HTTP status. Message must be safe to show. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new AppError(400, code, message, details);
export const forbidden = (message = "You do not have permission to perform this action", code = "FORBIDDEN") =>
  new AppError(403, code, message);
export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const unavailable = (code: string, message: string) => new AppError(503, code, message);

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

/** Wraps async handlers so rejections reach the central error handler. */
export function handler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

function safeIssues(issues: z.core.$ZodIssue[]) {
  return issues.map((i) => ({ path: i.path.map(String), code: i.code, message: i.message }));
}

/** Parses untrusted input; throws a 400 without echoing submitted values. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw badRequest("VALIDATION_ERROR", "Request validation failed", safeIssues(result.error.issues));
  return result.data;
}
