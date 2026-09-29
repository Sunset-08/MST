/**
 * Local end-to-end server for exercising the FRONTEND against the REAL backend code without external services.
 * Supabase Auth, GitHub and the MST chain are replaced by in-memory stand-ins; the database is an in-memory Postgres.
 * Development/testing only — never used by `npm start`.
 *
 *   npx tsx src/tests/e2e-server.ts      (listens on E2E_PORT, default 3011)
 */
import { randomUUID } from "node:crypto";
import express from "express";
import { readFileSync } from "node:fs";
import { JsonRpcProvider, Wallet, parseEther } from "ethers";
import { MstRewardClaims } from "../integrations/blockchain/mst-claims.js";
import { eq } from "drizzle-orm";
import { createApp } from "../app.js";
import { loadConfig } from "../config/env.js";
import { users } from "../db/schema.js";
import { createAuthMiddleware } from "../security/auth.js";
import { AuthServiceError, toPublicUser } from "../services/auth.service.js";
import { createTestDb, FakeChain, FakeClaims, FakeGitHub, FakeGitHubUser } from "./harness.js";
import type { User as SupabaseUser } from "@supabase/supabase-js";

async function main() {
  const PORT = Number(process.env.E2E_PORT ?? 3011);
  const { db } = await createTestDb();
  const config = {
    ...loadConfig({ NODE_ENV: "test", CORS_ORIGINS: "http://localhost:3000,http://localhost:3010,http://127.0.0.1:3010" }),
    signingSecret: "e2e-signing-secret-0123456789abcdef",
    publicAppUrl: "http://localhost:3000",
  };
  config.github = { ...config.github, appId: "5112750", privateKeyPath: "/fake", clientId: "e2e-client", webhookSecret: "e2e" };

  // --- in-memory "Supabase Auth" ---
  const accounts = new Map<string, { id: string; password: string; username: string; displayName: string }>();
  const access = new Map<string, string>();
  const refresh = new Map<string, string>();
  const session = (email: string) => {
    const a = accounts.get(email)!;
    const accessToken = `at-${randomUUID()}`;
    const refreshToken = `rt-${randomUUID()}`;
    access.set(accessToken, email);
    refresh.set(refreshToken, email);
    return { accessToken, refreshToken, expiresAt: Math.floor(Date.now() / 1000) + 3600, tokenType: "bearer", userId: a.id };
  };
  async function profileFor(email: string) {
    const a = accounts.get(email)!;
    const [existing] = await db.select().from(users).where(eq(users.authUserId, a.id)).limit(1);
    if (existing) return existing;
    const [created] = await db.insert(users).values({ authUserId: a.id, email, username: a.username, displayName: a.displayName }).returning();
    return created!;
  }

  // Optional real on-chain claims against a LOCAL EVM (E2E_CHAIN_DEPLOYMENT = a deployments/*.json from the blockchain module).
  const localRpc = process.env.E2E_RPC ?? "http://127.0.0.1:8547";
  const localProvider = new JsonRpcProvider(localRpc, 91562037, { staticNetwork: true, cacheTimeout: -1 });
  let claims: FakeClaims | MstRewardClaims = new FakeClaims();
  if (process.env.E2E_CHAIN_DEPLOYMENT) {
    const dep = JSON.parse(readFileSync(process.env.E2E_CHAIN_DEPLOYMENT, "utf8")) as { addresses: Record<string, string> };
    config.mst = {
      ...config.mst, network: "mst-testnet", rpcUrl: localRpc, chainId: 91562037,
      challengeRegistryAddress: dep.addresses.ChallengeRegistry, submissionRegistryAddress: dep.addresses.SubmissionRegistry,
      rewardContractAddress: dep.addresses.RewardVault,
      // Hardhat account #0: a public, local-only test key.
      verifierPrivateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    };
    claims = new MstRewardClaims(config.mst, config.signingSecret);
  }
  const github = new FakeGitHub();
  const githubUser = new FakeGitHubUser();
  const chain = new FakeChain();
  github.installations.set("165914364", {
    id: "165914364", account: { id: "77", login: "VishwasSharma28", type: "User", name: "Vishwas", htmlUrl: "https://github.com/VishwasSharma28" },
    repositorySelection: "selected", permissions: { issues: "read", metadata: "read" }, createdAt: new Date().toISOString(), suspendedAt: null,
  });
  const e2eRepo = (id: string, name: string, isPrivate = false) => ({ id, name, fullName: `VishwasSharma28/${name}`, owner: "VishwasSharma28", url: `https://github.com/VishwasSharma28/${name}`, defaultBranch: "main", archived: false, private: isPrivate });
  github.repos.set("165914364", [e2eRepo("1", "test-MST"), e2eRepo("2", "payments-api"), e2eRepo("3", "wallet-sdk", true)]);
  github.issues.set("VishwasSharma28/payments-api", [{ id: "9002", number: 7, title: "Webhook signature not verified", body: "details", author: "reporter", url: "https://github.com/VishwasSharma28/payments-api/issues/7", state: "open", labels: ["security"], createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-02T00:00:00Z" }]);
  github.issues.set("VishwasSharma28/test-MST", [
    { id: "501", number: 1, title: "Signer key committed to repo", body: "A signing key was found in history.", author: "VishwasSharma28", url: "https://github.com/VishwasSharma28/test-MST/issues/1", state: "open", labels: ["security"], createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z" },
  ]);
  // device flow authorizes on the second poll
  let polls = 0;
  githubUser.poll = async () => (++polls % 2 === 0 ? { status: "authorized", accessToken: "tok" } : { status: "pending" });
  githubUser.getUser = async () => ({ id: "9001", login: `octo-${Math.random().toString(36).slice(2, 6)}`, name: "Octo", avatarUrl: null });
  githubUser.start = async () => ({ deviceCode: "dev", userCode: "WXYZ-1234", verificationUri: "https://github.com/login/device", expiresIn: 900, interval: 1 });

  const authenticate = createAuthMiddleware({
    verify: async (token) => {
      const email = access.get(token);
      if (!email) throw new AuthServiceError("AUTH_INVALID_TOKEN", "Invalid or expired access token", 401);
      return { id: accounts.get(email)!.id } as SupabaseUser;
    },
    findUser: async (authUserId) => (await db.select().from(users).where(eq(users.authUserId, authUserId)).limit(1))[0],
  });

  const { app } = createApp({
    db, config, github, githubUser, blockchain: chain, claims, authenticate,
    auth: {
      register: async (input) => {
        if (accounts.has(input.email)) throw new AuthServiceError("AUTH_REGISTRATION_FAILED", "Unable to register with these details", 400);
        accounts.set(input.email, { id: randomUUID(), password: input.password, username: input.username, displayName: input.displayName });
        const user = await profileFor(input.email);
        return { user: toPublicUser(user), session: session(input.email), emailConfirmationRequired: false };
      },
      login: async (input) => {
        const a = accounts.get(input.email);
        if (!a || a.password !== input.password) throw new AuthServiceError("AUTH_INVALID_CREDENTIALS", "Invalid email or password", 401);
        return { user: toPublicUser(await profileFor(input.email)), session: session(input.email) };
      },
      refresh: async (token) => {
        const email = refresh.get(token);
        if (!email) throw new AuthServiceError("AUTH_REFRESH_FAILED", "Session expired; sign in again", 401);
        return { user: toPublicUser(await profileFor(email)), session: session(email) };
      },
      logout: async () => undefined,
      publicUser: (u) => toPublicUser(u),
    },
    rateLimit: false,
  });

  // Dev-only helpers for browser tests, mounted BEFORE the app so they are reachable:
  //  - promote a user to platform admin (the real system uses the seed script / SQL)
  //  - a throwaway test wallet that signs messages (stands in for a browser wallet extension)
  const testWallet = Wallet.createRandom();
  const outer = express();
  outer.use("/__e2e", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).end(); return; }
    next();
  }, express.json());
  outer.post("/__e2e/promote", async (req, res) => {
    await db.update(users).set({ role: "platform_admin" }).where(eq(users.email, String(req.query.email ?? "")));
    res.json({ ok: true });
  });
  // Dev-only: registers a pull request in the fake GitHub, opened now by the given login (there is no real GitHub here).
  outer.post("/__e2e/pull", (req, res) => {
    const { owner, repo, number, author, files, sha } = req.body as { owner: string; repo: string; number: number; author: string; files: string[]; sha: string };
    github.pulls.set(`${owner}/${repo}#${number}`, {
      number, url: `https://github.com/${owner}/${repo}/pull/${number}`, title: `Fix (#1)`, body: "Closes #1", state: "open", merged: false, author,
      createdAt: new Date().toISOString(), baseRepository: `${owner}/${repo}`, baseRef: "main", headRepository: `${author}/${repo}`, headRef: "fix", headSha: sha,
      mergeCommitSha: null, changedFiles: files,
    });
    res.json({ ok: true });
  });
  outer.get("/__e2e/wallet", (_req, res) => { res.json({ address: testWallet.address }); });
  outer.post("/__e2e/sign", async (req, res) => {
    res.json({ signature: await testWallet.signMessage(String(req.body?.message ?? "")) });
  });
  // Stand-in for the wallet extension's eth_sendTransaction, funded from Hardhat account #0 on the local EVM.
  const localSigner = new Wallet(testWallet.privateKey, localProvider);
  outer.post("/__e2e/send", async (req, res) => {
    try {
      const { to, data, value } = req.body as { to: string; data?: string; value?: string };
      const tx = await localSigner.sendTransaction({ to, data, value });
      res.json({ hash: tx.hash });
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });
  if (process.env.E2E_CHAIN_DEPLOYMENT) {
    const funder = new Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", localProvider);
    await (await funder.sendTransaction({ to: testWallet.address, value: parseEther("1") })).wait();
  }
  outer.use(app);

  outer.listen(PORT, () => console.log(`E2E API (in-memory) on http://localhost:${PORT}`));

}

main().catch((e) => { console.error(e); process.exit(1); });
