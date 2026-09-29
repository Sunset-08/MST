'use client';

// ============================================================
// SECUREX — Organization Context
// Member 2 — Organization Side Add-On
//
// Manages:
//   - Authenticated org admin state
//   - Organization MST payment status (display only — no blockchain)
//   - Challenge draft lifecycle
//
// Does NOT:
//   - Execute blockchain transactions (Member 4)
//   - Verify submissions (Member 3)
// ============================================================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import type {
  OrgAdmin,
  Organization,
  OrgWallet,
  ChallengeDraft,
} from '@/lib/types/org';
import { createEmptyDraft } from '@/lib/types/org';
import { authLogin, authLogout } from '@/lib/api/auth';

// ----------------------------------------------------------
// Mock: platform-configurable minimum MST requirement
// In production this comes from backend / platform admin config
// ----------------------------------------------------------

const PLATFORM_MIN_MST_REQUIREMENT = 10; // 10 MSTC minimum

// ----------------------------------------------------------
// Mock Org Admin (replace with real auth session in prod)
// ----------------------------------------------------------

const MOCK_ORG: Organization = {
  id: 'org-demo-001',
  name: 'AcmeCorp Security',
  slug: 'acmecorp-security',
  description: 'Security-first software company specializing in Web3 infrastructure.',
  website: 'https://acmecorp.example.com',
  wallet: undefined,
  createdAt: '2025-06-01T10:00:00Z',
};

const MOCK_ORG_ADMIN: OrgAdmin = {
  id: 'admin-001',
  username: 'orgadmin',
  displayName: 'Alex (Org Admin)',
  email: 'admin@acmecorp.example.com',
  role: 'owner',
  organization: MOCK_ORG,
};

// ----------------------------------------------------------
// Context shape
// ----------------------------------------------------------

interface OrgContextValue {
  admin: OrgAdmin | null;
  organization: Organization | null;
  wallet: OrgWallet | null;
  isLoading: boolean;
  isLoggedIn: boolean;

  // Auth
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;

  // Wallet Actions (UI triggers only — actual tx owned by Member 4)
  connectWallet: (walletAddress: string) => Promise<void>;
  disconnectWallet: () => void;

  // Challenge Draft
  draft: ChallengeDraft;
  updateDraft: (patch: Partial<ChallengeDraft>) => void;
  resetDraft: () => void;
  publishChallenge: () => Promise<{ success: boolean; challengeId?: string }>;
}

const OrgContext = createContext<OrgContextValue | null>(null);

// ----------------------------------------------------------
// Provider
// ----------------------------------------------------------

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<OrgAdmin | null>(null);
  const [wallet, setWallet] = useState<OrgWallet | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [draft, setDraft] = useState<ChallengeDraft>(createEmptyDraft());

  // Restore session from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('sx_org_session');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as OrgAdmin;
        setAdmin(parsed);
        setWallet(parsed.organization.wallet || null);
      } catch {
        localStorage.removeItem('sx_org_session');
      }
    }
  }, []);

  // ----------------------------------------------------------
  // Auth
  // ----------------------------------------------------------

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await authLogin(email, password);
      // For now, any successful login from the org portal maps them to the mock organization.
      // (Backend does not currently return organization mapping).
      const session = { ...MOCK_ORG_ADMIN, email: res.user.email, id: res.user.id, displayName: res.user.displayName };
      setAdmin(session);
      setWallet(session.organization.wallet || null);
      localStorage.setItem('sx_org_session', JSON.stringify(session));
    } catch (err) {
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setAdmin(null);
    setWallet(null);
    localStorage.removeItem('sx_org_session');
    authLogout();
  }, []);

  // ----------------------------------------------------------
  // Wallet Connection
  // ----------------------------------------------------------

  const connectWallet = useCallback(async (walletAddress: string) => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 800));

    const newWallet: OrgWallet = {
      address: walletAddress,
      isConnected: true,
      network: 'Testnet',
    };

    setWallet(newWallet);
    setAdmin((a) =>
      a ? { ...a, organization: { ...a.organization, wallet: newWallet } } : a,
    );

    setIsLoading(false);
  }, []);

  const disconnectWallet = useCallback(() => {
    setWallet(null);
    setAdmin((a) =>
      a ? { ...a, organization: { ...a.organization, wallet: undefined } } : a,
    );
  }, []);

  // ----------------------------------------------------------
  // Challenge Draft
  // ----------------------------------------------------------

  const updateDraft = useCallback((patch: Partial<ChallengeDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetDraft = useCallback(() => {
    setDraft(createEmptyDraft());
  }, []);

  const publishChallenge = useCallback(async (): Promise<{
    success: boolean;
    challengeId?: string;
  }> => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 1200));

    // TODO: Member 3 — POST /api/org/challenges with draft payload
    const challengeId = 'ch-' + Math.random().toString(36).slice(2, 10);
    setDraft(createEmptyDraft());
    setIsLoading(false);
    return { success: true, challengeId };
  }, []);

  // ----------------------------------------------------------
  // Derived
  // ----------------------------------------------------------

  const organization = admin?.organization ?? null;
  const isLoggedIn = admin !== null;

  return (
    <OrgContext.Provider
      value={{
        admin,
        organization,
        wallet,
        isLoading,
        isLoggedIn,
        login,
        logout,
        connectWallet,
        disconnectWallet,
        draft,
        updateDraft,
        resetDraft,
        publishChallenge,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
