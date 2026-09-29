import type { StoredSession } from '@/lib/auth/session';
import { apiGet, apiPost } from './client';
import type { Me } from '@/lib/types';

export interface RegisterInput {
  email: string;
  password: string;
  username: string;
  displayName: string;
}

export interface RegisterResult {
  session: StoredSession | null;
  emailConfirmationRequired: boolean;
}

export const registerAccount = (input: RegisterInput) => apiPost<RegisterResult>('/auth/register', input, { auth: false });
export const loginAccount = (email: string, password: string) =>
  apiPost<{ session: StoredSession }>('/auth/login', { email, password }, { auth: false });
export const logoutAccount = () => apiPost<{ message: string }>('/auth/logout', {});
export const fetchMe = () => apiGet<Me>('/users/me');
