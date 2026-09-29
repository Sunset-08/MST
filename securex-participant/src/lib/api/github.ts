import { apiDelete, apiPost } from './client';

export interface GithubConnectStart {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  flowToken: string;
}

export type GithubConnectPoll =
  | { status: 'pending'; slowDown?: boolean }
  | { status: 'expired' }
  | { status: 'denied' }
  | { status: 'connected'; githubUsername: string };

export const startGithubConnect = () => apiPost<GithubConnectStart>('/github/connect/start', {});
export const pollGithubConnect = (flowToken: string) => apiPost<GithubConnectPoll>('/github/connect/poll', { flowToken });
export const disconnectGithub = () => apiDelete<{ disconnected: boolean }>('/github/connect');
