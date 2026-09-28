'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { getAdminAnalytics } from '@/lib/api/admin';
import type { AdminAnalytics } from '@/lib/types/admin';
import { BarChart3, Zap, Coins, Users, CheckCircle } from 'lucide-react';
import { formatPoints } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

const DIFF_COLORS = { Easy: '#34d399', Medium: '#f59e0b', Hard: '#f87171', Expert: '#a78bfa' };
const CHART_COLORS = ['#3b82f6', '#7c3aed', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4', '#84cc16', '#f97316'];

const TooltipStyle = {
  contentStyle: { background: '#131a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f5f9' },
};

export default function AdminAnalyticsPage() {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getAdminAnalytics().then(setAnalytics).finally(() => setIsLoading(false));
  }, []);

  if (isLoading || !analytics) {
    return (
      <AdminShell>
        <div className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-48 rounded-xl" />)}
        </div>
      </AdminShell>
    );
  }

  const diffData = Object.entries(analytics.challengesByDifficulty).map(([k, v]) => ({
    name: k, value: v, color: DIFF_COLORS[k as keyof typeof DIFF_COLORS] ?? '#64748b',
  }));
  const catData = Object.entries(analytics.challengesByCategory).map(([name, value]) => ({ name, value }));
  const statusData = Object.entries(analytics.submissionsByStatus).map(([name, value]) => ({ name, value }));

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <BarChart3 size={22} className="text-blue-400" /> Platform Analytics
          </h1>
          <p className="text-slate-500 text-sm mt-1">Aggregate platform metrics from backend-provided data</p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Points Awarded', value: formatPoints(analytics.totalPointsAwarded) + ' pts', icon: Zap, color: '#f59e0b' },
            { label: 'Total MST Distributed', value: `${analytics.totalMstDistributed.toLocaleString()} MSTC`, icon: Coins, color: '#34d399' },
            { label: 'Active Participants (30d)', value: analytics.activeParticipantsLast30Days, icon: Users, color: '#3b82f6' },
            { label: 'Verification Success Rate', value: `${analytics.verificationSuccessRate}%`, icon: CheckCircle, color: '#10b981' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="sx-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
                  <Icon size={16} style={{ color }} />
                </div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{label}</span>
              </div>
              <p className="text-2xl font-black text-white">{value}</p>
            </div>
          ))}
        </div>

        {/* Charts row 1 */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Challenges by difficulty */}
          <div className="sx-card p-5">
            <h2 className="font-bold text-white mb-5">Challenges by Difficulty</h2>
            <div className="flex items-center gap-4">
              <div className="h-48 w-48 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={diffData} dataKey="value" cx="50%" cy="50%" outerRadius={72} innerRadius={36}>
                      {diffData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip {...TooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 flex-1">
                {diffData.map(({ name, value, color }) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-slate-400">{name}</span>
                    </span>
                    <span className="font-bold text-white">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Submissions by status */}
          <div className="sx-card p-5">
            <h2 className="font-bold text-white mb-5">Submissions by Status</h2>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData} layout="vertical">
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip {...TooltipStyle} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Challenges by category */}
        <div className="sx-card p-5">
          <h2 className="font-bold text-white mb-5">Challenges by Security Category</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={catData}>
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip {...TooltipStyle} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {catData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
