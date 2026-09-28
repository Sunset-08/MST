import express, { type Express, type RequestHandler } from "express";
import cors from "cors";
import type { AppConfig } from "./config/env.js";
import { createGitHubWebhookHandler } from "./controllers/webhook.controller.js";
import type { Db } from "./db/index.js";
import type { BlockchainRewardProvider } from "./integrations/blockchain/types.js";
import type { GitHubAppClient } from "./integrations/github/types.js";
import { createErrorHandler, notFoundHandler } from "./middleware/error.js";
import { createRateLimiters, securityHeaders } from "./middleware/security.js";
import { createAdminRouter, createOrganizationRouter, createOrgDashboardRouter, createParticipantRouter } from "./routes/api.routes.js";
import { createAuthRouter, type AuthRouteDependencies } from "./routes/auth.routes.js";
import { createServices, type Services } from "./services/index.js";

export interface AppDependencies {
  db: Db;
  config: AppConfig;
  github: GitHubAppClient;
  blockchain: BlockchainRewardProvider;
  /** Supabase-backed bearer authentication (see security/auth.ts). */
  authenticate: RequestHandler;
  /** Supabase Auth register/login/logout handlers. */
  auth: Omit<AuthRouteDependencies, "authenticate">;
  now?: () => Date;
  rateLimit?: boolean;
  log?: (error: unknown) => void;
}

export function createApp(deps: AppDependencies): { app: Express; services: Services } {
  const services = createServices({
    db: deps.db, config: deps.config, github: deps.github, blockchain: deps.blockchain, now: deps.now ?? (() => new Date()),
  });
  const limiters = createRateLimiters(deps.rateLimit ?? true);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", deps.config.isProduction ? 1 : false);
  app.use(securityHeaders);
  app.use(cors({
    origin: deps.config.corsOrigins === "*" ? true : deps.config.corsOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Organization-Id"],
    exposedHeaders: ["X-Total-Count"],
    maxAge: 600,
  }));

  // Raw body for signature verification; must be registered before the JSON parser.
  app.post("/api/webhooks/github", limiters.webhook, express.raw({ type: "application/json", limit: "1mb" }), createGitHubWebhookHandler(services));

  app.use("/api/attempts", express.json({ limit: "256kb" }));
  app.use(express.json({ limit: "32kb" }));

  app.get("/health", (_req, res) => {
    res.json({ success: true, service: "SECUREX API", status: "healthy" });
  });

  const routeDeps = { services, authenticate: deps.authenticate, limiters };
  app.use("/api/auth", limiters.auth, createAuthRouter({ ...deps.auth, authenticate: deps.authenticate }));
  app.use("/api", limiters.api);
  app.use("/api/organizations", createOrganizationRouter(routeDeps));
  app.use("/api/org", createOrgDashboardRouter(routeDeps));
  app.use("/api/admin", createAdminRouter(routeDeps));
  app.use("/api", createParticipantRouter(routeDeps));

  app.use(notFoundHandler);
  app.use(createErrorHandler({ log: deps.log }));
  return { app, services };
}
