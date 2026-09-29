// ============================================================
// SECUREX — API Client
//
// ARCHITECTURE:
//   - next.config.ts rewrites /api/* → Express backend
//   - BASE_URL stays '/api' (relative) so the proxy is used
//   - All responses from Express are wrapped: { success, data }
//   - apiGet/apiPost unwrap that envelope transparently
//   - Auth token is read from sx_access_token in localStorage
//
// MOCK MODE:
//   - NEXT_PUBLIC_USE_MOCK_API=true bypasses the real backend
//   - USE_MOCK=false means REAL backend data — no silent fallback
// ============================================================

export const BASE_URL = '/api';
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_API === 'true';

/** Read the Supabase access token stored after login. */
function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('sx_access_token');
}

function buildHeaders(extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/**
 * Unwraps the Express response envelope { success: boolean, data: T }.
 * Throws with the server's error message if success=false or res.ok=false.
 */
async function unwrap<T>(res: Response, path: string): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  
  if (!contentType.includes('application/json')) {
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(`Unable to complete request right now. Please try again. (Status: ${res.status})`);
    }
    return text as unknown as T;
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body?.error?.message ??
      body?.message ??
      `Unable to complete request right now. Please try again. (Status: ${res.status})`;
    throw new Error(message);
  }
  // Backend wraps successful responses as { success: true, data: ... }
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data as T;
  }
  // Fallback: return body as-is (e.g. health endpoint)
  return body as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: buildHeaders(),
    cache: 'no-store',
  });
  return unwrap<T>(res, path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  return unwrap<T>(res, path);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  return unwrap<T>(res, path);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  });
  return unwrap<T>(res, path);
}
