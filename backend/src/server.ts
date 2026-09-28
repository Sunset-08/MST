import "dotenv/config";
import { createApp } from "./app.js";
import { isGithubAppConfigured, loadConfig } from "./config/env.js";
import { db } from "./db/index.js";
import { MstRewardProvider } from "./integrations/blockchain/mst-provider.js";
import { OctokitGitHubAppClient } from "./integrations/github/app-client.js";
import { requireAuth } from "./security/auth.js";
import { login, logout, register, toPublicUser } from "./services/auth.service.js";

const config = loadConfig();

const { app } = createApp({
  db,
  config,
  github: new OctokitGitHubAppClient(config.github),
  // No reward contract adapter until the MST reward contract is finalized: rewards stay pending.
  blockchain: new MstRewardProvider(config.mst),
  authenticate: requireAuth,
  auth: { register, login, logout, publicUser: toPublicUser },
});

app.listen(config.port, () => {
  console.log(`SECUREX API running on http://localhost:${config.port}`);
  console.log(`GitHub App: ${isGithubAppConfigured(config) ? "configured" : "not configured"}; ` +
    `webhook secret: ${config.github.webhookSecret ? "set" : "not set"}; ` +
    `MST reward sending: not configured (awaiting reward contract)`);
});
