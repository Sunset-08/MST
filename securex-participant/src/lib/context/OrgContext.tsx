'use client';

// ============================================================
// SECUREX — Organization Context
// Organization portal state, backed by the SECUREX backend:
//   - membership and role come from the server (never from browser storage)
//   - challenge publishing posts to POST /api/org/challenges
// Funding status is read from GET /api/org/mst-status; this context does not move funds.
// ============================================================

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ChallengeDraft, ChallengeQuestion, OrgAdmin, Organization, OrgChallengeType, OrgWallet } from '@/lib/types/org';
import { createEmptyDraft } from '@/lib/types/org';
import { errorMessage, setActiveOrganization } from '@/lib/api/client';
import { createOrgChallenge, getOrgChallenge, getOrganization, updateOrgChallenge, type OrgChallengeRow } from '@/lib/api/org';
import { useAuth } from '@/lib/context/AuthContext';

const ORG_KEY = 'sx_org_id';

interface OrgContextValue {
  admin: OrgAdmin | null;
  organization: Organization | null;
  wallet: OrgWallet | null;
  isReady: boolean;
  isLoading: boolean;
  isLoggedIn: boolean;
  /** Signed in but not a member of any organization yet. */
  needsOrganization: boolean;

  login: (email: string, password: string) => Promise<{ hasOrganization: boolean }>;
  logout: () => Promise<void>;
  refreshOrganization: () => Promise<void>;
  connectWallet: (walletAddress: string) => Promise<void>;
  disconnectWallet: () => void;

  draft: ChallengeDraft;
  updateDraft: (patch: Partial<ChallengeDraft>) => void;
  resetDraft: () => void;
  /** Id of the challenge being edited, or null when the form is creating a new one. */
  editingId: string | null;
  /** Status the challenge had when it was loaded for editing. */
  editingStatus: 'draft' | 'published' | 'archived' | null;
  /** Loads an existing challenge of this organization into the form. */
  loadChallengeForEdit: (id: string) => Promise<{ success: boolean; error?: string }>;
  publishChallenge: (status?: 'published' | 'draft') => Promise<{ success: boolean; challengeId?: string; error?: string }>;
}

const OrgContext = createContext<OrgContextValue | null>(null);

const toNumber = (v: number | '') => (v === '' ? undefined : Number(v));
const splitLines = (v: string) => v.split('\n').map((l) => l.trim()).filter(Boolean);

const TYPE_KEY: Record<string, OrgChallengeType> = { Code: 'code', Fix: 'fix', Investigation: 'investigation', SecurityReport: 'security_report' };

/** datetime-local input value (local time) for an ISO instant. */
function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Inverse of draftToPayload: fills the form from a stored challenge. */
export function challengeToDraft(row: OrgChallengeRow): ChallengeDraft {
  const cfg = row.challengeConfig ?? {};
  const questions: ChallengeQuestion[] = (cfg.questions ?? []).map((q) => ({
    id: q.id,
    type: q.type,
    questionText: q.questionText,
    options: q.type === 'multiple_choice' ? q.options : undefined,
    correctAnswer: q.type === 'multiple_choice' ? q.correctAnswer : undefined,
    expectedAnswer: q.type !== 'multiple_choice' ? (cfg.acceptedAnswers?.[q.id]?.[0] ?? '') : undefined,
    points: q.points,
  }));
  return {
    title: row.title,
    securityIssue: cfg.securityIssue ?? '',
    description: row.description,
    githubRepository: row.githubRepository ?? '',
    githubRepositoryId: row.githubRepositoryId ?? '',
    githubIssueId: row.githubIssueId ?? '',
    githubIssueRef: row.githubIssueNumber ? `#${row.githubIssueNumber}` : '',
    securityCategory: row.category,
    difficulty: row.difficulty.toLowerCase() as ChallengeDraft['difficulty'],
    challengeType: TYPE_KEY[row.challengeType] ?? (row.challengeType as OrgChallengeType),
    verificationType: row.verificationType as ChallengeDraft['verificationType'],
    pointsReward: row.pointsReward,
    mstReward: row.mstReward,
    maxAttempts: row.maxAttempts ?? '',
    expiresAt: toLocalInput(cfg.expiresAt),
    expectedSolutionCriteria: cfg.expectedSolutionCriteria ?? '',
    targetFiles: (cfg.targetFiles ?? []).join('\n'),
    questions,
    status: row.status,
  };
}

