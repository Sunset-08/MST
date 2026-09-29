'use client';

// ============================================================
// SECUREX — Admin Context
// Platform administrator state. Authorization is enforced by the backend (users.role = platform_admin);
// this context only mirrors it so the console can redirect.
// ============================================================

import React, { createContext, useCallback, useContext, useMemo } from 'react';
import type { AdminUser } from '@/lib/types/admin';
import { useAuth } from '@/lib/context/AuthContext';

interface AdminContextValue {
  admin: AdminUser | null;
  isReady: boolean;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  const admin = useMemo<AdminUser | null>(
    () =>
      auth.me && auth.me.role === 'platform_admin'
        ? { id: auth.me.id, username: auth.me.username, displayName: auth.me.displayName, email: auth.me.email, role: 'admin', createdAt: auth.me.createdAt }
        : null,
    [auth.me],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const me = await auth.login(email, password);
      if (me.role !== 'platform_admin') {
        await auth.logout();
        throw new Error('This account is not a platform administrator.');
      }
    },
    [auth],
  );

  return (
    <AdminContext.Provider
      value={{ admin, isReady: auth.isReady, isLoading: !auth.isReady, isLoggedIn: admin !== null, login, logout: auth.logout }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
}
