'use client';

// ============================================================
// SECUREX — Organization Submissions (review queue)
// Owners/admins review submissions to their challenges. Manual verification types
// (admin_review / peer_review) are decided here; the decision triggers points and rewards server-side.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, ChevronDown, ChevronUp, CheckCircle, XCircle, Clock } from 'lucide-react';
import { OrgShell } from '@/components/org/OrgShell';
import { listOrgSubmissions, reviewOrgSubmission, type OrgSubmissionRow } from '@/lib/api/org';
import { errorMessage } from '@/lib/api/client';

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'verified', label: 'Verified' },
  { id: 'rejected', label: 'Rejected' },
];

function SubmissionRow({ row, onReviewed }: { row: OrgSubmissionRow; onReviewed: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const manual = row.verificationType === 'admin_review' || row.verificationType === 'peer_review';
  const canReview = row.status === 'Pending' && manual;

  async function decide(decision: 'approve' | 'reject') {
    if (reason.trim().length < 3) {
      setError('Add a short reason for the participant.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await reviewOrgSubmission(row.submissionId, decision, reason.trim());
      onReviewed();
    } catch (err) {
      setError(errorMessage(err, 'Review failed'));
    } finally {
      setBusy(false);
    }
  }

  const Icon = row.status === 'Verified' ? CheckCircle : row.status === 'Failed' ? XCircle : Clock;
  const color = row.status === 'Verified' ? '#34d399' : row.status === 'Failed' ? '#f87171' : '#fbbf24';

  return (
    <div className="sx-card p-5 space-y-3">
      <button className="w-full flex items-center justify-between gap-4 text-left" onClick={() => setOpen((o) => !o)}>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{row.challengeTitle}</p>
          <p className="text-xs text-slate-500">
            @{row.participant.username} · {new Date(row.submittedAt).toLocaleString()} · {row.verificationType.replace('_', ' ')}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs font-semibold flex items-center gap-1" style={{ color }}><Icon size={13} /> {row.status}</span>
          {open ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-white/5 pt-3">
          <pre className="text-xs text-slate-300 bg-[var(--sx-bg-elevated)] rounded-lg p-3 overflow-auto max-h-72 whitespace-pre-wrap">
            {JSON.stringify(row.submissionData, null, 2)}
          </pre>
          {row.reason && <p className="text-xs text-slate-400">Verification note: {row.reason}</p>}
          {canReview && (
            <div className="space-y-2">
              <textarea className="sx-textarea" rows={2} placeholder="Reason shown to the participant" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
              {error && <p className="text-xs text-rose-400">{error}</p>}
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => decide('approve')} className="sx-btn sx-btn-sm" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>
                  Approve &amp; award
                </button>
                <button disabled={busy} onClick={() => decide('reject')} className="sx-btn sx-btn-sm" style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrgSubmissionsPage() {
  const [filter, setFilter] = useState('pending');
  const [rows, setRows] = useState<OrgSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows((await listOrgSubmissions({ status: filter || undefined, limit: 50 })).data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load submissions'));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <OrgShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <ClipboardCheck size={22} className="text-violet-400" /> Submissions
          </h1>
          <p className="text-slate-500 text-sm mt-1">Review participant submissions to your challenges.</p>
        </div>

        <div className="flex gap-1 bg-white/3 rounded-xl p-1 w-fit">
          {FILTERS.map((f) => (
            <button key={f.id} id={`org-submissions-filter-${f.id || 'all'}`} onClick={() => setFilter(f.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold ${filter === f.id ? 'bg-violet-500 text-white' : 'text-slate-400 hover:text-white'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
        ) : error ? (
          <div className="sx-card p-6 text-center text-sm text-rose-400">{error}</div>
        ) : rows.length === 0 ? (
          <div className="sx-card p-10 text-center text-sm text-slate-500">No {filter || ''} submissions yet.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => <SubmissionRow key={r.submissionId} row={r} onReviewed={load} />)}
          </div>
        )}
      </div>
    </OrgShell>
  );
}
