// Test harness: real Postgres semantics via PGlite + the production app factory.
// External systems (Supabase Auth, GitHub, MST chain) are replaced by in-memory fakes.
import type { Server } from "node:http";
import { PGlite } from "@electric-sql/pglite";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { createApp } from "../app.js";
import { loadConfig, type AppConfig } from "../config/env.js";
import type { Db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { ClaimError, type ClaimInput, type ClaimPreparation, type ClaimResult, type RewardClaimProvider } from "../integrations/blockchain/claims.js";
import type { BlockchainRewardProvider, ProviderStatus, RewardInput, TransactionStatus } from "../integrations/blockchain/types.js";
import { BlockchainNotConfiguredError } from "../integrations/blockchain/types.js";
import type { GitHubAppClient, GitHubInstallation, GitHubIssueData, GitHubPullRequestData, GitHubRepositoryData } from "../integrations/github/types.js";
import { AppError } from "../utils/http.js";
import type { DeviceFlowPoll, DeviceFlowStart, GitHubUserAuth, GitHubUserProfile } from "../integrations/github/user-auth.js";
import { createAuthMiddleware } from "../security/auth.js";
import { AuthServiceError } from "../services/auth.service.js";

let migration: string[] | undefined;

export async function createTestDb() {
  if (!migration) {
    const { generateDrizzleJson, generateMigration } = await import("drizzle-kit/api");
    migration = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema as unknown as Record<string, unknown>));
  }
  const client = new PGlite();
  for (const statement of migration) await client.exec(statement);
  return { db: drizzle(client, { schema }) as unknown as Db, client };
}

export class FakeGitHub implements GitHubAppClient {
  configured = true;
  installations = new Map<string, GitHubInstallation>();
  repos = new Map<string, GitHubRepositoryData[]>();
  issues = new Map<string, GitHubIssueData[]>();
  calls: string[] = [];
  isConfigured() { return this.configured; }
  async getApp() { return { id: "5112750", slug: "securexmst", name: "securexMST", htmlUrl: "https://github.com/apps/securexmst" }; }
  async getInstallation(id: string) {
    this.calls.push(`installation:${id}`);
    const i = this.installations.get(id);
    if (!i) throw Object.assign(new Error("not found"), { status: 404 });
    return i;
  }
  async listInstallationRepositories(id: string) { this.calls.push(`repos:${id}`); return this.repos.get(id) ?? []; }
  async listRepositoryIssues(_id: string, owner: string, repo: string) { this.calls.push(`issues:${owner}/${repo}`); return this.issues.get(`${owner}/${repo}`) ?? []; }
  /** Pull requests keyed `owner/repo#number`. */
  pulls = new Map<string, GitHubPullRequestData>();
  async getPullRequest(_id: string, owner: string, repo: string, number: number) {
    this.calls.push(`pull:${owner}/${repo}#${number}`);
    const pr = this.pulls.get(`${owner}/${repo}#${number}`);
    if (!pr) throw new AppError(404, "GITHUB_NOT_FOUND", "GitHub resource not found or not accessible");
    return pr;
  }
}

export class FakeGitHubUser implements GitHubUserAuth {
  configured = true;
  /** device_code -> outcome */
  outcomes = new Map<string, DeviceFlowPoll>();
  profiles = new Map<string, GitHubUserProfile>();
  n = 0;
  isConfigured() { return this.configured; }
  async start(): Promise<DeviceFlowStart> {
    this.n++;
    return { deviceCode: `device-${this.n}`, userCode: `ABCD-${1000 + this.n}`, verificationUri: "https://github.com/login/device", expiresIn: 900, interval: 5 };
  }
  async poll(deviceCode: string): Promise<DeviceFlowPoll> { return this.outcomes.get(deviceCode) ?? { status: "pending" }; }
  async getUser(token: string): Promise<GitHubUserProfile> {
    const p = this.profiles.get(token);
    if (!p) throw new Error("unknown token");
    return p;
  }
}

