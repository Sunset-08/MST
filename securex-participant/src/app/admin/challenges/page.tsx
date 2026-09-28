'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { getAdminChallenges } from '@/lib/api/admin';
import type { AdminChallengeEntry, AdminChallengeStatus } from '@/lib/types/admin';
import { Target, Search, Zap, Coins } from 'lucide-react';
import { DIFFICULTY_BG, formatPoints, cn } from '@/lib/utils';
import type { Difficulty } from '@/lib/types';

const STATUS_COLORS: Record<AdminChallengeStatus, string> = {
  published: 'text-emerald-400',
  draft: 'text-slate-400',
  archived: 'text-slate-600',
  flagged: 'text-rose-400',
};

export default function AdminChallengesPage() {
  const [challenges, setChallenges] = useState<AdminChallengeEntry[]>([]);
  const [filtered, setFiltered] = useState<AdminChallengeEntry[]>([]);
  const [search, setSearch] = useState('');
  const [diffFilter, setDiffFilter] = useState<Difficulty | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<AdminChallengeStatus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getAdminChallenges().then((data) => { setChallenges(data); setFiltered(data); })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    let result = challenges;
    if (search) result = result.filter((c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.organization.toLowerCase().includes(search.toLowerCase())
    );
    if (diffFilter !== 'All') result = result.filter((c) => c.difficulty === diffFilter);
    if (statusFilter !== 'all') result = result.filter((c) => c.status === statusFilter);
    setFiltered(result);
  }, [search, diffFilter, statusFilter, challenges]);

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Target size={22} className="text-emerald-400" /> Challenges
            </h1>
            <p className="text-slate-500 text-sm mt-1">Platform-wide challenge visibility</p>
          </div>
          <span className="sx-badge bg-white/5 border border-white/10 text-slate-400">{filtered.length} challenges</span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="sx-input-wrapper flex-1 min-w-52">
            <Search size={16} className="sx-input-leading-icon" />
            <input id="admin-ch-search" type="text" placeholder="Search challenges or organizations..."
              value={search} onChange={(e) => setSearch(e.target.value)} className="sx-input sx-input-icon-left" />
          </div>
          <div className="flex items-center gap-1">
            {(['All', 'Easy', 'Medium', 'Hard', 'Expert'] as const).map((d) => (
              <button key={d} onClick={() => setDiffFilter(d)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  diffFilter === d ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5')}>
                {d}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {(['all', 'published', 'draft', 'archived', 'flagged'] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all',
                  statusFilter === s ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5')}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="sx-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs text-slate-500 uppercase tracking-widest">
                  <th className="text-left px-5 py-3 font-semibold">Challenge</th>
                  <th className="text-left px-5 py-3 font-semibold hidden sm:table-cell">Difficulty</th>
                  <th className="text-right px-5 py-3 font-semibold hidden md:table-cell">Points</th>
                  <th className="text-right px-5 py-3 font-semibold hidden md:table-cell">MSTC</th>
                  <th className="text-right px-5 py-3 font-semibold hidden lg:table-cell">Submissions</th>
                  <th className="text-right px-5 py-3 font-semibold hidden lg:table-cell">Solved</th>
                  <th className="text-left px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={7} className="px-5 py-3"><div className="skeleton h-8 rounded" /></td></tr>
                    ))
                  : filtered.map((ch) => (
                      <tr key={ch.id} className="hover:bg-white/2 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-white truncate max-w-48">{ch.title}</p>
                          <p className="text-xs text-slate-500">{ch.organization}</p>
                        </td>
                        <td className="px-5 py-3 hidden sm:table-cell">
                          <span className={`sx-badge ${DIFFICULTY_BG[ch.difficulty as Difficulty]}`}>{ch.difficulty}</span>
                        </td>
                        <td className="px-5 py-3 text-right hidden md:table-cell">
                          <span className="text-amber-400 font-bold flex items-center justify-end gap-1">
                            <Zap size={11} />{formatPoints(ch.pointsReward)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right hidden md:table-cell">
                          <span className="text-emerald-400 font-bold flex items-center justify-end gap-1">
                            <Coins size={11} />{ch.mstReward}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right hidden lg:table-cell text-white font-bold">{ch.submissionCount}</td>
                        <td className="px-5 py-3 text-right hidden lg:table-cell text-emerald-400 font-bold">{ch.solvedCount}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-semibold capitalize ${STATUS_COLORS[ch.status]}`}>{ch.status}</span>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
