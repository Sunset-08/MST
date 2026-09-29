import type { LinkedWallet } from '@/lib/types';
import { apiDelete, apiGet, apiPost } from './client';

export interface WalletChallenge {
  address: string;
  message: string;
  nonce: string;
  expiresAt: string;
  challengeToken: string;
}

export const listWallets = () => apiGet<LinkedWallet[]>('/wallets');
export const requestWalletChallenge = (address: string) => apiPost<WalletChallenge>('/wallets/challenge', { address });
export const verifyWallet = (input: { address: string; signature: string; challengeToken: string }) =>
  apiPost<{ wallet: LinkedWallet; rewardsCreated: number }>('/wallets/verify', input);
export const makeWalletPrimary = (id: string) => apiPost<LinkedWallet>(`/wallets/${id}/primary`, {});
export const removeWallet = (id: string) => apiDelete<{ id: string; removed: boolean }>(`/wallets/${id}`);
