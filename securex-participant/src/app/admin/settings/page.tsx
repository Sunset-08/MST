'use client';

// Platform settings: read-only view of the backend's real configuration state (never secrets).

import { useEffect, useState } from 'react';
import { Settings, ShieldCheck, Globe, GitBranch, Wallet } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { getAdminSettings, type AdminSettings } from '@/lib/api/admin';
import { errorMessage } from '@/lib/api/client';

const yes = (v: boolean) => (v ? 'Configured' : 'Not configured');

export default function AdminSettingsPage() {
  const [s, setS] = useState<AdminSettings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminSettings().then(setS).catch((e) => setError(errorMessage(e)));
  }, []);

  const sections = s ? [
    {
      icon: ShieldCheck, color: '#3b82f6', title: 'Verification Engine',
      description: 'Providers that decide submissions.',
      items: Object.entries(s.verification.providers).map(([k, v]) => ({
        label: k.replace('_', ' '),
        value: v.mode === 'automatic' ? 'Automatic' : v.mode === 'manual_review' ? 'Manual review' : 'Not configured',
      })),
    },
    {
      icon: Globe, color: '#7c3aed', title: 'MST / Blockchain',
      description: 'Reward provider and network configuration.',
      items: [
        { label: 'Network', value: s.blockchain.network ?? '—' },
        { label: 'Chain ID', value: s.blockchain.chainId ? String(s.blockchain.chainId) : '—' },
        { label: 'RPC', value: yes(s.blockchain.rpcConfigured) },
        { label: 'RewardVault contract', value: yes(s.blockchain.rewardContractConfigured) },
        { label: 'Verifier key (server-side)', value: yes(s.blockchain.verifierKeyConfigured) },
        { label: 'On-chain reward claims', value: s.claims.claimsConfigured ? 'Enabled' : (s.claims.reason ?? 'Disabled') },
      ],
    },
    {
      icon: GitBranch, color: '#10b981', title: 'GitHub',
      description: 'securexMST GitHub App and participant connection.',
      items: [
        { label: 'GitHub App', value: `${yes(s.github.appConfigured)}${s.github.appName ? ` (${s.github.appName})` : ''}` },
        { label: 'Webhook secret', value: yes(s.github.webhookSecretConfigured) },
        { label: 'Participant account connection', value: yes(s.github.userConnectConfigured) },
        { label: 'Participants must connect GitHub', value: s.github.participantConnectionRequired ? 'Yes' : 'No' },
      ],
    },
    {
      icon: Wallet, color: '#f59e0b', title: 'Wallets',
      description: 'Wallet ownership verification.',
      items: [{ label: 'Wallet linking', value: yes(s.walletLinking.configured) }, { label: 'Environment', value: s.environment }],
    },
  ] : [];

  return (
    <AdminShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Settings size={22} className="text-slate-400" /> Platform Settings
          </h1>
          <p className="text-slate-500 text-sm mt-1">Live backend configuration state. Secrets are never shown.</p>
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        {!s && !error && <div className="skeleton h-40 rounded-xl" />}
        {sections.map(({ icon: Icon, color, title, description, items }) => (
          <div key={title} className="sx-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
                <Icon size={20} style={{ color }} />
              </div>
              <div>
                <h2 className="font-bold text-white">{title}</h2>
                <p className="text-xs text-slate-500">{description}</p>
              </div>
            </div>
            <div className="space-y-2 border-t border-white/5 pt-4">
              {items.map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-slate-400 capitalize">{label}</span>
                  <span className="font-semibold text-white text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
