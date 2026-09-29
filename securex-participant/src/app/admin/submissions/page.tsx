'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { getAdminSubmissions, reviewAdminSubmission } from '@/lib/api/admin';
import { errorMessage } from '@/lib/api/client';
import type { AdminSubmissionEntry, SubmissionStatus } from '@/lib/types/admin';
import { ClipboardList, Search, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { DIFFICULTY_BG, cn } from '@/lib/utils';
import type { Difficulty } from '@/lib/types';

const STATUS_CONFIG: Record<SubmissionStatus, { color: string; icon: React.ElementType }> = {
  Submitted: { color: 'text-slate-400', icon: ClipboardList },
  'Under Review': { color: 'text-amber-400', icon: Clock },
  Verified: { color: 'text-emerald-400', icon: CheckCircle },
  Failed: { color: 'text-rose-400', icon: XCircle },
  Rejected: { color: 'text-slate-500', icon: AlertCircle },
};

const ALL_STATUSES: SubmissionStatus[] = ['Submitted', 'Under Review', 'Verified', 'Failed', 'Rejected'];

function ReviewActions({ id, onDone }: { id: string; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function decide(decision: 'approve' | 'reject') {
    if (reason.trim().length < 3) { setError('Add a reason'); return; }
    setBusy(true);
    setError('');
    try {
      await reviewAdminSubmission(id, decision, reason.trim());
      onDone();
    } catch (err) {
      setError(errorMessage(err, 'Review failed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-1 min-w-52">
      <input className="sx-input text-xs" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-1">
        <button disabled={busy} onClick={() => decide('approve')} className="sx-btn sx-btn-sm" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>Approve</button>
        <button disabled={busy} onClick={() => decide('reject')} className="sx-btn sx-btn-sm" style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>Reject</button>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}

export default function AdminSubmissionsPage() {
  const [submissions, setSubmissions] = useState<AdminSubmissionEntry[]>([]);
  const [filtered, setFiltered] = useState<AdminSubmissionEntry[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);

  const load = () =>
    getAdminSubmissions().then((data) => { setSubmissions(data); setFiltered(data); })
      .finally(() => setIsLoading(false));

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    let result = submissions;
    if (search) result = result.filter((s) =>
      s.participant.toLowerCase().includes(search.toLowerCase()) ||
      s.challengeTitle.toLowerCase().includes(search.toLowerCase()) ||
      s.organization.toLowerCase().includes(search.toLowerCase())
    );
    if (statusFilter !== 'all') result = result.filter((s) => s.status === statusFilter);
    setFiltered(result);
  }, [search, statusFilter, submissions]);

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <ClipboardList size={22} className="text-amber-400" /> Submissions
            </h1>
            <p className="text-slate-500 text-sm mt-1">Platform-wide submission and verification oversight</p>
          </div>
          <span className="sx-badge bg-white/5 border border-white/10 text-slate-400">{filtered.length} submissions</span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="sx-input-wrapper flex-1 min-w-52">
            <Search size={16} className="sx-input-leading-icon" />
            <input id="admin-sub-search" type="text" placeholder="Search by participant, challenge, org..."
              value={search} onChange={(e) => setSearch(e.target.value)} className="sx-input sx-input-icon-left" />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <button onClick={() => setStatusFilter('all')}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                statusFilter === 'all' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5')}>
              All
            </button>
            {ALL_STATUSES.map((s) => {
              const { color } = STATUS_CONFIG[s];
              return (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    statusFilter === s ? 'bg-blue-500 text-white' : `${color} hover:bg-white/5`)}>
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <div className="sx-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs text-slate-500 uppercase tracking-widest">
                  <th className="text-left px-5 py-3 font-semibold">Participant</th>
                  <th className="text-left px-5 py-3 font-semibold hidden sm:table-cell">Challenge</th>
                  <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Difficulty</th>
                  <th className="text-left px-5 py-3 font-semibold">Status</th>
                  <th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Submitted</th>
                  <th className="text-left px-5 py-3 font-semibold">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={6} className="px-5 py-3"><div className="skeleton h-8 rounded" /></td></tr>
                    ))
                  : filtered.map((sub) => {
                      const { color, icon: StatusIcon } = STATUS_CONFIG[sub.status];
                      return (
                        <tr key={sub.id} className="hover:bg-white/2 transition-colors">
                          <td className="px-5 py-3">
                            <p className="font-semibold text-white">@{sub.participant}</p>
                            <p className="text-xs text-slate-500">{sub.organization}</p>
                          </td>
                          <td className="px-5 py-3 hidden sm:table-cell">
                            <p className="text-slate-300 truncate max-w-48">{sub.challengeTitle}</p>
                          </td>
                          <td className="px-5 py-3 hidden md:table-cell">
                            <span className={`sx-badge ${DIFFICULTY_BG[sub.difficulty as Difficulty]}`}>{sub.difficulty}</span>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`flex items-center gap-1.5 text-xs font-semibold ${color}`}>
                              <StatusIcon size={12} />
                              {sub.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 hidden lg:table-cell text-xs text-slate-500">
                            {new Date(sub.submittedAt).toLocaleString()}
                          </td>
                          <td className="px-5 py-3">
                            {sub.status === 'Under Review' ? <ReviewActions id={sub.id} onDone={() => void load()} /> : <span className="text-xs text-slate-600">—</span>}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
