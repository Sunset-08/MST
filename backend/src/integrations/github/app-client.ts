import { readFileSync } from "node:fs";
import type { App } from "octokit";
import type { AppConfig } from "../../config/env.js";
import { AppError, unavailable } from "../../utils/http.js";
import type {
  GitHubAccount,
  GitHubAppClient,
  GitHubAppInfo,
  GitHubInstallation,
  GitHubIssueData,
  GitHubRepositoryData,
} from "./types.js";

/** Caps a single sync so one request cannot page through unbounded data. */
const MAX_PAGES = 10;

type AnyRecord = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function toAccount(account: AnyRecord | null | undefined): GitHubAccount {
  if (!account) throw new AppError(502, "GITHUB_API_ERROR", "GitHub installation has no account");
  return {
    id: str(account.id),
    login: str(account.login ?? account.slug),
    type: str(account.type ?? "Enterprise"),
    name: str(account.name ?? account.login ?? account.slug),
    htmlUrl: (account.html_url as string | undefined) ?? null,
  };
}

interface OctokitRequestError { name: string; status: number; response?: { headers?: Record<string, string | undefined> } }
const isRequestError = (e: unknown): e is OctokitRequestError =>
  typeof e === "object" && e !== null && (e as { name?: unknown }).name === "HttpError" && typeof (e as { status?: unknown }).status === "number";

/** Translates Octokit errors into safe API errors (never includes tokens or raw upstream bodies). */
export function mapGitHubError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (isRequestError(error)) {
    const remaining = error.response?.headers?.["x-ratelimit-remaining"];
    if (error.status === 404) return new AppError(404, "GITHUB_NOT_FOUND", "GitHub resource not found or not accessible to the securexMST app");
    if (error.status === 401) return new AppError(502, "GITHUB_AUTH_FAILED", "GitHub App authentication failed; check GITHUB_APP_ID and the private key");
    if (error.status === 403 || error.status === 429) {
      if (remaining === "0" || error.status === 429) return new AppError(503, "GITHUB_RATE_LIMITED", "GitHub API rate limit reached; retry later");
      return new AppError(502, "GITHUB_PERMISSION_DENIED", "The securexMST app lacks the permission required for this GitHub request");
    }
    return new AppError(502, "GITHUB_API_ERROR", `GitHub API request failed (HTTP ${error.status})`);
  }
  return new AppError(502, "GITHUB_API_ERROR", "GitHub API request failed");
}

export class OctokitGitHubAppClient implements GitHubAppClient {
  private app?: Promise<App>;

  constructor(private readonly config: AppConfig["github"]) {}

  isConfigured(): boolean {
    return Boolean(this.config.appId && (this.config.privateKey || this.config.privateKeyPath));
  }

  /** Octokit is ESM-only; it is loaded on first use through a dynamic import. */
  private getAppInstance(): Promise<App> {
    this.app ??= this.createApp();
    this.app.catch(() => { this.app = undefined; });
    return this.app;
  }