/** Maps the org portal's draft form onto the backend challenge contract. */
export function draftToPayload(draft: ChallengeDraft, status: 'published' | 'draft') {
  const questions = draft.questions.map((q) => ({
    id: q.id,
    type: q.type,
    questionText: q.questionText.trim(),
    // Unused (blank) option slots are not sent: the API requires every option to have text.
    ...(q.type === 'multiple_choice'
      ? { options: (q.options ?? []).map((o) => ({ ...o, text: o.text.trim() })).filter((o) => o.text), correctAnswer: q.correctAnswer }
      : {}),
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
      ...(splitLines(draft.targetFiles).length ? { targetFiles: splitLines(draft.targetFiles) } : {}),
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
  const [wallet, setWallet] = useState<OrgWallet | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [draft, setDraft] = useState<ChallengeDraft>(createEmptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<'draft' | 'published' | 'archived' | null>(null);

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

  const connectWallet = useCallback(async (walletAddress: string) => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    setWallet({ address: walletAddress, isConnected: true, network: 'Testnet' });
    setIsLoading(false);
  }, []);

  const disconnectWallet = useCallback(() => {
    setWallet(null);
  }, []);

  const refreshOrganization = useCallback(async () => {
    if (!orgId) {
      setOrganization(null);
      return;
    }
    setIsLoading(true);
    try {
      const org = await getOrganization(orgId);
      setOrganization({
        id: org.id, name: org.name, slug: org.slug, description: org.description, logoUrl: org.logoUrl,
        website: org.website, createdAt: org.createdAt,
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
    setActiveOrganization(null);
  }, [auth]);

  const updateDraft = useCallback((patch: Partial<ChallengeDraft>) => setDraft((prev) => ({ ...prev, ...patch })), []);
  const resetDraft = useCallback(() => {
    setDraft(createEmptyDraft());
    setEditingId(null);
    setEditingStatus(null);
  }, []);

  const loadChallengeForEdit = useCallback(async (id: string) => {
    try {
      const row = await getOrgChallenge(id);
      setDraft(challengeToDraft(row));
      setEditingId(row.id);
      setEditingStatus(row.status);
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err, 'Could not load the challenge') };
    }
  }, []);

  const publishChallenge = useCallback(
    async (status: 'published' | 'draft' = 'published') => {
      setIsLoading(true);
      try {
        // Editing updates the existing challenge in place; it never creates a second one.
        const saved = editingId
          ? await updateOrgChallenge(editingId, draftToPayload(draft, status))
          : await createOrgChallenge(draftToPayload(draft, status));
        setDraft(createEmptyDraft());
        setEditingId(null);
        setEditingStatus(null);
        return { success: true, challengeId: saved.id };
      } catch (err) {
        return { success: false, error: errorMessage(err, 'Could not save the challenge') };
      } finally {
        setIsLoading(false);
      }
    },
    [draft, editingId],
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
        wallet,
        isReady: auth.isReady,
        isLoading,
        isLoggedIn: auth.status === 'authenticated' && memberships.length > 0,
        needsOrganization: auth.status === 'authenticated' && auth.me !== null && memberships.length === 0,
        login,
        logout,
        connectWallet,
        disconnectWallet,
        refreshOrganization,
        draft,
        updateDraft,
        resetDraft,
        editingId,
        editingStatus,
        loadChallengeForEdit,
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
