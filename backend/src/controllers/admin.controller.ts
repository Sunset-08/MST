import type { Services } from "../services/index.js";
import { handler, ok } from "../utils/http.js";
import { param } from "./participant.controller.js";

export function createAdminController(s: Services) {
  return {
    dashboard: handler(async (_req, res) => ok(res, await s.admin.dashboard())),
    users: handler(async (req, res) => ok(res, await s.admin.users(req.query))),
    organizations: handler(async (req, res) => ok(res, await s.admin.organizations(req.query))),
    challenges: handler(async (req, res) => ok(res, await s.admin.challenges(req.query))),
    submissions: handler(async (req, res) => ok(res, await s.admin.submissions(req.query))),
    reviewSubmission: handler(async (req, res) => ok(res, await s.admin.reviewSubmission(req.securexUser!.id, param(req.params.id), req.body))),
    rewards: handler(async (req, res) => ok(res, await s.admin.rewards(req.query))),
    rewardReadiness: handler(async (_req, res) => ok(res, await s.rewards.adminReadiness())),
    fundVault: handler(async (req, res) => ok(res, await s.rewards.fundVault(req.body))),
    setVaultCap: handler(async (req, res) => ok(res, await s.rewards.setMaxReward(req.body))),
    processRewards: handler(async (_req, res) => ok(res, await s.admin.processRewards())),
    refreshReward: handler(async (req, res) => ok(res, await s.admin.refreshReward(param(req.params.id)))),
    github: handler(async (_req, res) => ok(res, await s.admin.githubOverview())),
    analytics: handler(async (req, res) => ok(res, await s.admin.analytics(req.query))),
    settings: handler(async (_req, res) => ok(res, s.admin.settings())),
  };
}
