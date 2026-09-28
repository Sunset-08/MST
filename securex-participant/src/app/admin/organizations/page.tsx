'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { getAdminOrganizations } from '@/lib/api/admin';
import type { AdminOrgEntry, OrgStatus } from '@/lib/types/admin';
import { Building2, Search, CheckCircle, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_COLOR: Record<OrgStatus, string> = {
  active: 'text-emerald-400',
  suspended: 'text-rose-400',
  pending_review: 'text-amber-400',
};
const STATUS_ICON: Record<OrgStatus, React.ElementType> = {
  active: CheckCircle,
  suspended: XCircle,
  pending_review: Clock,
};
const STATUS_LABEL: Record<OrgStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  pending_review: 'Pending Review',
};

export default function AdminOrganizationsPage() {
  const [orgs, setOrgs] = useState<AdminOrgEntry[]>([]);
  const [filtered, setFiltered] = useState<AdminOrgEntry[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrgStatus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getAdminOrganizations().then((data) => {
      setOrgs(data);
      setFiltered(data);
    }).finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    let result = orgs;
    if (search) result = result.filter((o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      (o.githubOrg ?? '').toLowerCase().includes(search.toLowerCase())
    );
    if (statusFilter !== 'all') result = result.filter((o) => o.status === statusFilter);
    setFiltered(result);
  }, [search, statusFilter, orgs]);

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Building2 size={22} className="text-violet-400" /> Organizations
            </h1>
            <p className="text-slate-500 text-sm mt-1">All SECUREX registered organizations</p>
          </div>
          <span className="sx-badge bg-white/5 border border-white/10 text-slate-400">{filtered.length} orgs</span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="sx-input-wrapper flex-1 min-w-52">
            <Search size={16} className="sx-input-leading-icon" />
            <input id="admin-org-search" type="text" placeholder="Search organizations..." value={search}
              onChange={(e) => setSearch(e.target.value)} className="sx-input sx-input-icon-left" />
          </div>
          <div className="flex items-center gap-1">
            {(['all', 'active', 'pending_review', 'suspended'] as const).map((s) => (
              <button key={s} id={`org-filter-${s}`} onClick={() => setStatusFilter(s)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all',
                  statusFilter === s ? 'bg-violet-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5')}>
                {s === 'all' ? 'All' : STATUS_LABEL[s as OrgStatus]}
              </button>
            ))}
          </div>
        </div>

        {/* Cards grid */}
        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-48 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((org) => {
              const StatusIcon = STATUS_ICON[org.status];
              return (
                <div key={org.id} className="sx-card p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
                        <Building2 size={18} className="text-violet-400" />
                      </div>
                      <div>
                        <p className="font-bold text-white">{org.name}</p>
                        {org.githubOrg && (
                          <p className="text-xs text-slate-500">@{org.githubOrg}</p>
                        )}
                      </div>
                    </div>
                    <span className={`flex items-center gap-1 text-xs font-semibold ${STATUS_COLOR[org.status]}`}>
                      <StatusIcon size={11} />
                      {STATUS_LABEL[org.status]}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: 'Repos', value: org.repositoryCount },
                      { label: 'Challenges', value: org.challengeCount },
                      { label: 'Participants', value: org.participantCount },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white/3 rounded-lg p-2">
                        <p className="text-lg font-black text-white">{value}</p>
                        <p className="text-[10px] text-slate-500">{label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{org.mstPaid} MSTC deposited</span>
                    <span>{new Date(org.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
