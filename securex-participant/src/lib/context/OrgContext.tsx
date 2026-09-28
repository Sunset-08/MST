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
  OrgMstStatus,
  ChallengeDraft,
} from '@/lib/types/org';
import { createEmptyDraft } from '@/lib/types/org';

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
  mstStatus: {
    minimumRequired: PLATFORM_MIN_MST_REQUIREMENT,
    amountPaid: 0,
    paymentStatus: 'PAYMENT_REQUIRED',
    walletAddress: undefined,
    transactionHash: undefined,
    lastUpdatedAt: new Date().toISOString(),
  },
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
  mstStatus: OrgMstStatus | null;
  isLoading: boolean;
  isLoggedIn: boolean;

  // Auth
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;

  // MST Actions (UI triggers only — actual tx owned by Member 4)
  initiatePayment: (walletAddress: string) => Promise<void>;
  refreshMstStatus: () => Promise<void>;

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
  const [mstStatus, setMstStatus] = useState<OrgMstStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [draft, setDraft] = useState<ChallengeDraft>(createEmptyDraft());

  // Restore session from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('sx_org_session');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as OrgAdmin;
        setAdmin(parsed);
        setMstStatus(parsed.organization.mstStatus);
      } catch {
        localStorage.removeItem('sx_org_session');
      }
    }
  }, []);

  // ----------------------------------------------------------
  // Auth
  // ----------------------------------------------------------

  const login = useCallback(async (email: string, _password: string) => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 900)); // simulate API round-trip

    // TODO: Member 3 — replace with real NextAuth org-credentials provider
    // For now: any @org email uses mock admin
    if (!email.includes('@')) {
      setIsLoading(false);
      throw new Error('Invalid email');
    }

    const session = { ...MOCK_ORG_ADMIN, email };
    setAdmin(session);
    setMstStatus(session.organization.mstStatus);
    localStorage.setItem('sx_org_session', JSON.stringify(session));
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    setAdmin(null);
    setMstStatus(null);
    localStorage.removeItem('sx_org_session');
  }, []);

  // ----------------------------------------------------------
  // MST Status
  // Member 2 only displays state returned from backend/Member 4.
  // initiatePayment just sets state to PENDING_PAYMENT so the
  // UI can show "Awaiting confirmation" — the actual blockchain
  // transaction is Member 4's responsibility.
  // ----------------------------------------------------------

  const initiatePayment = useCallback(async (walletAddress: string) => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 800));

    setMstStatus((prev) =>
      prev
        ? {
            ...prev,
            walletAddress,
            paymentStatus: 'PAYMENT_PROCESSING',
            lastUpdatedAt: new Date().toISOString(),
          }
        : prev,
    );

    // Simulate backend confirming payment after a delay
    // In production: Member 4 webhook updates this status
    setTimeout(() => {
      setMstStatus((prev) => {
        if (!prev) return prev;
        const confirmed: OrgMstStatus = {
          ...prev,
          amountPaid: prev.minimumRequired,
          paymentStatus: 'PAYMENT_CONFIRMED',
          transactionHash: '0xdemo' + Math.random().toString(16).slice(2, 18),
          lastUpdatedAt: new Date().toISOString(),
        };
        // Persist into local admin copy
        setAdmin((a) =>
          a ? { ...a, organization: { ...a.organization, mstStatus: confirmed } } : a,
        );
        return confirmed;
      });
    }, 3500);

    setIsLoading(false);
  }, []);

  const refreshMstStatus = useCallback(async () => {
    // TODO: Poll backend for updated MST status from Member 4 webhook
    await new Promise((r) => setTimeout(r, 400));
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
        mstStatus,
        isLoading,
        isLoggedIn,
        login,
        logout,
        initiatePayment,
        refreshMstStatus,
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