  private async createApp(): Promise<App> {
    const { appId, privateKeyPath, apiUrl, apiVersion } = this.config;
    if (!appId || !(this.config.privateKey || privateKeyPath)) {
      throw unavailable("GITHUB_NOT_CONFIGURED", "GitHub App is not configured (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH)");
    }
    let privateKey: string;
    if (this.config.privateKey) {
      privateKey = this.config.privateKey;
    } else {
      try {
        privateKey = readFileSync(privateKeyPath!, "utf8");
      } catch {
        throw unavailable("GITHUB_NOT_CONFIGURED", "GitHub App private key file could not be read");
      }
    }
    if (!/-----BEGIN (RSA )?PRIVATE KEY-----/.test(privateKey)) {
      throw unavailable("GITHUB_NOT_CONFIGURED", "GitHub App private key is not a PEM private key");
    }
    const { App: OctokitApp, Octokit } = await import("octokit");
    const Client = Octokit.defaults({
      baseUrl: apiUrl,
      headers: { "x-github-api-version": apiVersion },
      throttle: {
        onRateLimit: (_after: number, _opts: unknown, _octokit: unknown, retryCount: number) => retryCount < 1,
        onSecondaryRateLimit: () => false,
      },
    });
    // @octokit/app caches installation tokens in memory and refreshes them before expiry.
    return new OctokitApp({ appId, privateKey, Octokit: Client });
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw mapGitHubError(error);
    }
  }

  getApp(): Promise<GitHubAppInfo> {
    return this.call(async () => {
      const { data } = await (await this.getAppInstance()).octokit.request("GET /app");
      const app = data as AnyRecord;
      return { id: str(app.id), slug: str(app.slug), name: str(app.name), htmlUrl: str(app.html_url) };
    });
  }

  getInstallation(installationId: string): Promise<GitHubInstallation> {
    return this.call(async () => {
      const { data } = await (await this.getAppInstance()).octokit.request("GET /app/installations/{installation_id}", {
        installation_id: Number(installationId),
      });
      const inst = data as unknown as AnyRecord;
      return {
        id: str(inst.id),
        account: toAccount(inst.account as AnyRecord),
        repositorySelection: (inst.repository_selection as string | undefined) ?? null,
        permissions: (inst.permissions as Record<string, string> | undefined) ?? {},
        createdAt: (inst.created_at as string | undefined) ?? null,
        suspendedAt: (inst.suspended_at as string | undefined) ?? null,
      };
    });
  }

  listInstallationRepositories(installationId: string): Promise<GitHubRepositoryData[]> {
    return this.call(async () => {
      const octokit = await (await this.getAppInstance()).getInstallationOctokit(Number(installationId));
      const repos: GitHubRepositoryData[] = [];
      let page = 0;
      for await (const response of octokit.paginate.iterator("GET /installation/repositories", { per_page: 100 })) {
        for (const r of response.data as unknown as AnyRecord[]) {
          repos.push({
            id: str(r.id),
            name: str(r.name),
            fullName: str(r.full_name),
            owner: str((r.owner as AnyRecord | undefined)?.login),
            url: str(r.html_url),
            defaultBranch: str(r.default_branch || "main"),
            archived: Boolean(r.archived),
            private: Boolean(r.private),
          });
        }
        if (++page >= MAX_PAGES) break;
      }
      return repos;
    });
  }

  listRepositoryIssues(installationId: string, owner: string, repo: string, since?: Date): Promise<GitHubIssueData[]> {
    return this.call(async () => {
      const octokit = await (await this.getAppInstance()).getInstallationOctokit(Number(installationId));
      const issues: GitHubIssueData[] = [];
      let page = 0;
      for await (const response of octokit.paginate.iterator("GET /repos/{owner}/{repo}/issues", {
        owner,
        repo,
        state: "all",
        per_page: 100,
        ...(since ? { since: since.toISOString() } : {}),
      })) {
        for (const i of response.data as unknown as AnyRecord[]) {
          if (i.pull_request) continue; // the issues endpoint also returns pull requests
          issues.push(normalizeIssue(i));
        }
        if (++page >= MAX_PAGES) break;
      }
      return issues;
    });
  }
}

/** Normalizes a GitHub REST/webhook issue object. */
export function normalizeIssue(i: AnyRecord): GitHubIssueData {
  const labels = Array.isArray(i.labels)
    ? (i.labels as unknown[]).map((l) => (typeof l === "string" ? l : str((l as AnyRecord)?.name))).filter(Boolean)
    : [];
  return {
    id: str(i.id),
    number: Number(i.number),
    title: str(i.title).slice(0, 1000),
    body: typeof i.body === "string" ? i.body.slice(0, 65_536) : null,
    author: ((i.user as AnyRecord | undefined)?.login as string | undefined) ?? null,
    url: str(i.html_url),
    state: str(i.state || "open"),
    labels,
    createdAt: str(i.created_at),
    updatedAt: str(i.updated_at),
  };
}
