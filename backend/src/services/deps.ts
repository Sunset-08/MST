import type { AppConfig } from "../config/env.js";
import type { Db } from "../db/index.js";
import type { BlockchainRewardProvider } from "../integrations/blockchain/types.js";
import type { GitHubAppClient } from "../integrations/github/types.js";

export interface ServiceDeps {
  db: Db;
  config: AppConfig;
  github: GitHubAppClient;
  blockchain: BlockchainRewardProvider;
  now: () => Date;
}
