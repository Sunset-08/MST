import type { RequestHandler } from "express";
import { verifyGitHubSignature } from "../integrations/github/webhooks.js";
import type { Services } from "../services/index.js";
import { AppError, handler, ok, unavailable } from "../utils/http.js";

/** GitHub webhook receiver. Requires express.raw() so the signature is computed over the exact bytes received. */
export function createGitHubWebhookHandler(s: Services): RequestHandler {
  return handler(async (req, res) => {
    const secret = s.deps.config.github.webhookSecret;
    if (!secret) throw unavailable("GITHUB_WEBHOOK_NOT_CONFIGURED", "GitHub webhook secret is not configured");
    const raw = req.body;
    if (!Buffer.isBuffer(raw)) throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Webhook payload must be application/json");
    if (!verifyGitHubSignature(secret, raw, req.header("x-hub-signature-256"))) {
      throw new AppError(401, "INVALID_SIGNATURE", "Webhook signature verification failed");
    }
    const delivery = req.header("x-github-delivery");
    const event = req.header("x-github-event");
    if (!delivery || !/^[A-Za-z0-9-]{1,100}$/.test(delivery) || !event || !/^[a-z_]{1,64}$/.test(event)) {
      throw new AppError(400, "INVALID_WEBHOOK_HEADERS", "Missing or invalid GitHub delivery headers");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new AppError(400, "MALFORMED_JSON", "Webhook payload is not valid JSON");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new AppError(400, "MALFORMED_JSON", "Webhook payload must be an object");
    ok(res, await s.githubWebhooks.handle(delivery, event, payload as Record<string, unknown>), 202);
  });
}
