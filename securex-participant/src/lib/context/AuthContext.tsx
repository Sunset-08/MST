'use client';

// ============================================================
// SECUREX — Auth Context
// Single source of truth for the signed-in user. Identity comes from Supabase Auth via the backend;
// roles (participant / organization member / platform admin) are read from the backend, never from
// browser storage.
// ============================================================

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { fetchMe, loginAccount, logoutAccount, registerAccount, type RegisterInput } from '@/lib/api/auth';
import { clearSession, getSession, onSessionChange, setSession } from '@/lib/auth/session';
import type { Me } from '@/lib/types';

type Status = 'loading' | 'anonymous' | 'authenticated';

interface AuthContextValue {
  status: Status;
  /** True once the initial session check has finished. */
  isReady: boolean;
  me: Me | null;
  error: string | null;
  login: (email: string, password: string) => Promise<Me>;
  register: (input: RegisterInput) => Promise<{ emailConfirmationRequired: boolean; me: Me | null }>;
  logout: () => Promise<void>;
  /** Re-reads the profile (points, wallets, GitHub, organizations). */
  reload: () => Promise<Me | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<Promise<Me | null> | null>(null);

  const reload = useCallback((): Promise<Me | null> => {
    inflight.current ??= (async () => {
      if (!getSession()) {
        setMe(null);
        setStatus('anonymous');
        return null;
      }
      try {
        const profile = await fetchMe();
        setMe(profile);
        setStatus('authenticated');
        setError(null);
        return profile;
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.code === 'AUTH_PROFILE_NOT_FOUND')) {
          clearSession();
          setMe(null);
          setStatus('anonymous');
        } else {
          // Backend unreachable: keep the session, surface the problem.
          setError(err instanceof Error ? err.message : 'Unable to load your profile');
          setStatus(getSession() ? 'authenticated' : 'anonymous');
        }
        return null;
      }
    })().finally(() => {
      inflight.current = null;
    });
    return inflight.current;
  }, []);

  useEffect(() => {
    void reload();
    return onSessionChange(() => void reload());
  }, [reload]);

  const login = useCallback(async (email: string, password: string) => {
    const { session } = await loginAccount(email, password);
    setSession(session);
    const profile = await reload();
    if (!profile) throw new Error('Signed in, but your profile could not be loaded. Is the backend running?');
    return profile;
  }, [reload]);

  const register = useCallback(async (input: RegisterInput) => {
    const result = await registerAccount(input);
    if (result.session) {
      setSession(result.session);
      return { emailConfirmationRequired: false, me: await reload() };
    }
    return { emailConfirmationRequired: true, me: null };
  }, [reload]);

  const logout = useCallback(async () => {
    try {
      if (getSession()) await logoutAccount();
    } catch {
      /* token may already be expired; local sign-out still applies */
    }
    clearSession();
    setMe(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, isReady: status !== 'loading', me, error, login, register, logout, reload }),
    [status, me, error, login, register, logout, reload],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
