'use client';

// ============================================================
// SECUREX — Org Settings
// Organization profile (owners/admins can edit) and the GitHub App connection.
// ============================================================

import { useEffect, useState } from 'react';
import { OrgShell } from '@/components/org/OrgShell';
import { OrgWalletCard } from '@/components/org/OrgWalletCard';
import { useOrg } from '@/lib/context/OrgContext';
import { Settings, Building2, User, Wallet, GitBranch, RefreshCw, ExternalLink, CheckCircle, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  connectGithubRepos, getAvailableGithubRepos, getGithubInstallUrl, getOrgGithub, linkGithubInstallation, removeGithubRepo, syncOrgGithub,
  updateGithubRepo, updateOrganization, type OrgGithubAvailableInstallation, type OrgGithubOverview,
} from '@/lib/api/org';
import { errorMessage } from '@/lib/api/client';

export default function OrgSettingsPage() {
  const { admin, organization, refreshOrganization } = useOrg();
  const canEdit = admin?.role === 'owner' || admin?.role === 'admin';
  const [form, setForm] = useState({ name: '', description: '', website: '' });
  const [saveMsg, setSaveMsg] = useState('');
  const [github, setGithub] = useState<OrgGithubOverview | null>(null);
  const [ghMsg, setGhMsg] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'sync' | 'install' | 'link' | 'repos'>('');
  const [installationId, setInstallationId] = useState('');
  const [available, setAvailable] = useState<OrgGithubAvailableInstallation[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [editingRepo, setEditingRepo] = useState<{ id: string; defaultBranch: string } | null>(null);

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

  async function sync(importAll = false) {
    setBusy('sync');
    setGhMsg('');
    try {
      const r = await syncOrgGithub(importAll);
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
      await sync(true);
    } catch (err) {
      setGhMsg(errorMessage(err, 'Could not link that installation'));
      setBusy('');
    }
  }

  async function openAddRepos() {
    setBusy('repos');
    setGhMsg('');
    try {
      setAvailable((await getAvailableGithubRepos()).installations);
      setPicked([]);
    } catch (err) {
      setGhMsg(errorMessage(err, 'Could not load the repositories available to the GitHub App'));
    } finally {
      setBusy('');
    }
  }

  async function connectPicked() {
    if (picked.length === 0) return;
    setBusy('repos');
    setGhMsg('');
    try {
      const r = await connectGithubRepos(picked);
      setGhMsg(`Connected ${r.connected.length} ${r.connected.length === 1 ? 'repository' : 'repositories'} and imported ${r.issuesSynced} issues.`);
      setAvailable(null);
      await loadGithub();
    } catch (err) {
      setGhMsg(errorMessage(err, 'Could not connect the selected repositories'));
    } finally {
      setBusy('');
    }
  }

  async function saveRepo(id: string, patch: { isActive?: boolean; defaultBranch?: string }) {
    setBusy('repos');
    setGhMsg('');
    try {
      await updateGithubRepo(id, patch);
      setEditingRepo(null);
      await loadGithub();
    } catch (err) {
      setGhMsg(errorMessage(err, 'Could not update the repository'));
    } finally {
      setBusy('');
    }
  }

  async function removeRepo(id: string, name: string) {
    if (!window.confirm(`Remove ${name} from this organization? Its imported issues are deleted; you can add it again later.`)) return;
    setBusy('repos');
    setGhMsg('');
    try {
      await removeGithubRepo(id);
      setGhMsg(`Removed ${name}.`);
      await loadGithub();
    } catch (err) {
      setGhMsg(errorMessage(err, 'Could not remove the repository'));
    } finally {
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
              <button id="org-github-sync-btn" onClick={() => void sync()} disabled={busy === 'sync'} className="sx-btn sx-btn-secondary sx-btn-sm gap-2">
                <RefreshCw size={13} className={busy === 'sync' ? 'animate-spin' : ''} /> Sync repositories &amp; issues
              </button>
            )}
          </div>

          {!github ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : github.installations.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">
                Install the DevArena GitHub App on your GitHub account or organization to import repositories and issues.
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
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Repositories ({github.repositories.length})</p>
                  {canEdit && (
                    <button id="org-github-add-repos-btn" onClick={() => void openAddRepos()} disabled={busy === 'repos' || !github.configured} className="sx-btn sx-btn-secondary sx-btn-sm gap-2">
                      <Plus size={13} /> Add repositories
                    </button>
                  )}
                </div>
                {github.repositories.length === 0 && <p className="text-sm text-slate-500">No repositories connected yet. Use “Add repositories” to choose which ones to import.</p>}
                {github.repositories.map((r) => (
                  <div key={r.id} className="rounded-lg border border-white/5 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1 truncate">
                          {r.fullName} <ExternalLink size={11} />
                        </a>
                        <span className="text-xs text-slate-500">
                          {r.openIssueCount} open / {r.issueCount} issues · branch {r.defaultBranch}
                          {!r.isActive && <span className="text-amber-400"> · syncing disabled</span>}
                        </span>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button id={`org-github-repo-edit-${r.id}`} title="Manage repository" className="sx-btn-ghost p-1.5 rounded-lg"
                            onClick={() => setEditingRepo(editingRepo?.id === r.id ? null : { id: r.id, defaultBranch: r.defaultBranch })}>
                            <Pencil size={14} />
                          </button>
                          <button id={`org-github-repo-remove-${r.id}`} title="Remove repository" className="sx-btn-ghost p-1.5 rounded-lg hover:text-rose-400"
                            disabled={busy === 'repos'} onClick={() => void removeRepo(r.id, r.fullName)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    {editingRepo?.id === r.id && (
                      <div className="flex flex-wrap items-end gap-3 pt-1">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Default branch</label>
                          <input className="sx-input" value={editingRepo.defaultBranch}
                            onChange={(e) => setEditingRepo({ id: r.id, defaultBranch: e.target.value })} />
                        </div>
                        <button className="sx-btn sx-btn-sm" disabled={busy === 'repos' || !editingRepo.defaultBranch.trim()}
                          style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}
                          onClick={() => void saveRepo(r.id, { defaultBranch: editingRepo.defaultBranch.trim() })}>Save</button>
                        <button className="sx-btn sx-btn-secondary sx-btn-sm" disabled={busy === 'repos'}
                          onClick={() => void saveRepo(r.id, { isActive: !r.isActive })}>
                          {r.isActive ? 'Disable syncing' : 'Enable syncing'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {available && (
                <div id="org-github-add-repos-panel" className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-4 space-y-3">
                  <p className="text-sm font-semibold text-white">Add repositories</p>
                  {available.map((inst) => {
                    const choices = inst.repositories.filter((r) => !r.connected && !r.archived);
                    return (
                      <div key={inst.id} className="space-y-2">
                        <p className="text-xs text-slate-500">
                          {inst.login} · {choices.length} available
                          {' · '}
                          <a href={inst.manageUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                            Give the app access to more repositories on GitHub
                          </a>
                        </p>
                        {choices.length === 0 && <p className="text-sm text-slate-500">Every accessible repository is already connected.</p>}
                        {choices.map((r) => (
                          <label key={r.githubRepoId} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                            <input type="checkbox" checked={picked.includes(r.githubRepoId)}
                              onChange={(e) => setPicked((p) => (e.target.checked ? [...p, r.githubRepoId] : p.filter((x) => x !== r.githubRepoId)))} />
                            {r.fullName} {r.private && <span className="text-xs text-slate-500">(private)</span>}
                          </label>
                        ))}
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2">
                    <button id="org-github-connect-repos-btn" className="sx-btn sx-btn-sm" disabled={picked.length === 0 || busy === 'repos'}
                      style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }} onClick={() => void connectPicked()}>
                      {busy === 'repos' ? 'Connecting…' : `Connect ${picked.length || ''} selected`.trim()}
                    </button>
                    <button className="sx-btn sx-btn-secondary sx-btn-sm" onClick={() => setAvailable(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {ghMsg && <p className="text-xs text-slate-400">{ghMsg}</p>}
        </div>
      </div>
    </OrgShell>
  );
}
