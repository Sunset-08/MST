export interface GitHubAccount {
  id: string;
  login: string;
  type: string;
  name: string;
  htmlUrl: string | null;
}

export interface GitHubInstallation {
  id: string;
  account: GitHubAccount;
  repositorySelection: string | null;
  permissions: Record<string, string>;
  createdAt: string | null;
  suspendedAt: string | null;
}

export interface GitHubRepositoryData {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  url: string;
  defaultBranch: string;
  archived: boolean;
  private: boolean;
}

export interface GitHubIssueData {
  id: string;
  number: number;
  title: string;
  body: string | null;
  author: string | null;
  url: string;
  state: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GitHubAppInfo {
  id: string;
  slug: string;
  name: string;
  htmlUrl: string;
}

/** What SECUREX needs from the GitHub App. Implemented with Octokit; faked in tests. */
export interface GitHubAppClient {
  isConfigured(): boolean;
  getApp(): Promise<GitHubAppInfo>;
  getInstallation(installationId: string): Promise<GitHubInstallation>;
  listInstallationRepositories(installationId: string): Promise<GitHubRepositoryData[]>;
  listRepositoryIssues(installationId: string, owner: string, repo: string, since?: Date): Promise<GitHubIssueData[]>;
}
