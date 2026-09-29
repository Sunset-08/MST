'use client';

// ============================================================
// SECUREX — Org Settings Page (stub)
// Member 2 — Organization Side Add-On
// Route: /org/settings
// ============================================================

import { OrgShell } from '@/components/org/OrgShell';
import { OrgWalletCard } from '@/components/org/OrgWalletCard';
import { useOrg } from '@/lib/context/OrgContext';
import { Settings, Building2, User, Wallet } from 'lucide-react';

export default function OrgSettingsPage() {
  const { admin, organization } = useOrg();

  return (
    <OrgShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your organization and account settings.</p>
        </div>

        {/* Organization info */}
        <div className="sx-card p-6 space-y-5">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Building2 size={16} className="text-violet-400" />
            Organization
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Name
              </label>
              <input
                id="settings-org-name"
                type="text"
                className="sx-input"
                defaultValue={organization?.name ?? ''}
                readOnly
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Slug
              </label>
              <input
                id="settings-org-slug"
                type="text"
                className="sx-input"
                defaultValue={organization?.slug ?? ''}
                readOnly
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Website
              </label>
              <input
                id="settings-org-website"
                type="url"
                className="sx-input"
                defaultValue={organization?.website ?? ''}
                readOnly
              />
            </div>
          </div>
        </div>

        {/* Admin account info */}
        <div className="sx-card p-6 space-y-5">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <User size={16} className="text-violet-400" />
            Admin Account
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Email
              </label>
              <input
                id="settings-admin-email"
                type="email"
                className="sx-input"
                defaultValue={admin?.email ?? ''}
                readOnly
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Role
              </label>
              <input
                id="settings-admin-role"
                type="text"
                className="sx-input capitalize"
                defaultValue={admin?.role ?? ''}
                readOnly
              />
            </div>
          </div>
        </div>

        {/* Wallet Settings */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2 px-1">
            <Wallet size={16} className="text-violet-400" />
            Wallet
          </h2>
          <OrgWalletCard />
        </div>

        <div
          className="px-4 py-3 rounded-lg text-xs text-slate-500"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Settings size={12} className="inline mr-1.5 text-slate-600" />
          Settings editing will be connected to the backend API in a future release.
        </div>
      </div>
    </OrgShell>
  );
}
