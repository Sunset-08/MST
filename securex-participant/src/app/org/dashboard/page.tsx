'use client';

// ============================================================
// SECUREX — Organization Dashboard
// Member 2 — Organization Side Add-On
// Route: /org/dashboard
// ============================================================

import { OrgShell } from '@/components/org/OrgShell';
import { OrgWalletCard } from '@/components/org/OrgWalletCard';
import { useOrg } from '@/lib/context/OrgContext';
import Link from 'next/link';
import {
  PlusCircle,
  ListChecks,
  Lock,
  TrendingUp,
  Users,
  Activity,
  ArrowRight,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Wallet,
} from 'lucide-react';

// Mock challenges for the org dashboard
const MOCK_ORG_CHALLENGES = [
  {
    id: 'och-001',
    title: 'SQL Injection in Auth Module',
    category: 'Authentication',
    difficulty: 'hard',
    status: 'published',
    attempts: 12,
    mstReward: 50,
    pointsReward: 500,
    createdAt: '2026-09-20T10:00:00Z',
  },
  {
    id: 'och-002',
    title: 'XSS in Dashboard Input',
    category: 'Web Security',
    difficulty: 'medium',
    status: 'draft',
    attempts: 0,
    mstReward: 25,
    pointsReward: 250,
    createdAt: '2026-09-25T10:00:00Z',
  },
];

const DIFFICULTY_STYLE: Record<string, { color: string; bg: string }> = {
  easy: { color: '#34d399', bg: 'rgba(52, 211, 153, 0.1)' },
  medium: { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)' },
  hard: { color: '#f87171', bg: 'rgba(248, 113, 113, 0.1)' },
  expert: { color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.1)' },
};

function OrgStatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="sx-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}15` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          {label}
        </span>
      </div>
      <p className="text-3xl font-black text-white">{value}</p>
    </div>
  );
}

export default function OrgDashboardPage() {
  const { organization, admin, wallet } = useOrg();

  if (!organization || !admin) return null;

  const publishedCount = MOCK_ORG_CHALLENGES.filter((c) => c.status === 'published').length;
  const draftCount = MOCK_ORG_CHALLENGES.filter((c) => c.status === 'draft').length;
  const totalAttempts = MOCK_ORG_CHALLENGES.reduce((s, c) => s + c.attempts, 0);

  return (
    <OrgShell>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Welcome header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Welcome,{' '}
              <span
                style={{
                  background: 'linear-gradient(135deg, #a78bfa, #818cf8)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {admin.displayName ?? admin.username}
              </span>{' '}
              👋
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {organization.name} · Organization Dashboard
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/org/challenges/create"
              id="org-create-challenge-btn"
              className="sx-btn"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}
            >
              <PlusCircle size={16} />
              Create Challenge
            </Link>
          </div>
        </div>



        {/* Stats row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <OrgStatCard
            label="Published"
            value={publishedCount}
            icon={<CheckCircle2 size={16} />}
            color="#34d399"
          />
          <OrgStatCard
            label="Drafts"
            value={draftCount}
            icon={<Shield size={16} />}
            color="#60a5fa"
          />
          <OrgStatCard
            label="Total Attempts"
            value={totalAttempts}
            icon={<Users size={16} />}
            color="#a78bfa"
          />
        </div>

        {/* Main grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Challenges list */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ListChecks size={18} className="text-violet-400" />
                Your Challenges
              </h2>
              <Link
                href="/org/challenges"
                className="text-sm hover:underline"
                style={{ color: '#a78bfa' }}
              >
                View all →
              </Link>
            </div>

            {MOCK_ORG_CHALLENGES.length === 0 ? (
              <div
                className="sx-card p-10 text-center"
                style={{ border: '1px dashed rgba(139, 92, 246, 0.2)' }}
              >
                <Shield size={36} className="text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500">No challenges yet.</p>
                <p className="text-xs text-slate-600 mt-1">
                  Create your first security challenge.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {MOCK_ORG_CHALLENGES.map((ch) => {
                  const diffStyle = DIFFICULTY_STYLE[ch.difficulty] ?? DIFFICULTY_STYLE.easy;
                  return (
                    <div key={ch.id} className="sx-card sx-card-interactive p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-semibold capitalize"
                              style={{ background: diffStyle.bg, color: diffStyle.color }}
                            >
                              {ch.difficulty}
                            </span>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-semibold capitalize"
                              style={{
                                background:
                                  ch.status === 'published'
                                    ? 'rgba(52, 211, 153, 0.1)'
                                    : 'rgba(148, 163, 184, 0.1)',
                                color: ch.status === 'published' ? '#34d399' : '#94a3b8',
                              }}
                            >
                              {ch.status}
                            </span>
                          </div>
                          <h3 className="text-sm font-semibold text-white truncate">{ch.title}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">{ch.category}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-slate-500">{ch.attempts} attempts</p>
                          <p className="text-sm font-bold text-amber-400">{ch.mstReward} MSTC</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Create new challenge CTA */}
            <div
              className="sx-card p-5 flex items-center justify-between gap-4"
              style={{ border: '1px dashed rgba(139, 92, 246, 0.2)' }}
            >
              <div>
                <p className="text-sm font-semibold text-white">Add a Security Challenge</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure a real-world security issue for participants to solve.
                </p>
              </div>
              <Link
                href="/org/challenges/create"
                id="org-dashboard-create-btn"
                className="sx-btn sx-btn-sm flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}
              >
                <PlusCircle size={14} />
                Create
              </Link>
            </div>
          </div>

          {/* Wallet Setup sidebar */}
          <div id="mst-status-section" className="space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Wallet size={18} className="text-violet-400" />
              Organization Wallet
            </h2>
            <OrgWalletCard />
          </div>
        </div>
      </div>
    </OrgShell>
  );
}
