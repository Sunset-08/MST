import type { ErrorRequestHandler, RequestHandler } from "express";
import { AuthServiceError } from "../services/auth.service.js";
import { AppError } from "../utils/http.js";

const send = (res: Parameters<RequestHandler>[1], status: number, code: string, message: string, details?: unknown) =>
  res.status(status).json({ success: false, error: details === undefined ? { code, message } : { code, message, details } });

function pgCode(error: unknown): string | undefined {
  let e: unknown = error;
  for (let i = 0; i < 3 && e && typeof e === "object"; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  send(res, 404, "ROUTE_NOT_FOUND", "Route not found");
};

/** Central error handler: stable codes, no stack traces, request bodies or upstream error text in responses. */
export function createErrorHandler(options: { log?: (error: unknown) => void } = {}): ErrorRequestHandler {
  const log = options.log ?? ((error: unknown) => {
    const e = error as { name?: string; message?: string };
    console.error(`[securex] unhandled error: ${e?.name ?? "Error"}: ${e?.message ?? String(error)}`);
  });
  return (error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error instanceof AppError) return send(res, error.status, error.code, error.message, error.details);
    if (error instanceof AuthServiceError) return send(res, error.status, error.code, error.message);

    const type = (error as { type?: unknown })?.type;
    if (type === "entity.too.large") return send(res, 413, "PAYLOAD_TOO_LARGE", "Request body is too large");
    if (type === "entity.parse.failed") return send(res, 400, "MALFORMED_JSON", "Request body is not valid JSON");
    if (type === "encoding.unsupported" || type === "charset.unsupported") {
      return send(res, 415, "UNSUPPORTED_ENCODING", "Unsupported request encoding");
    }

    const code = pgCode(error);
    if (code === "23505") return send(res, 409, "CONFLICT", "The resource already exists or conflicts with existing data");
    if (code === "22P02") return send(res, 400, "INVALID_IDENTIFIER", "Invalid identifier");
    if (code === "23503") return send(res, 409, "REFERENCE_CONFLICT", "The operation conflicts with related data");

    log(error);
    send(res, 500, "INTERNAL_ERROR", "An unexpected error occurred");
  };
}
