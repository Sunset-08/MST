'use client';

// ============================================================
// SECUREX — Org Challenges List Page
// Member 2 — Organization Side Add-On
// Route: /org/challenges
// ============================================================

import { OrgShell } from '@/components/org/OrgShell';
import { useOrg } from '@/lib/context/OrgContext';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listOrgChallenges, type OrgChallengeRow } from '@/lib/api/org';
import { errorMessage } from '@/lib/api/client';
import { PlusCircle, Lock, Shield, TrendingUp } from 'lucide-react';

const DIFFICULTY_STYLE: Record<string, { color: string; bg: string }> = {
  easy: { color: '#34d399', bg: 'rgba(52, 211, 153, 0.1)' },
  medium: { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)' },
  hard: { color: '#f87171', bg: 'rgba(248, 113, 113, 0.1)' },
  expert: { color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.1)' },
};

export default function OrgChallengesPage() {
  const { organization } = useOrg();
  const [challenges, setChallenges] = useState<OrgChallengeRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!organization) return;
    listOrgChallenges({ limit: 100 }).then((r) => setChallenges(r.data)).catch((e) => setError(errorMessage(e)));
  }, [organization]);

  return (
    <OrgShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Your Challenges</h1>
            <p className="text-slate-500 text-sm mt-1">
              {challenges.length} challenge{challenges.length !== 1 ? 's' : ''} configured
            </p>
          </div>
          <Link
            href="/org/challenges/create"
            id="org-challenges-create-btn"
            className="sx-btn"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}
          >
            <PlusCircle size={16} />
            New Challenge
          </Link>
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}
        <div className="space-y-3">
          {challenges.map((ch) => {
            const diffStyle = DIFFICULTY_STYLE[ch.difficulty.toLowerCase()] ?? DIFFICULTY_STYLE.easy;
            return (
              <div key={ch.id} className="sx-card sx-card-interactive p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
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
                      <span className="text-xs text-slate-500">{ch.category}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-white">{ch.title}</h3>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                      <span>{ch.challengeConfig.questions?.length ?? 0} questions</span>
                      <span>•</span>
                      <span>{ch.attempts ?? 0} attempts · {ch.verified ?? 0} verified</span>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="flex items-center gap-1 justify-end">
                      <TrendingUp size={12} className="text-violet-400" />
                      <span className="text-sm font-bold text-violet-400">{ch.pointsReward} pts</span>
                    </div>
                    <p className="text-sm font-bold text-amber-400">{ch.mstReward} MSTC</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {challenges.length === 0 && (
          <div
            className="sx-card p-12 text-center"
            style={{ border: '1px dashed rgba(139, 92, 246, 0.2)' }}
          >
            <Shield size={40} className="text-slate-600 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No challenges yet</p>
            <p className="text-xs text-slate-600 mt-1">
              Create your first security challenge.
            </p>
          </div>
        )}
      </div>
    </OrgShell>
  );
}
