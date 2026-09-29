import express, { Router, type RequestHandler } from "express";
import { createAdminController } from "../controllers/admin.controller.js";
import { createOrganizationController } from "../controllers/organization.controller.js";
import { createParticipantController } from "../controllers/participant.controller.js";
import { optionalAuth, requireOrgContext, requireOrgRole, requirePlatformAdmin } from "../middleware/auth.js";
import type { createRateLimiters } from "../middleware/security.js";
import type { Services } from "../services/index.js";

interface RouteDeps {
  services: Services;
  authenticate: RequestHandler;
  limiters: ReturnType<typeof createRateLimiters>;
}

export function createParticipantRouter({ services, authenticate, limiters }: RouteDeps): Router {
  const c = createParticipantController(services);
  const r = Router();
  const maybeAuth = optionalAuth(authenticate);

  r.get("/users/me", authenticate, c.me);
  r.put("/users/me", authenticate, c.updateMe);
  r.get("/users/me/stats", authenticate, c.stats);
  r.get("/users/me/history", authenticate, c.history);
  r.get("/users/:username", c.publicProfile);

  r.post("/github/connect/start", authenticate, limiters.write, c.githubConnectStart);
  r.post("/github/connect/poll", authenticate, c.githubConnectPoll);
  r.delete("/github/connect", authenticate, c.githubDisconnect);

  r.get("/challenges", maybeAuth, c.listChallenges);
  r.get("/challenges/:id", maybeAuth, c.getChallenge);
  r.post("/challenges/:id/start", authenticate, limiters.write, c.startChallenge);

  // Patches can be larger than the global JSON limit.
  r.post("/attempts/:attemptId/submit", authenticate, limiters.write, express.json({ limit: "256kb" }), c.submit);
  r.get("/submissions/:submissionId/result", authenticate, c.result);

  r.get("/leaderboard", maybeAuth, c.leaderboard);
  r.get("/rewards", authenticate, c.rewards);
  r.get("/rewards/:id/claim-info", authenticate, limiters.write, c.rewardClaimInfo);
  r.post("/rewards/:id/claim", authenticate, limiters.write, c.rewardClaim);

  r.get("/wallets", authenticate, c.listWallets);
  r.post("/wallets/challenge", authenticate, limiters.write, c.walletChallenge);
  r.post("/wallets/verify", authenticate, limiters.write, c.walletVerify);
  r.post("/wallets/:id/primary", authenticate, c.walletPrimary);
  r.delete("/wallets/:id", authenticate, c.walletRemove);
  return r;
}

export function createOrganizationRouter({ services, authenticate, limiters }: RouteDeps): Router {
  const c = createOrganizationController(services);
  const r = Router();
  r.use(authenticate);
  r.get("/", c.listMine);
  r.post("/", limiters.write, c.create);
  r.get("/:id", c.get);
  r.put("/:id", c.update);
  r.delete("/:id", c.remove);
  r.get("/:id/members", c.listMembers);
  r.post("/:id/members", limiters.write, c.addMember);
  r.put("/:id/members/:userId", c.updateMember);
  r.delete("/:id/members/:userId", c.removeMember);
  return r;
}

export function createOrgDashboardRouter({ services, authenticate, limiters }: RouteDeps): Router {
  const c = createOrganizationController(services);
  const r = Router();
  r.use(authenticate, requireOrgContext(services.deps.db, "member"));
  const admin = requireOrgRole("admin");
  r.get("/stats", c.stats);
  r.get("/mst-status", c.mstStatus);
  r.get("/activity", c.activity);
  r.get("/challenges", c.listChallenges);
  r.post("/challenges", admin, limiters.write, c.createChallenge);
  r.get("/challenges/:id", admin, c.getChallenge);
  r.put("/challenges/:id", admin, c.updateChallenge);
  r.get("/submissions", admin, c.listSubmissions);
  r.post("/submissions/:id/review", admin, c.reviewSubmission);
  r.get("/github", c.githubOverview);
  r.get("/github/install-url", admin, c.githubInstallUrl);
  r.post("/github/installations", admin, limiters.write, c.githubLink);
  r.post("/github/sync", admin, limiters.write, c.githubSync);
  r.get("/github/repositories/available", admin, c.githubAvailable);
  r.post("/github/repositories", admin, limiters.write, c.githubConnectRepos);
  r.put("/github/repositories/:id", admin, limiters.write, c.githubUpdateRepo);
  r.delete("/github/repositories/:id", admin, limiters.write, c.githubRemoveRepo);
  r.get("/github/issues", c.githubIssues);
  return r;
}

export function createAdminRouter({ services, authenticate }: RouteDeps): Router {
  const c = createAdminController(services);
  const r = Router();
  r.use(authenticate, requirePlatformAdmin);
  r.get("/dashboard", c.dashboard);
  r.get("/users", c.users);
  r.get("/organizations", c.organizations);
  r.get("/challenges", c.challenges);
  r.get("/submissions", c.submissions);
  r.post("/submissions/:id/review", c.reviewSubmission);
  r.get("/rewards", c.rewards);
  r.get("/rewards/readiness", c.rewardReadiness);
  r.post("/rewards/vault/fund", c.fundVault);
  r.post("/rewards/vault/cap", c.setVaultCap);
  r.post("/rewards/process", c.processRewards);
  r.post("/rewards/:id/refresh", c.refreshReward);
  r.get("/github", c.github);
  r.get("/analytics", c.analytics);
  r.get("/settings", c.settings);
  return r;
}
