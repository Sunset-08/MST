import { GitHubService } from "../integrations/github/github.service.js";
import { GitHubConnectService } from "./github-connect.service.js";
import { GitHubWebhookService } from "../integrations/github/webhooks.js";
import { VerificationService } from "../verification/engine.js";
import { AdminService } from "./admin.service.js";
import { ChallengesService } from "./challenges.service.js";
import type { ServiceDeps } from "./deps.js";
import { LeaderboardService } from "./leaderboard.service.js";
import { OrganizationsService } from "./organizations.service.js";
import { OrgService } from "./org.service.js";
import { OrgRewardsService } from "./org-rewards.service.js";
import { RewardsService } from "./rewards.service.js";
import { SubmissionsService } from "./submissions.service.js";
import { UsersService } from "./users.service.js";
import { WalletsService } from "./wallets.service.js";

export function createServices(deps: ServiceDeps) {
  const verification = new VerificationService(deps);
  const rewards = new RewardsService(deps);
  const github = new GitHubService(deps);
  return {
    deps,
    verification,
    rewards,
    github,
    githubWebhooks: new GitHubWebhookService(deps),
    githubConnect: new GitHubConnectService(deps),
    users: new UsersService(deps),
    challenges: new ChallengesService(deps),
    submissions: new SubmissionsService(deps, verification),
    leaderboard: new LeaderboardService(deps),
    wallets: new WalletsService(deps),
    organizations: new OrganizationsService(deps),
    org: new OrgService(deps, verification),
    orgRewards: new OrgRewardsService(deps),
    admin: new AdminService(deps, verification, rewards, github),
  };
}

export type Services = ReturnType<typeof createServices>;
