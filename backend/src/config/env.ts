import { existsSync } from "node:fs";

/**
 * Typed, read-once configuration. Secrets stay in this module's return value and are never
 * serialized: use `safeConfigReport` for anything that leaves the process.
 */
export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  corsOrigins: string[] | "*";
  /** HMAC secret for wallet-link challenges and GitHub install state. */
  signingSecret?: string;
  publicAppUrl?: string;
  github: {
    appId?: string;
    appName?: string;
    privateKeyPath?: string;
    webhookSecret?: string;
    apiUrl: string;
    apiVersion: string;
  };
  mst: {
    network?: string;
    rpcUrl?: string;
    chainId?: number;
    tokenContractAddress?: string;
    rewardContractAddress?: string;
    rewardContractAbi?: string;
    explorerUrl?: string;
  };
}

const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = clean(env.NODE_ENV) ?? "development";
  const origins = clean(env.CORS_ORIGINS);
  const chainId = clean(env.MST_CHAIN_ID);
  return {
    nodeEnv,
    isProduction: nodeEnv === "production",
    port: Number(clean(env.PORT) ?? 4000),
    corsOrigins: origins ? origins.split(",").map((o) => o.trim()).filter(Boolean) : "*",
    signingSecret: clean(env.APP_SIGNING_SECRET),
    publicAppUrl: clean(env.PUBLIC_APP_URL),
    github: {
      appId: clean(env.GITHUB_APP_ID),
      appName: clean(env.GITHUB_APP_NAME),
      privateKeyPath: clean(env.GITHUB_APP_PRIVATE_KEY_PATH),
      webhookSecret: clean(env.GITHUB_WEBHOOK_SECRET),
      apiUrl: clean(env.GITHUB_API_URL) ?? "https://api.github.com",
      apiVersion: clean(env.GITHUB_API_VERSION) ?? "2022-11-28",
    },
    mst: {
      network: clean(env.MST_NETWORK),
      rpcUrl: clean(env.MST_RPC_URL),
      chainId: chainId && /^\d+$/.test(chainId) ? Number(chainId) : undefined,
      tokenContractAddress: clean(env.MST_TOKEN_CONTRACT_ADDRESS),
      rewardContractAddress: clean(env.MST_REWARD_CONTRACT_ADDRESS),
      rewardContractAbi: clean(env.MST_REWARD_CONTRACT_ABI),
      explorerUrl: clean(env.MST_EXPLORER_URL),
    },
  };
}

export function isGithubAppConfigured(config: AppConfig): boolean {
  const { appId, privateKeyPath } = config.github;
  return Boolean(appId && privateKeyPath && existsSync(privateKeyPath));
}

/** Non-secret configuration state, safe to return from admin settings endpoints. */
export function safeConfigReport(config: AppConfig) {
  return {
    environment: config.nodeEnv,
    github: {
      appConfigured: isGithubAppConfigured(config),
      appId: config.github.appId ?? null,
      appName: config.github.appName ?? null,
      privateKeyConfigured: Boolean(config.github.privateKeyPath && existsSync(config.github.privateKeyPath)),
      webhookSecretConfigured: Boolean(config.github.webhookSecret),
      apiUrl: config.github.apiUrl,
      apiVersion: config.github.apiVersion,
    },
    blockchain: {
      network: config.mst.network ?? null,
      chainId: config.mst.chainId ?? null,
      rpcConfigured: Boolean(config.mst.rpcUrl),
      rewardContractConfigured: Boolean(config.mst.rewardContractAddress && config.mst.rewardContractAbi),
      tokenContractConfigured: Boolean(config.mst.tokenContractAddress),
      explorerUrl: config.mst.explorerUrl ?? null,
    },
    walletLinking: { configured: Boolean(config.signingSecret) },
  };
}
