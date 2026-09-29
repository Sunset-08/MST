// ============================================================
// SECUREX — Auth API Service
//
// Handles:
//   - POST /api/auth/login   → stores token in localStorage
//   - POST /api/auth/register
//   - POST /api/auth/logout  → clears token
//   - GET  /api/auth/me      → returns current session user
//
// The Supabase access token is stored at 'sx_access_token' in
// localStorage so that apiGet/apiPost can read it automatically.
// ============================================================

import { BASE_URL } from './client';

const TOKEN_KEY = 'sx_access_token';
const REFRESH_KEY = 'sx_refresh_token';
const USER_KEY = 'sx_user';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  tokenType: string;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  githubUsername: string | null;
  role: 'participant' | 'platform_admin';
  points: number;
  reputation: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LoginResponse {
  user: AuthUser;
  session: AuthSession;
}

interface RegisterResponse {
  user: AuthUser | null;
  session: AuthSession | null;
  emailConfirmationRequired: boolean;
}

async function authPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Unable to complete request right now. Please try again. (Status: ${res.status})`);
  }

  const envelope = await res.json();
  if (!res.ok || !envelope.success) {
    const msg = envelope?.error?.message ?? envelope?.message ?? `Request failed with status ${res.status}`;
    throw new Error(msg);
  }
  return envelope.data as T;
}

export async function authLogin(email: string, password: string): Promise<LoginResponse> {
  const result = await authPost<LoginResponse>('/auth/login', { email, password });
  if (result.session) {
    localStorage.setItem(TOKEN_KEY, result.session.accessToken);
    localStorage.setItem(REFRESH_KEY, result.session.refreshToken);
  }
  if (result.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
  }
  return result;
}

export async function authRegister(
  email: string,
  password: string,
  username: string,
  displayName: string,
): Promise<RegisterResponse> {
  const result = await authPost<RegisterResponse>('/auth/register', {
    email,
    password,
    username,
    displayName,
  });
  if (result.session) {
    localStorage.setItem(TOKEN_KEY, result.session.accessToken);
    localStorage.setItem(REFRESH_KEY, result.session.refreshToken);
  }
  if (result.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
  }
  return result;
}

export async function authLogout(): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    // Best-effort logout — don't throw if it fails
    fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    }).catch(() => undefined);
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getStoredToken());
}
