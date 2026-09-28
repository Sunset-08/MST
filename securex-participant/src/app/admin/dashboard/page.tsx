'use client';

// ============================================================
// SECUREX — Admin Dashboard
// Route: /admin/dashboard
// ============================================================

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { getAdminStats } from '@/lib/api/admin';
import type { AdminDashboardStats } from '@/lib/types/admin';
import {
  Users, Building2, Target, ClipboardList, Coins,
  CheckCircle, Clock, TrendingUp, Activity,
} from 'lucide-react';
import Link from 'next/link';

function StatCard({
  label, value, icon: Icon, color, href,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  href?: string;
}) {
  const content = (
    <div className="sx-card p-5 space-y-3 hover:border-white/10 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-black text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

const ACTIVITY_STATS = (s: AdminDashboardStats) => [
  { label: 'New Users', value: s.newUsersThisWeek, icon: Users, color: '#3b82f6' },
  { label: 'New Organizations', value: s.newOrgsThisWeek, icon: Building2, color: '#7c3aed' },
  { label: 'New Challenges', value: s.newChallengesThisWeek, icon: Target, color: '#10b981' },
  { label: 'Submissions', value: s.submissionsThisWeek, icon: ClipboardList, color: '#f59e0b' },
  { label: 'Verified', value: s.verifiedThisWeek, icon: CheckCircle, color: '#34d399' },
];

const QUICK_LINKS = [
  { label: 'Users', href: '/admin/users', icon: Users, color: '#3b82f6' },
  { label: 'Organizations', href: '/admin/organizations', icon: Building2, color: '#7c3aed' },
  { label: 'Challenges', href: '/admin/challenges', icon: Target, color: '#10b981' },
  { label: 'Submissions', href: '/admin/submissions', icon: ClipboardList, color: '#f59e0b' },
  { label: 'Rewards', href: '/admin/rewards', icon: Coins, color: '#34d399' },
  { label: 'Analytics', href: '/admin/analytics', icon: Activity, color: '#f43f5e' },
];

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getAdminStats().then(setStats).finally(() => setIsLoading(false));
  }, []);

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
          <p className="text-slate-500 text-sm mt-1">
            Real-time stats across the entire SECUREX platform
          </p>
        </div>

        {isLoading || !stats ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {/* Primary stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Users" value={stats.totalUsers} icon={Users} color="#3b82f6" href="/admin/users" />
              <StatCard label="Organizations" value={stats.totalOrganizations} icon={Building2} color="#7c3aed" href="/admin/organizations" />
              <StatCard label="Challenges" value={stats.totalChallenges} icon={Target} color="#10b981" href="/admin/challenges" />
              <StatCard label="Active Challenges" value={stats.activeChallenges} icon={Activity} color="#f59e0b" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Pending Reviews" value={stats.pendingReviews} icon={Clock} color="#f59e0b" href="/admin/submissions" />
              <StatCard label="Verified Submissions" value={stats.verifiedSubmissions} icon={CheckCircle} color="#34d399" href="/admin/submissions" />
              <StatCard label="MST Distributed" value={`${stats.totalMstDistributed.toLocaleString()} MSTC`} icon={Coins} color="#34d399" href="/admin/rewards" />
              <StatCard label="Submission Rate" value={`${stats.submissionRate}%`} icon={TrendingUp} color="#3b82f6" />
            </div>

            {/* Weekly activity */}
            <div className="sx-card p-6">
              <h2 className="text-base font-bold text-white mb-5 flex items-center gap-2">
                <Activity size={16} className="text-amber-400" />
                Platform Activity — Last 7 Days
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {ACTIVITY_STATS(stats).map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="text-center space-y-2">
                    <div
                      className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center"
                      style={{ background: `${color}15`, border: `1px solid ${color}25` }}
                    >
                      <Icon size={18} style={{ color }} />
                    </div>
                    <p className="text-2xl font-black text-white">{value}</p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick access */}
            <div>
              <h2 className="text-base font-bold text-white mb-4">Quick Access</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {QUICK_LINKS.map(({ label, href, icon: Icon, color }) => (
                  <Link
                    key={href}
                    href={href}
                    id={`quick-link-${label.toLowerCase()}`}
                    className="sx-card p-4 text-center space-y-2 hover:-translate-y-0.5 transition-transform"
                  >
                    <div
                      className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center"
                      style={{ background: `${color}15`, border: `1px solid ${color}25` }}
                    >
                      <Icon size={18} style={{ color }} />
                    </div>
                    <p className="text-sm font-semibold text-white">{label}</p>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
