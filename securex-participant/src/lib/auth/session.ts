// Session persistence for the Supabase tokens returned by the SECUREX backend.
// Stored in localStorage (survives reloads); never contains passwords.

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds. */
  expiresAt: number | null;
  tokenType?: string;
}

const KEY = 'sx_session';
const EVENT = 'sx:session-changed';

export function getSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed?.accessToken && parsed?.refreshToken ? parsed : null;
  } catch {
    return null;
  }
}

export function setSession(session: StoredSession): void {
  window.localStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(EVENT));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function onSessionChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb); // other tabs
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}
