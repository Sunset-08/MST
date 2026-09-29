import type { AppConfig } from "../config/env.js";
import type { Db } from "../db/index.js";
import type { BlockchainRewardProvider } from "../integrations/blockchain/types.js";
import type { RewardClaimProvider } from "../integrations/blockchain/claims.js";
import type { GitHubAppClient } from "../integrations/github/types.js";
import type { GitHubUserAuth } from "../integrations/github/user-auth.js";

export interface ServiceDeps {
  db: Db;
  config: AppConfig;
  github: GitHubAppClient;
  githubUser: GitHubUserAuth;
  blockchain: BlockchainRewardProvider;
  claims: RewardClaimProvider;
  now: () => Date;
}
