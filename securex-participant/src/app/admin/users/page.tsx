'use client';

// ============================================================
// SECUREX — Admin Users Page
// Route: /admin/users
// ============================================================

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { getAdminUsers } from '@/lib/api/admin';
import type { AdminUserEntry, SXRole, UserStatus } from '@/lib/types/admin';
import { Users, Search, Shield, Crown, User, CheckCircle, XCircle } from 'lucide-react';
import { formatPoints, cn } from '@/lib/utils';

const ROLE_COLORS: Record<SXRole, string> = {
  participant: 'text-blue-400',
  organization: 'text-violet-400',
  admin: 'text-amber-400',
};
const ROLE_ICONS: Record<SXRole, React.ElementType> = {
  participant: User,
  organization: Shield,
  admin: Crown,
};
const STATUS_COLOR: Record<UserStatus, string> = {
  active: 'text-emerald-400',
  suspended: 'text-rose-400',
  pending: 'text-amber-400',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserEntry[]>([]);
  const [filtered, setFiltered] = useState<AdminUserEntry[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<SXRole | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getAdminUsers().then((data) => {
      setUsers(data);
      setFiltered(data);
    }).finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    let result = users;
    if (search) result = result.filter((u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      (u.email ?? '').toLowerCase().includes(search.toLowerCase())
    );
    if (roleFilter !== 'all') result = result.filter((u) => u.role === roleFilter);
    setFiltered(result);
  }, [search, roleFilter, users]);

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Users size={22} className="text-blue-400" /> Users
            </h1>
            <p className="text-slate-500 text-sm mt-1">All registered DevArena users</p>
          </div>
          <span className="sx-badge bg-white/5 border border-white/10 text-slate-400">
            {filtered.length} users
          </span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="sx-input-wrapper flex-1 min-w-52">
            <Search size={16} className="sx-input-leading-icon" />
            <input
              id="admin-user-search"
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sx-input sx-input-icon-left"
            />
          </div>
          <div className="flex items-center gap-1">
            {(['all', 'participant', 'organization', 'admin'] as const).map((r) => (
              <button
                key={r}
                id={`user-filter-${r}`}
                onClick={() => setRoleFilter(r)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all',
                  roleFilter === r ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
                )}
              >
                {r}
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
                  <th className="text-left px-5 py-3 font-semibold">User</th>
                  <th className="text-left px-5 py-3 font-semibold hidden sm:table-cell">Role</th>
                  <th className="text-right px-5 py-3 font-semibold hidden md:table-cell">Points</th>
                  <th className="text-right px-5 py-3 font-semibold hidden md:table-cell">Reputation</th>
                  <th className="text-right px-5 py-3 font-semibold hidden lg:table-cell">Solved</th>
                  <th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={6} className="px-5 py-3"><div className="skeleton h-8 rounded" /></td></tr>
                    ))
                  : filtered.map((u) => {
                      const RoleIcon = ROLE_ICONS[u.role];
                      return (
                        <tr key={u.id} className="hover:bg-white/2 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                                {(u.displayName?.[0] ?? u.username[0]).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-white">{u.displayName ?? u.username}</p>
                                {u.email && <p className="text-xs text-slate-600 truncate max-w-32">{u.email}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3 hidden sm:table-cell">
                            <span className={`flex items-center gap-1.5 text-xs font-semibold capitalize ${ROLE_COLORS[u.role]}`}>
                              <RoleIcon size={12} />
                              {u.role}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right hidden md:table-cell">
                            <span className="font-bold text-amber-400">{u.role === 'participant' ? formatPoints(u.points) : '—'}</span>
                          </td>
                          <td className="px-5 py-3 text-right hidden md:table-cell text-cyan-400 font-bold">
                            {u.role === 'participant' ? u.reputation : '—'}
                          </td>
                          <td className="px-5 py-3 text-right hidden lg:table-cell text-white font-bold">
                            {u.role === 'participant' ? u.challengesSolved : '—'}
                          </td>
                          <td className="px-5 py-3 hidden lg:table-cell">
                            <span className={`flex items-center gap-1.5 text-xs font-semibold capitalize ${STATUS_COLOR[u.status]}`}>
                              {u.status === 'active' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                              {u.status}
                            </span>
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
