// ============================================================
// SECUREX — API client
// Talks to the SECUREX backend. All responses are `{ success, data }` or `{ success: false, error }`.
// The Supabase access token lives in localStorage; it is refreshed automatically before it expires
// and once more when the backend answers 401.
// ============================================================

import { clearSession, getSession, setSession, type StoredSession } from '@/lib/auth/session';

// The backend mounts every route under /api (e.g. /api/auth/login). Accept either the
// bare origin (https://mst-2krf.onrender.com) or a URL that already ends in /api.
const RAW_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(/\/+$/, '');
export const BASE_URL = RAW_BASE_URL.endsWith('/api') ? RAW_BASE_URL : `${RAW_BASE_URL}/api`;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let organizationId: string | null = null;
/** Sets the organization sent as X-Organization-Id on organization-portal calls. */
export function setActiveOrganization(id: string | null) {
  organizationId = id;
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

interface RequestOptions {
  body?: unknown;
  /** Send the bearer token (default true when a session exists). */
  auth?: boolean;
  org?: boolean;
  signal?: AbortSignal;
}

let refreshing: Promise<StoredSession | null> | null = null;

async function rawFetch<T>(method: string, path: string, opts: RequestOptions, token: string | null) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token && opts.auth !== false) headers.Authorization = `Bearer ${token}`;
  if (opts.org && organizationId) headers['X-Organization-Id'] = organizationId;
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: 'no-store',
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the DevArena API. Is the backend running?');
  }
  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    /* non-JSON response */
  }
  return { res, json };
}

/** Exchanges the refresh token for a new session (single-flight). */
export function refreshSession(): Promise<StoredSession | null> {
  const current = getSession();
  if (!current?.refreshToken) return Promise.resolve(null);
  refreshing ??= (async () => {
    const { res, json } = await rawFetch<{ session: StoredSession }>('POST', '/auth/refresh', {
      body: { refreshToken: current.refreshToken },
      auth: false,
    }, null);
    if (!res.ok || !json?.success || !json.data?.session) {
      clearSession();
      return null;
    }
    setSession(json.data.session);
    return json.data.session;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  let session = getSession();
  // Refresh a token that is about to expire.
  if (session && opts.auth !== false && session.expiresAt && session.expiresAt * 1000 - Date.now() < 60_000) {
    session = (await refreshSession()) ?? null;
  }
  let { res, json } = await rawFetch<T>(method, path, opts, session?.accessToken ?? null);
  if (res.status === 401 && session && opts.auth !== false && !path.startsWith('/auth/')) {
    const renewed = await refreshSession();
    if (renewed) ({ res, json } = await rawFetch<T>(method, path, opts, renewed.accessToken));
  }
  if (!res.ok || !json || json.success === false) {
    const err = json?.error;
    throw new ApiError(res.status, err?.code ?? 'REQUEST_FAILED', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return json.data as T;
}

export const apiGet = <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts);
export const apiPost = <T>(path: string, body: unknown = {}, opts?: RequestOptions) => request<T>('POST', path, { ...opts, body });
export const apiPut = <T>(path: string, body: unknown, opts?: RequestOptions) => request<T>('PUT', path, { ...opts, body });
export const apiDelete = <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts);

/** GET that also returns response headers (used for X-Total-Count). */
export async function apiGetWithHeaders<T>(path: string, opts: RequestOptions = {}): Promise<{ data: T; headers: Headers }> {
  const session = getSession();
  const { res, json } = await rawFetch<T>('GET', path, opts, session?.accessToken ?? null);
  if (!res.ok || !json || json.success === false) {
    throw new ApiError(res.status, json?.error?.code ?? 'REQUEST_FAILED', json?.error?.message ?? `Request failed (${res.status})`);
  }
  return { data: json.data as T, headers: res.headers };
}

export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Human-readable message for any thrown value. */
/** Turns API validation details ([{ path, message }]) into "field: reason" so users can see what to fix. */
function validationSummary(details: unknown): string {
  if (!Array.isArray(details)) return '';
  const parts = details
    .slice(0, 3)
    .map((d) => {
      const item = d as { path?: unknown[]; message?: string };
      const field = Array.isArray(item.path) ? item.path.join('.') : '';
      return field ? `${field}: ${item.message ?? 'invalid'}` : (item.message ?? '');
    })
    .filter(Boolean);
  return parts.length ? ` (${parts.join('; ')})` : '';
}

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) return `${err.message}${validationSummary(err.details)}`;
  if (err instanceof Error) return err.message;
  return fallback;
}