/** In-memory stand-in for the on-chain claim flow (the real one is exercised against a local EVM in rehearsals). */
export class FakeClaims implements RewardClaimProvider {
  configured = false;
  failWith: ClaimError | null = null;
  prepared: ClaimInput[] = [];
  completed: (ClaimInput & { txHash: string })[] = [];
  status() {
    return this.configured
      ? { configured: true, canSend: true, canReadTransactions: true, claimsConfigured: true }
      : { configured: false, canSend: false, canReadTransactions: false, claimsConfigured: false, reason: "blockchain not configured" };
  }
  async prepare(input: ClaimInput): Promise<ClaimPreparation> {
    if (!this.configured) throw new ClaimError("BLOCKCHAIN_NOT_CONFIGURED", "blockchain not configured", 503);
    if (this.failWith) throw this.failWith;
    this.prepared.push(input);
    return {
      chainId: 91562037, submissionRegistryAddress: "0x0000000000000000000000000000000000000001",
      challengeId: `0x${"11".repeat(32)}`, solutionCommitment: `0x${"22".repeat(32)}`, abi: [], functionName: "submitProof", amountWei: String(input.amount * 1e15),
    };
  }
  async complete(input: ClaimInput & { txHash: string }): Promise<ClaimResult> {
    if (!this.configured) throw new ClaimError("BLOCKCHAIN_NOT_CONFIGURED", "blockchain not configured", 503);
    if (this.failWith) throw this.failWith;
    this.completed.push(input);
    return {
      onchainSubmissionId: `0x${"33".repeat(32)}`, verificationTx: `0x${"44".repeat(32)}`, rewardTx: `0x${"55".repeat(32)}`, rewardBlock: 7,
      contractAddress: "0x0000000000000000000000000000000000000002", amountWei: String(input.amount * 1e15), recipient: input.recipientAddress,
    };
  }
}

export class FakeChain implements BlockchainRewardProvider {
  canSend = false;
  sent: RewardInput[] = [];
  txStatus = new Map<string, TransactionStatus>();
  status(): ProviderStatus {
    return this.canSend
      ? { configured: true, canSend: true, canReadTransactions: true }
      : { configured: false, canSend: false, canReadTransactions: false, reason: "blockchain not configured" };
  }
  async sendReward(input: RewardInput) {
    if (!this.canSend) throw new BlockchainNotConfiguredError();
    this.sent.push(input);
    return { transactionHash: `0x${String(this.sent.length).padStart(64, "0")}` };
  }
  async getTransactionStatus(hash: string) { return this.txStatus.get(hash) ?? "pending"; }
}

export interface TestContext {
  baseUrl: string;
  db: Db;
  github: FakeGitHub;
  githubUser: FakeGitHubUser;
  claims: FakeClaims;
  chain: FakeChain;
  clock: { now: Date };
  config: AppConfig;
  services: ReturnType<typeof createApp>["services"];
  close(): Promise<void>;
  /** Creates a SECUREX user and returns a bearer token for it. */
  user(username: string, role?: "participant" | "platform_admin", opts?: { github?: boolean }): Promise<{ id: string; token: string; username: string }>;
  api(method: string, path: string, opts?: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: string }): Promise<{ status: number; body: any; headers: Headers }>;
}

