'use client';

// ============================================================
// SECUREX — Org Settings
// Organization profile (owners/admins can edit) and the GitHub App connection.
// ============================================================

import { useEffect, useState } from 'react';
import { OrgShell } from '@/components/org/OrgShell';
import { OrgWalletCard } from '@/components/org/OrgWalletCard';
import { useOrg } from '@/lib/context/OrgContext';
import { Settings, Building2, User, Wallet, GitBranch, RefreshCw, ExternalLink, CheckCircle } from 'lucide-react';
import { getGithubInstallUrl, getOrgGithub, linkGithubInstallation, syncOrgGithub, updateOrganization, type OrgGithubOverview } from '@/lib/api/org';
import { errorMessage } from '@/lib/api/client';

export default function OrgSettingsPage() {
  const { admin, organization, refreshOrganization } = useOrg();
  const canEdit = admin?.role === 'owner' || admin?.role === 'admin';
  const [form, setForm] = useState({ name: '', description: '', website: '' });
  const [saveMsg, setSaveMsg] = useState('');
  const [github, setGithub] = useState<OrgGithubOverview | null>(null);
  const [ghMsg, setGhMsg] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'sync' | 'install' | 'link'>('');
  const [installationId, setInstallationId] = useState('');

  useEffect(() => {
    if (organization) setForm({ name: organization.name, description: organization.description ?? '', website: organization.website ?? '' });
  }, [organization]);

  const loadGithub = () => getOrgGithub().then(setGithub).catch((e) => setGhMsg(errorMessage(e)));
  useEffect(() => { void loadGithub(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!organization) return;
    setBusy('save');
    setSaveMsg('');
    try {
      await updateOrganization(organization.id, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        website: form.website.trim() || null,
      });
      await refreshOrganization();
      setSaveMsg('Saved.');
    } catch (err) {
      setSaveMsg(errorMessage(err, 'Could not save'));
    } finally {
      setBusy('');
    }
  }

  async function install() {
    setBusy('install');
    setGhMsg('');
    try {
      const { installUrl } = await getGithubInstallUrl();
      window.location.href = installUrl;
    } catch (err) {
      setGhMsg(errorMessage(err, 'Could not start the GitHub installation'));
      setBusy('');
    }
  }

  async function sync() {
    setBusy('sync');
    setGhMsg('');
    try {
      const r = await syncOrgGithub();
      setGhMsg(`Synced ${r.repositoriesSynced} repositories and ${r.issuesSynced} issues.`);
      await loadGithub();
    } catch (err) {
      setGhMsg(errorMessage(err, 'Sync failed'));
    } finally {
      setBusy('');
    }
  }

  async function linkExisting(e: React.FormEvent) {
    e.preventDefault();
    setBusy('link');
    setGhMsg('');
    try {
      const r = await linkGithubInstallation(installationId.trim());
      setGhMsg(`Linked ${r.login}.`);
      await sync();
    } catch (err) {
      setGhMsg(errorMessage(err, 'Could not link that installation'));
      setBusy('');
    }
  }

  return (
    <OrgShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your organization, account and GitHub connection.</p>
        </div>

        <form onSubmit={save} className="sx-card p-6 space-y-5">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Building2 size={16} className="text-violet-400" /> Organization
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</label>
              <input id="settings-org-name" className="sx-input" value={form.name} readOnly={!canEdit} required minLength={2}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Slug</label>
              <input id="settings-org-slug" className="sx-input" value={organization?.slug ?? ''} readOnly />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Website</label>
              <input id="settings-org-website" type="url" className="sx-input" value={form.website} readOnly={!canEdit}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</label>
              <textarea id="settings-org-description" className="sx-textarea" rows={3} value={form.description} readOnly={!canEdit}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-3">
              <button id="settings-org-save" type="submit" disabled={busy === 'save'} className="sx-btn sx-btn-sm" style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}>
                {busy === 'save' ? 'Saving…' : 'Save changes'}
              </button>
              {saveMsg && <span className="text-xs text-slate-400">{saveMsg}</span>}
            </div>
          )}
        </form>

        <div className="sx-card p-6 space-y-5">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <User size={16} className="text-violet-400" /> Account
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</label>
              <input id="settings-admin-email" className="sx-input" value={admin?.email ?? ''} readOnly />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</label>
              <input id="settings-admin-role" className="sx-input capitalize" value={admin?.role ?? ''} readOnly />
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

        <div className="sx-card p-6 space-y-5" id="github-section">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <GitBranch size={16} className="text-violet-400" /> GitHub
            </h2>
            {github && github.installations.length > 0 && canEdit && (
              <button id="org-github-sync-btn" onClick={sync} disabled={busy === 'sync'} className="sx-btn sx-btn-secondary sx-btn-sm gap-2">
                <RefreshCw size={13} className={busy === 'sync' ? 'animate-spin' : ''} /> Sync repositories &amp; issues
              </button>
            )}
          </div>

          {!github ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : github.installations.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">
                Install the securexMST GitHub App on your GitHub account or organization to import repositories and issues.
                The app only needs read access to issues and repository metadata.
              </p>
              {!github.configured && <p className="text-xs text-amber-400">The GitHub App is not configured on this server yet.</p>}
              {canEdit && (
                <>
                  <button id="org-github-connect-btn" onClick={install} disabled={busy === 'install' || !github.configured} className="sx-btn gap-2"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}>
                    <GitBranch size={16} /> {busy === 'install' ? 'Redirecting…' : 'Connect GitHub'}
                  </button>
                  <form onSubmit={linkExisting} className="flex gap-2 pt-2">
                    <input id="org-github-installation-id" className="sx-input" placeholder="Already installed? Installation ID" inputMode="numeric" pattern="[0-9]+"
                      value={installationId} onChange={(e) => setInstallationId(e.target.value)} />
                    <button type="submit" disabled={!installationId || busy === 'link'} className="sx-btn sx-btn-secondary">Link</button>
                  </form>
                  <p className="text-xs text-slate-600">
                    Linking an existing installation requires a platform administrator.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {github.installations.map((i) => (
                <div key={i.id} className="flex items-center gap-3 bg-emerald-400/5 border border-emerald-400/20 rounded-xl p-3">
                  <CheckCircle size={16} className="text-emerald-400" />
                  <div className="text-sm text-white">{i.login} <span className="text-xs text-slate-500">· installation {i.installationId}</span></div>
                </div>
              ))}
              <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Repositories ({github.repositories.length})</p>
                {github.repositories.length === 0 && <p className="text-sm text-slate-500">No repositories synced yet.</p>}
                {github.repositories.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1">
                      {r.fullName} <ExternalLink size={11} />
                    </a>
                    <span className="text-xs text-slate-500">{r.openIssueCount} open / {r.issueCount} issues</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {ghMsg && <p className="text-xs text-slate-400">{ghMsg}</p>}
        </div>
      </div>
    </OrgShell>
  );
}
