import "dotenv/config";
import { createApp } from "./app.js";
import { isGithubAppConfigured, loadConfig } from "./config/env.js";
import { db } from "./db/index.js";
import { MstRewardClaims } from "./integrations/blockchain/mst-claims.js";
import { MstRewardProvider } from "./integrations/blockchain/mst-provider.js";
import { OctokitGitHubAppClient } from "./integrations/github/app-client.js";
import { GitHubDeviceFlowAuth } from "./integrations/github/user-auth.js";
import { requireAuth } from "./security/auth.js";
import { login, logout, refreshSession, register, toPublicUser } from "./services/auth.service.js";

const config = loadConfig();

const claims = new MstRewardClaims(config.mst, config.signingSecret);

const { app } = createApp({
  db,
  config,
  github: new OctokitGitHubAppClient(config.github),
  githubUser: new GitHubDeviceFlowAuth({ clientId: config.github.clientId, apiUrl: config.github.apiUrl, apiVersion: config.github.apiVersion }),
  // Reads transaction status over JSON-RPC; payouts go through the claim flow below.
  blockchain: new MstRewardProvider(config.mst),
  claims,
  authenticate: requireAuth,
  auth: { register, login, logout, refresh: refreshSession, publicUser: toPublicUser },
});

app.listen(config.port, () => {
  console.log(`SECUREX API running on http://localhost:${config.port}`);
  console.log(`GitHub App: ${isGithubAppConfigured(config) ? "configured" : "not configured"}; ` +
    `webhook secret: ${config.github.webhookSecret ? "set" : "not set"}; ` +
    `MST reward claims: ${claims.status().claimsConfigured ? "configured" : claims.status().reason}`);
});
