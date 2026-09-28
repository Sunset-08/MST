'use client';

// ============================================================
// SECUREX — Organization Context
// Organization portal state, backed by the SECUREX backend:
//   - membership and role come from the server (never from browser storage)
//   - challenge publishing posts to POST /api/org/challenges
// Funding status is read from GET /api/org/mst-status; this context does not move funds.
// ============================================================

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ChallengeDraft, OrgAdmin, Organization, OrgMstStatus } from '@/lib/types/org';
import { createEmptyDraft } from '@/lib/types/org';
import { errorMessage, setActiveOrganization } from '@/lib/api/client';
import { createOrgChallenge, getOrganization, getOrgMstStatus } from '@/lib/api/org';
import { useAuth } from '@/lib/context/AuthContext';

const ORG_KEY = 'sx_org_id';

interface OrgContextValue {
  admin: OrgAdmin | null;
  organization: Organization | null;
  mstStatus: OrgMstStatus | null;
  isReady: boolean;
  isLoading: boolean;
  isLoggedIn: boolean;
  /** Signed in but not a member of any organization yet. */
  needsOrganization: boolean;

  login: (email: string, password: string) => Promise<{ hasOrganization: boolean }>;
  logout: () => Promise<void>;
  refreshMstStatus: () => Promise<void>;
  refreshOrganization: () => Promise<void>;

  draft: ChallengeDraft;
  updateDraft: (patch: Partial<ChallengeDraft>) => void;
  resetDraft: () => void;
  publishChallenge: (status?: 'published' | 'draft') => Promise<{ success: boolean; challengeId?: string; error?: string }>;
}

const OrgContext = createContext<OrgContextValue | null>(null);

const toNumber = (v: number | '') => (v === '' ? undefined : Number(v));

/** Maps the org portal's draft form onto the backend challenge contract. */
export function draftToPayload(draft: ChallengeDraft, status: 'published' | 'draft') {
  const questions = draft.questions.map((q) => ({
    id: q.id,
    type: q.type,
    questionText: q.questionText,
    ...(q.type === 'multiple_choice' ? { options: q.options, correctAnswer: q.correctAnswer } : {}),
    points: q.points,
  }));
  const acceptedAnswers = Object.fromEntries(
    draft.questions
      .filter((q) => q.type !== 'multiple_choice' && q.expectedAnswer?.trim())
      .map((q) => [q.id, [q.expectedAnswer!.trim()]]),
  );
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || draft.securityIssue.trim(),
    category: draft.securityCategory,
    difficulty: draft.difficulty,
    challengeType: draft.challengeType,
    verificationType: draft.verificationType,
    pointsReward: toNumber(draft.pointsReward),
    mstReward: toNumber(draft.mstReward) ?? 0,
    maxAttempts: toNumber(draft.maxAttempts) ?? null,
    githubIssueId: draft.githubIssueId || null,
    status,
    challengeConfig: {
      ...(draft.securityIssue.trim() ? { securityIssue: draft.securityIssue.trim() } : {}),
      ...(draft.expectedSolutionCriteria.trim() ? { expectedSolutionCriteria: draft.expectedSolutionCriteria.trim() } : {}),
      ...(draft.expiresAt ? { expiresAt: new Date(draft.expiresAt).toISOString() } : {}),
      ...(questions.length ? { questions } : {}),
      ...(Object.keys(acceptedAnswers).length ? { acceptedAnswers } : {}),
    },
  };
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [mstStatus, setMstStatus] = useState<OrgMstStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [draft, setDraft] = useState<ChallengeDraft>(createEmptyDraft());

  const memberships = auth.me?.organizations ?? [];
  const membership = memberships.find((m) => m.organizationId === orgId) ?? memberships[0] ?? null;

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(ORG_KEY) : null;
    const id = memberships.find((m) => m.organizationId === saved)?.organizationId ?? memberships[0]?.organizationId ?? null;
    setOrgId(id);
    setActiveOrganization(id);
    if (id) window.localStorage.setItem(ORG_KEY, id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.me?.id, memberships.length]);

  const refreshMstStatus = useCallback(async () => {
    if (!orgId) return;
    const s = await getOrgMstStatus();
    setMstStatus({
      minimumRequired: s.minimumRequired,
      amountPaid: s.amountPaid,
      paymentStatus: s.paymentStatus,
      lastUpdatedAt: new Date().toISOString(),
    });
  }, [orgId]);

  const refreshOrganization = useCallback(async () => {
    if (!orgId) {
      setOrganization(null);
      setMstStatus(null);
      return;
    }
    setIsLoading(true);
    try {
      const [org, status] = await Promise.all([getOrganization(orgId), getOrgMstStatus()]);
      const mst: OrgMstStatus = {
        minimumRequired: status.minimumRequired,
        amountPaid: status.amountPaid,
        paymentStatus: status.paymentStatus,
        lastUpdatedAt: new Date().toISOString(),
      };
      setMstStatus(mst);
      setOrganization({
        id: org.id, name: org.name, slug: org.slug, description: org.description, logoUrl: org.logoUrl,
        website: org.website, mstStatus: mst, createdAt: org.createdAt,
      });
    } catch {
      setOrganization(null);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (auth.status === 'authenticated' && orgId) void refreshOrganization();
    else {
      setOrganization(null);
      setMstStatus(null);
    }
  }, [auth.status, orgId, refreshOrganization]);

  const login = useCallback(
    async (email: string, password: string) => {
      const me = await auth.login(email, password);
      return { hasOrganization: me.organizations.length > 0 };
    },
    [auth],
  );

  const logout = useCallback(async () => {
    await auth.logout();
    setOrganization(null);
    setMstStatus(null);
    setActiveOrganization(null);
  }, [auth]);

  const updateDraft = useCallback((patch: Partial<ChallengeDraft>) => setDraft((prev) => ({ ...prev, ...patch })), []);
  const resetDraft = useCallback(() => setDraft(createEmptyDraft()), []);

  const publishChallenge = useCallback(
    async (status: 'published' | 'draft' = 'published') => {
      setIsLoading(true);
      try {
        const created = await createOrgChallenge(draftToPayload(draft, status));
        setDraft(createEmptyDraft());
        return { success: true, challengeId: created.id };
      } catch (err) {
        return { success: false, error: errorMessage(err, 'Could not save the challenge') };
      } finally {
        setIsLoading(false);
      }
    },
    [draft],
  );

  const admin = useMemo<OrgAdmin | null>(
    () =>
      auth.me && membership && organization
        ? { id: auth.me.id, username: auth.me.username, displayName: auth.me.displayName, email: auth.me.email, role: membership.role, organization }
        : null,
    [auth.me, membership, organization],
  );

  return (
    <OrgContext.Provider
      value={{
        admin,
        organization,
        mstStatus,
        isReady: auth.isReady,
        isLoading,
        isLoggedIn: auth.status === 'authenticated' && memberships.length > 0,
        needsOrganization: auth.status === 'authenticated' && auth.me !== null && memberships.length === 0,
        login,
        logout,
        refreshMstStatus,
        refreshOrganization,
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
