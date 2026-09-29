import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { users } from "../db/schema.js";
import { decryptJson, encryptJson } from "../utils/crypto.js";
import { badRequest, conflict, parse, unavailable } from "../utils/http.js";
import type { ServiceDeps } from "./deps.js";

const TTL_FALLBACK_MS = 15 * 60_000;

export const pollSchema = z.object({ flowToken: z.string().min(20).max(4096) }).strict();

interface FlowState { purpose: "github_connect"; uid: string; deviceCode: string; exp: number }

/**
 * Lets a participant prove ownership of a GitHub account with the OAuth device flow. The device code stays
 * in an encrypted token the client cannot read; the resulting user token is used once to read the login
 * name and is never stored.
 */
export class GitHubConnectService {
  constructor(private readonly deps: ServiceDeps) {}

  private secret(): string {
    const s = this.deps.config.signingSecret;
    if (!s) throw unavailable("SIGNING_NOT_CONFIGURED", "APP_SIGNING_SECRET is required to connect GitHub accounts");
    return s;
  }

  async start(user: { id: string }) {
    const secret = this.secret();
    if (!this.deps.githubUser.isConfigured()) {
      throw unavailable("GITHUB_OAUTH_NOT_CONFIGURED", "GitHub account connection is not configured (GITHUB_APP_CLIENT_ID)");
    }
    const flow = await this.deps.githubUser.start();
    const exp = this.deps.now().getTime() + (flow.expiresIn ? flow.expiresIn * 1000 : TTL_FALLBACK_MS);
    return {
      userCode: flow.userCode,
      verificationUri: flow.verificationUri,
      expiresIn: flow.expiresIn,
      interval: flow.interval,
      flowToken: encryptJson(secret, { purpose: "github_connect", uid: user.id, deviceCode: flow.deviceCode, exp }),
    };
  }

  async poll(user: { id: string }, body: unknown) {
    const secret = this.secret();
    const { flowToken } = parse(pollSchema, body);
    const state = decryptJson<FlowState>(secret, flowToken);
    if (!state || state.purpose !== "github_connect" || state.uid !== user.id) throw badRequest("INVALID_FLOW", "Invalid GitHub connection request");
    if (state.exp <= this.deps.now().getTime()) return { status: "expired" as const };

    const result = await this.deps.githubUser.poll(state.deviceCode);
    if (result.status === "pending") return { status: "pending" as const, slowDown: Boolean(result.slowDown) };
    if (result.status !== "authorized") return { status: result.status };

    const profile = await this.deps.githubUser.getUser(result.accessToken);
    const login = profile.login;
    return this.deps.db.transaction(async (tx) => {
      const [taken] = await tx.select({ id: users.id }).from(users)
        .where(and(sql`lower(${users.githubUsername}) = lower(${login})`, ne(users.id, user.id))).limit(1);
      if (taken) throw conflict("GITHUB_ACCOUNT_LINKED", "This GitHub account is already connected to another SECUREX user");
      await tx.update(users).set({ githubUsername: login, updatedAt: this.deps.now() }).where(eq(users.id, user.id));
      return { status: "connected" as const, githubUsername: login, githubId: profile.id };
    });
  }

  async disconnect(user: { id: string }) {
    await this.deps.db.update(users).set({ githubUsername: null, updatedAt: this.deps.now() }).where(eq(users.id, user.id));
    return { disconnected: true };
  }
}
