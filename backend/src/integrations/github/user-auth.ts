import { AppError, unavailable } from "../../utils/http.js";

export interface DeviceFlowStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export type DeviceFlowPoll =
  | { status: "pending"; slowDown?: boolean }
  | { status: "expired" }
  | { status: "denied" }
  | { status: "authorized"; accessToken: string };

export interface GitHubUserProfile {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

/** Proves that a person controls a GitHub account (official OAuth device flow; no client secret required). */
export interface GitHubUserAuth {
  isConfigured(): boolean;
  start(): Promise<DeviceFlowStart>;
  poll(deviceCode: string): Promise<DeviceFlowPoll>;
  getUser(accessToken: string): Promise<GitHubUserProfile>;
}

interface Options { clientId?: string; apiUrl: string; apiVersion: string; fetchImpl?: typeof fetch }

const OAUTH_BASE = "https://github.com";

export class GitHubDeviceFlowAuth implements GitHubUserAuth {
  constructor(private readonly options: Options) {}

  isConfigured() {
    return Boolean(this.options.clientId);
  }

  private get fetch() {
    return this.options.fetchImpl ?? fetch;
  }

  private clientId(): string {
    if (!this.options.clientId) throw unavailable("GITHUB_OAUTH_NOT_CONFIGURED", "GitHub account connection is not configured (GITHUB_APP_CLIENT_ID)");
    return this.options.clientId;
  }

  private async post(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await this.fetch(`${OAUTH_BASE}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "securex-backend" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => { throw new AppError(502, "GITHUB_API_ERROR", "Could not reach GitHub"); });
    if (!res.ok) throw new AppError(502, "GITHUB_API_ERROR", `GitHub request failed (HTTP ${res.status})`);
    return (await res.json()) as Record<string, unknown>;
  }

  async start(): Promise<DeviceFlowStart> {
    const data = await this.post("/login/device/code", { client_id: this.clientId() });
    if (data.error) {
      if (data.error === "device_flow_disabled") {
        throw unavailable("GITHUB_DEVICE_FLOW_DISABLED", "Enable 'Device Flow' in the GitHub App settings to allow account connection");
      }
      throw new AppError(502, "GITHUB_API_ERROR", "GitHub rejected the connection request");
    }
    return {
      deviceCode: String(data.device_code),
      userCode: String(data.user_code),
      verificationUri: String(data.verification_uri),
      expiresIn: Number(data.expires_in ?? 900),
      interval: Number(data.interval ?? 5),
    };
  }

  async poll(deviceCode: string): Promise<DeviceFlowPoll> {
    const data = await this.post("/login/oauth/access_token", {
      client_id: this.clientId(),
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (typeof data.access_token === "string") return { status: "authorized", accessToken: data.access_token };
    switch (data.error) {
      case "authorization_pending": return { status: "pending" };
      case "slow_down": return { status: "pending", slowDown: true };
      case "expired_token": return { status: "expired" };
      case "access_denied": return { status: "denied" };
      default: throw new AppError(502, "GITHUB_API_ERROR", "GitHub could not complete the connection");
    }
  }

  async getUser(accessToken: string): Promise<GitHubUserProfile> {
    const res = await this.fetch(`${this.options.apiUrl}/user`, {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${accessToken}`, "X-GitHub-Api-Version": this.options.apiVersion, "User-Agent": "securex-backend" },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => { throw new AppError(502, "GITHUB_API_ERROR", "Could not reach GitHub"); });
    if (!res.ok) throw new AppError(502, "GITHUB_API_ERROR", `GitHub request failed (HTTP ${res.status})`);
    const u = (await res.json()) as Record<string, unknown>;
    return { id: String(u.id), login: String(u.login), name: (u.name as string | null) ?? null, avatarUrl: (u.avatar_url as string | null) ?? null };
  }
}
