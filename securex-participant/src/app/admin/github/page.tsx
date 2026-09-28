'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { getAdminGithub } from '@/lib/api/admin';
import type { AdminGithubEntry } from '@/lib/types/admin';
import { GitBranch, CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatRelative(iso?: string) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const INSTALL_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  connected: { label: 'Connected', color: 'text-emerald-400', icon: CheckCircle },
  disconnected: { label: 'Disconnected', color: 'text-rose-400', icon: XCircle },
  pending: { label: 'Pending', color: 'text-amber-400', icon: Clock },
};
const WEBHOOK_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: 'Active ✅', color: 'text-emerald-400' },
  inactive: { label: 'Inactive', color: 'text-slate-500' },
  error: { label: 'Error ⚠', color: 'text-rose-400' },
};

export default function AdminGithubPage() {
  const [integrations, setIntegrations] = useState<AdminGithubEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getAdminGithub().then(setIntegrations).finally(() => setIsLoading(false));
  }, []);

  const connected = integrations.filter((i) => i.installationStatus === 'connected').length;
  const webhookErrors = integrations.filter((i) => i.webhookStatus === 'error').length;

  return (
    <AdminShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <GitBranch size={22} className="text-blue-400" /> GitHub Integrations
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            GitHub App installations and webhook status across all organizations
          </p>
        </div>

        {/* Summary */}
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="sx-card p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Connected</p>
            <p className="text-3xl font-black text-emerald-400">{connected}</p>
          </div>
          <div className="sx-card p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Total Orgs</p>
            <p className="text-3xl font-black text-white">{integrations.length}</p>
          </div>
          {webhookErrors > 0 ? (
            <div className="sx-card p-5 border-rose-400/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-rose-400" />
                <p className="text-xs font-semibold text-rose-400 uppercase tracking-widest">Webhook Errors</p>
              </div>
              <p className="text-3xl font-black text-rose-400">{webhookErrors}</p>
            </div>
          ) : (
            <div className="sx-card p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Webhook Errors</p>
              <p className="text-3xl font-black text-emerald-400">0 ✓</p>
            </div>
          )}
        </div>

        {/* Cards */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {integrations.map((gh) => {
              const install = INSTALL_CONFIG[gh.installationStatus];
              const webhook = WEBHOOK_CONFIG[gh.webhookStatus];
              const InstallIcon = install.icon;
              return (
                <div key={gh.id} className="sx-card p-5 flex items-center gap-5 flex-wrap">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}
                  >
                    <GitBranch size={18} className="text-blue-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-white">{gh.orgName}</p>
                      <span className={`flex items-center gap-1 text-xs font-semibold ${install.color}`}>
                        <InstallIcon size={11} />
                        {install.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">@{gh.githubOrg}</p>
                  </div>

                  <div className="flex items-center gap-6 text-sm flex-shrink-0 flex-wrap">
                    <div className="text-center">
                      <p className="font-bold text-white">{gh.repositoryCount}</p>
                      <p className="text-xs text-slate-500">Repos</p>
                    </div>
                    <div className="text-center">
                      <p className={`font-semibold text-xs ${webhook.color}`}>{webhook.label}</p>
                      <p className="text-xs text-slate-500">Webhook</p>
                    </div>
                    <div className="text-center hidden md:block">
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        <RefreshCw size={10} />
                        {formatRelative(gh.lastSyncAt)}
                      </p>
                      <p className="text-xs text-slate-500">Last Sync</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-slate-600">
          GitHub App installation and webhook implementation is owned by the backend (Member 3).
          This view shows status data from <code className="text-slate-500">GET /api/admin/github</code>.
        </p>
      </div>
    </AdminShell>
  );
}