export async function startTestApp(overrides: Partial<AppConfig> = {}): Promise<TestContext> {
  const { db, client } = await createTestDb();
  const github = new FakeGitHub();
  const githubUser = new FakeGitHubUser();
  const chain = new FakeChain();
  const claims = new FakeClaims();
  const clock = { now: new Date("2026-09-01T12:00:00.000Z") };
  const config: AppConfig = {
    ...loadConfig({ NODE_ENV: "test" }),
    signingSecret: "test-signing-secret-0123456789abcdef",
    ...overrides,
    github: { ...loadConfig({}).github, appId: "5112750", privateKeyPath: "/nonexistent", webhookSecret: "whsec-test", ...overrides.github },
    mst: { ...loadConfig({}).mst, network: "mst-testnet", ...overrides.mst },
  };
  const tokens = new Map<string, string>(); // token -> authUserId
  const authenticate = createAuthMiddleware({
    verify: async (token) => {
      const authUserId = tokens.get(token);
      if (!authUserId) throw new Error("invalid token");
      return { id: authUserId } as SupabaseUser;
    },
    findUser: async (authUserId) => {
      const [u] = await db.select().from(schema.users).where(eq(schema.users.authUserId, authUserId)).limit(1);
      return u;
    },
  });
  const { app, services } = createApp({
    db, config, github, githubUser, blockchain: chain, claims, authenticate,
    auth: {
      register: async (input) => ({ user: { username: input.username }, session: null, emailConfirmationRequired: true }),
      login: async (input) => {
        if (input.password !== "correct-password") throw new AuthServiceError("AUTH_INVALID_CREDENTIALS", "Invalid email or password", 401);
        return { user: { email: input.email }, session: { accessToken: "issued" } };
      },
      logout: async () => undefined,
      refresh: async (token) => {
        if (token !== "valid-refresh-token") throw new AuthServiceError("AUTH_REFRESH_FAILED", "Session expired; sign in again", 401);
        return { user: { email: "r@example.test" }, session: { accessToken: "new-access", refreshToken: "next-refresh" } };
      },
      publicUser: (u) => ({ id: u.id, username: u.username, role: u.role }),
    },
    now: () => clock.now,
    rateLimit: false,
    log: () => undefined,
  });
  const server: Server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let n = 0;
  return {
    baseUrl, db, github, githubUser, claims, chain, clock, config, services,
    async close() {
      await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
      await client.close();
    },
    async user(username, role = "participant", opts = {}) {
      n++;
      const authUserId = `auth-${username}-${n}`;
      const [u] = await db.insert(schema.users).values({
        authUserId, username, displayName: username, email: `${username}@example.test`, role,
        githubUsername: opts.github === false ? null : `gh-${username}`,
      }).returning();
      const token = `token-${username}-${n}`;
      tokens.set(token, authUserId);
      return { id: u!.id, token, username };
    },
    async api(method, path, opts = {}) {
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };
      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
      let body: string | undefined = opts.raw;
      if (opts.body !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(opts.body);
      }
      const res = await fetch(`${baseUrl}${path}`, { method, headers, body });
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* keep text */ }
      return { status: res.status, body: parsed, headers: res.headers };
    },
  };
}

/** Organization with an owner, plus a published challenge. */
export async function seedOrgWithChallenge(ctx: TestContext, overrides: Record<string, unknown> = {}) {
  const owner = await ctx.user(`owner${Math.random().toString(36).slice(2, 8)}`);
  const org = await ctx.api("POST", "/api/organizations", { token: owner.token, body: { name: `Org ${owner.username}` } });
  if (org.status !== 201) throw new Error(`org create failed ${org.status} ${JSON.stringify(org.body)}`);
  const orgId = org.body.data.id as string;
  const ch = await ctx.api("POST", "/api/org/challenges", {
    token: owner.token,
    headers: { "X-Organization-Id": orgId },
    body: {
      title: "The Poisoned Node",
      description: "Identify which RPC path should be quarantined after a poisoned node incident.",
      category: "Cloud / Infrastructure",
      difficulty: "Medium",
      challengeType: "investigation",
      verificationType: "rule_based",
      mstReward: 5,
      status: "published",
      challengeConfig: {
        shortDescription: "Quarantine the poisoned RPC path",
        questions: [
          { id: "q1", type: "multiple_choice", questionText: "Which node is poisoned?", options: [{ id: "A", text: "rpc-1" }, { id: "B", text: "rpc-2" }], correctAnswer: "B", points: 1 },
          { id: "q2", type: "short_answer", questionText: "What control stops a single-verifier failure?", points: 1 },
        ],
        acceptedAnswers: { q2: ["second verifier", "require a second verifier"] },
      },
      ...overrides,
    },
  });
  if (ch.status !== 201) throw new Error(`challenge create failed ${ch.status} ${JSON.stringify(ch.body)}`);
  return { owner, orgId, challengeId: ch.body.data.id as string, challenge: ch.body.data };
}

/** Polls the result endpoint until verification leaves Pending (automatic providers run asynchronously). */
export async function waitForResult(ctx: TestContext, token: string, submissionId: string) {
  for (let i = 0; i < 50; i++) {
    const r = await ctx.api("GET", `/api/submissions/${submissionId}/result`, { token });
    if (r.status !== 200 || r.body.data.status !== "Pending") return r;
    await new Promise((res) => setTimeout(res, 20));
  }
  return ctx.api("GET", `/api/submissions/${submissionId}/result`, { token });
}
