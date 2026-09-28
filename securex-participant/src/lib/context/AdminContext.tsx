'use client';

// ============================================================
// SECUREX — Admin Context
// Platform-level administrator state
//
// Follows the same pattern as OrgContext:
//   - Session persisted in localStorage (replace with NextAuth in prod)
//   - Mock data behind the same USE_MOCK toggle as other APIs
//   - Does NOT handle blockchain transactions (Member 4)
//   - Does NOT run verification engine (Member 3)
// ============================================================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import type { AdminUser } from '@/lib/types/admin';

// ----------------------------------------------------------
// Mock admin user
// TODO: Member 3 — replace with NextAuth 'admin' credentials provider
// ----------------------------------------------------------

const MOCK_ADMIN: AdminUser = {
  id: 'admin-platform-001',
  username: 'platform_admin',
  displayName: 'Platform Admin',
  email: 'admin@securex.platform',
  role: 'admin',
  createdAt: '2025-01-01T00:00:00Z',
};

// ----------------------------------------------------------
// Context shape
// ----------------------------------------------------------

interface AdminContextValue {
  admin: AdminUser | null;
  isLoading: boolean;
  isLoggedIn: boolean;

  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

// ----------------------------------------------------------
// Provider
// ----------------------------------------------------------

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Restore session on mount
  useEffect(() => {
    const stored = localStorage.getItem('sx_admin_session');
    if (stored) {
      try {
        setAdmin(JSON.parse(stored) as AdminUser);
      } catch {
        localStorage.removeItem('sx_admin_session');
      }
    }
  }, []);

  const login = useCallback(async (email: string, _password: string) => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 800)); // simulate API

    // TODO: Member 3 — replace with: signIn('admin-credentials', { email, password })
    // and verify role === 'admin' from the returned session token
    if (!email.includes('@')) {
      setIsLoading(false);
      throw new Error('Invalid email address');
    }

    const session: AdminUser = { ...MOCK_ADMIN, email };
    setAdmin(session);
    localStorage.setItem('sx_admin_session', JSON.stringify(session));
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    setAdmin(null);
    localStorage.removeItem('sx_admin_session');
  }, []);

  return (
    <AdminContext.Provider
      value={{
        admin,
        isLoading,
        isLoggedIn: admin !== null,
        login,
        logout,
      }}
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
