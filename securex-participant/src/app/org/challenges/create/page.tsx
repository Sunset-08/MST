'use client';

// ============================================================
// SECUREX — Challenge Creation Page
// Member 2 — Organization Side Add-On
// Route: /org/challenges/create
// ============================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { OrgShell } from '@/components/org/OrgShell';
import { QuestionBuilder } from '@/components/org/QuestionBuilder';
import { PublishGate } from '@/components/org/PublishGate';
import { useOrg } from '@/lib/context/OrgContext';
import { validateChallengeDraft } from '@/lib/types/org';
import { getOrgGithub, listOrgGithubIssues, type OrgGithubIssue, type OrgGithubOverview } from '@/lib/api/org';
import Link from 'next/link';
import {
  FileText,
  GitBranch,
  Tag,
  Zap,
  Settings,
  HelpCircle,
  CheckSquare,
  Clock,
  Lock,
  AlertTriangle,
} from 'lucide-react';

// ----------------------------------------------------------
// Section wrapper
// ----------------------------------------------------------

function Section({
  title,
  icon,
  children,
  id,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="sx-card p-6 space-y-5">
      <h2 className="text-base font-bold text-white flex items-center gap-2">
        <span className="text-violet-400">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

// ----------------------------------------------------------
// Field row helpers
// ----------------------------------------------------------

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
        {label}
        {required && <span className="text-rose-400 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-600">{hint}</p>}
    </div>
  );
}

// ----------------------------------------------------------
// Select component
// ----------------------------------------------------------

function SxSelect({
  id,
  value,
  onChange,
  placeholder,
  options,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="sx-input"
      style={{ appearance: 'none', cursor: 'pointer' }}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ----------------------------------------------------------
// Page
// ----------------------------------------------------------

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: '🟢 Easy' },
  { value: 'medium', label: '🟡 Medium' },
  { value: 'hard', label: '🔴 Hard' },
  { value: 'expert', label: '🟣 Expert' },
];

const CHALLENGE_TYPE_OPTIONS = [
  { value: 'code', label: '💻 Code Review' },
  { value: 'investigation', label: '🔍 Investigation' },
  { value: 'fix', label: '🔧 Fix / Patch' },
  { value: 'security_report', label: '📄 Security Report' },
];

const VERIFICATION_TYPE_OPTIONS = [
  { value: 'automated_test', label: '⚡ Automated Test' },
  { value: 'rule_based', label: '📏 Rule-Based' },
  { value: 'admin_review', label: '👤 Admin Review' },
  { value: 'peer_review', label: '👥 Peer Review' },
];

const SECURITY_CATEGORY_OPTIONS = [
  { value: 'Smart Contract', label: '🔗 Smart Contract' },
  { value: 'Web Security', label: '🌐 Web Security' },
  { value: 'API Security', label: '🔌 API Security' },
  { value: 'Authentication', label: '🔑 Authentication' },
  { value: 'Authorization', label: '🛡️ Authorization' },
  { value: 'Cryptography', label: '🔒 Cryptography' },
  { value: 'Dependency / Supply Chain', label: '📦 Dependency / Supply Chain' },
  { value: 'Cloud / Infrastructure', label: '☁️ Cloud / Infrastructure' },
  { value: 'DevSecOps', label: '⚙️ DevSecOps' },
  { value: 'Frontend Security', label: '🖥️ Frontend Security' },
  { value: 'Backend Security', label: '🖧 Backend Security' },
  { value: 'Database Security', label: '🗄️ Database Security' },
  { value: 'Privacy', label: '👁️ Privacy' },
  { value: 'Configuration', label: '🔧 Configuration' },
];

export default function CreateChallengePage() {
  const router = useRouter();
  const { draft, updateDraft, publishChallenge } = useOrg();
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);
  const [publishError, setPublishError] = useState('');
  const [github, setGithub] = useState<OrgGithubOverview | null>(null);
  const [issues, setIssues] = useState<OrgGithubIssue[]>([]);

  useEffect(() => {
    getOrgGithub().then(setGithub).catch(() => setGithub(null));
  }, []);

  useEffect(() => {
    if (!draft.githubRepositoryId) { setIssues([]); return; }
    listOrgGithubIssues({ repositoryId: draft.githubRepositoryId, state: 'open', limit: 100 })
      .then((r) => setIssues(r.data))
      .catch(() => setIssues([]));
  }, [draft.githubRepositoryId]);

  const validation = validateChallengeDraft(draft);

  async function submit(status: 'published' | 'draft') {
    setIsPublishing(true);
    setPublishError('');
    try {
      const result = await publishChallenge(status);
      if (result.success) {
        setPublishSuccess(result.challengeId ?? 'new');
        setTimeout(() => router.push('/org/challenges'), 2000);
      } else {
        setPublishError(result.error ?? 'Could not save the challenge');
      }
    } finally {
      setIsPublishing(false);
    }
  }

  const handlePublish = () => (validation.isValid ? submit('published') : undefined);
  const canSaveDraft =
    draft.title.trim().length >= 3 && draft.description.trim().length >= 10 && !!draft.securityCategory &&
    !!draft.difficulty && !!draft.challengeType && !!draft.verificationType;

  if (publishSuccess) {
    return (
      <OrgShell>
        <div className="max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(52, 211, 153, 0.15)', border: '1px solid rgba(52, 211, 153, 0.3)' }}
          >
            <CheckSquare size={32} style={{ color: '#34d399' }} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Challenge saved 🎉</h2>
            <p className="text-slate-500 mt-2">
              Challenge ID: <code className="text-violet-400 font-mono">{publishSuccess}</code>
            </p>
            <p className="text-slate-600 text-sm mt-1">Redirecting to your challenges...</p>
          </div>
        </div>
      </OrgShell>
    );
  }

  return (
    <OrgShell>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Create Security Challenge</h1>
          <p className="text-slate-500 text-sm mt-1">
            Configure a real-world security issue for participants to investigate and resolve.
          </p>
        </div>



        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main form — left 2/3 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Basic Info */}
            <Section title="Challenge Details" icon={<FileText size={18} />} id="section-details">
              <Field label="Challenge Title" required>
                <input
                  id="challenge-title"
                  type="text"
                  className="sx-input"
                  placeholder="e.g. SQL Injection in Authentication Module"
                  value={draft.title}
                  onChange={(e) => updateDraft({ title: e.target.value })}
                />
              </Field>

              <Field label="Security Issue" required hint="Brief description of the security vulnerability type">
                <input
                  id="challenge-security-issue"
                  type="text"
                  className="sx-input"
                  placeholder="e.g. Authentication bypass via unsanitized SQL parameter"
                  value={draft.securityIssue}
                  onChange={(e) => updateDraft({ securityIssue: e.target.value })}
                />
              </Field>

              <Field label="Description" required>
                <textarea
                  id="challenge-description"
                  className="sx-textarea"
                  placeholder="Describe the security challenge, context, and what participants need to do..."
                  value={draft.description}
                  onChange={(e) => updateDraft({ description: e.target.value })}
                  rows={5}
                />
              </Field>
            </Section>

            {/* 2. GitHub */}
            <Section title="GitHub Reference" icon={<GitBranch size={18} />} id="section-github">
              {github && github.installations.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No GitHub account is connected yet.{' '}
                  <Link href="/org/settings#github-section" className="text-violet-400 underline">Connect GitHub in Settings</Link>{' '}
                  to pick a synchronized repository and issue.
                </p>
              ) : (
                <FieldRow>
                  <Field label="GitHub Repository" required hint="Repositories imported through the GitHub App">
                    <SxSelect
                      id="challenge-github-repo"
                      value={draft.githubRepositoryId}
                      onChange={(v) => {
                        const repo = github?.repositories.find((r) => r.id === v);
                        updateDraft({ githubRepositoryId: v, githubRepository: repo?.fullName ?? '', githubIssueId: '', githubIssueRef: '' });
                      }}
                      placeholder="Select repository..."
                      options={(github?.repositories ?? []).filter((r) => r.isActive).map((r) => ({ value: r.id, label: r.fullName }))}
                    />
                  </Field>
                  <Field label="GitHub Issue" hint="Optional: the issue this challenge is based on">
                    <SxSelect
                      id="challenge-github-issue"
                      value={draft.githubIssueId}
                      onChange={(v) => {
                        const issue = issues.find((i) => i.id === v);
                        updateDraft({ githubIssueId: v, githubIssueRef: issue ? `#${issue.number}` : '' });
                      }}
                      placeholder={draft.githubRepositoryId ? (issues.length ? 'Select issue...' : 'No open issues') : 'Select a repository first'}
                      options={issues.map((i) => ({ value: i.id, label: `#${i.number} ${i.title}${i.linkedChallengeId ? ' (already a challenge)' : ''}` }))}
                    />
                  </Field>
                </FieldRow>
              )}
            </Section>

            {/* 3. Classification */}
            <Section title="Classification" icon={<Tag size={18} />} id="section-classification">
              <FieldRow>
                <Field label="Security Category" required>
                  <SxSelect
                    id="challenge-category"
                    value={draft.securityCategory}
                    onChange={(v) => updateDraft({ securityCategory: v })}
                    placeholder="Select category..."
                    options={SECURITY_CATEGORY_OPTIONS}
                  />
                </Field>
                <Field label="Difficulty" required>
                  <SxSelect
                    id="challenge-difficulty"
                    value={draft.difficulty}
                    onChange={(v) => updateDraft({ difficulty: v as typeof draft.difficulty })}
                    placeholder="Select difficulty..."
                    options={DIFFICULTY_OPTIONS}
                  />
                </Field>
              </FieldRow>

              <FieldRow>
                <Field label="Challenge Type" required>
                  <SxSelect
                    id="challenge-type"
                    value={draft.challengeType}
                    onChange={(v) => updateDraft({ challengeType: v as typeof draft.challengeType })}
                    placeholder="Select type..."
                    options={CHALLENGE_TYPE_OPTIONS}
                  />
                </Field>
                <Field label="Verification Type" required>
                  <SxSelect
                    id="challenge-verification-type"
                    value={draft.verificationType}
                    onChange={(v) => updateDraft({ verificationType: v as typeof draft.verificationType })}
                    placeholder="Select verification..."
                    options={VERIFICATION_TYPE_OPTIONS}
                  />
                </Field>
              </FieldRow>
            </Section>

            {/* 4. Rewards & Constraints */}
            <Section title="Rewards & Constraints" icon={<Zap size={18} />} id="section-rewards">
              <FieldRow>
                <Field label="Points Reward" required hint="Points awarded on successful verification">
                  <input
                    id="challenge-points-reward"
                    type="number"
                    className="sx-input"
                    placeholder="500"
                    min={1}
                    value={draft.pointsReward}
                    onChange={(e) => updateDraft({ pointsReward: e.target.value === '' ? '' : Number(e.target.value) })}
                  />
                </Field>
                <Field label="MST Reward (MSTC)" required hint="Tokens transferred to winning participant">
                  <input
                    id="challenge-mst-reward"
                    type="number"
                    className="sx-input"
                    placeholder="25"
                    min={1}
                    value={draft.mstReward}
                    onChange={(e) => updateDraft({ mstReward: e.target.value === '' ? '' : Number(e.target.value) })}
                  />
                </Field>
              </FieldRow>

              <FieldRow>
                <Field label="Max Attempts" hint="Leave blank for unlimited">
                  <input
                    id="challenge-max-attempts"
                    type="number"
                    className="sx-input"
                    placeholder="Unlimited"
                    min={1}
                    value={draft.maxAttempts}
                    onChange={(e) => updateDraft({ maxAttempts: e.target.value === '' ? '' : Number(e.target.value) })}
                  />
                </Field>
                <Field label="Expiration Date/Time" hint="Leave blank for no expiry">
                  <input
                    id="challenge-expires-at"
                    type="datetime-local"
                    className="sx-input"
                    value={draft.expiresAt}
                    onChange={(e) => updateDraft({ expiresAt: e.target.value })}
                  />
                </Field>
              </FieldRow>
            </Section>

            {/* 5. Verification Criteria */}
            <Section title="Expected Solution Criteria" icon={<Settings size={18} />} id="section-verification">
              <Field
                label="Verification Criteria"
                required
                hint="Describe exactly what a valid solution must demonstrate. Member 3 uses this for automated/manual verification."
              >
                <textarea
                  id="challenge-solution-criteria"
                  className="sx-textarea"
                  placeholder="e.g. The submitted patch must: (1) add parameterized queries to all user-supplied inputs in auth.js, (2) pass the included test suite, (3) not introduce new security regressions..."
                  value={draft.expectedSolutionCriteria}
                  onChange={(e) => updateDraft({ expectedSolutionCriteria: e.target.value })}
                  rows={6}
                />
              </Field>
            </Section>

            {/* 6. Valid Questions */}
            <Section
              title="Valid Questions"
              icon={<HelpCircle size={18} />}
              id="section-questions"
            >
              <div
                className="flex items-start gap-3 px-4 py-3 rounded-lg text-xs"
                style={{ background: 'rgba(96, 165, 250, 0.06)', border: '1px solid rgba(96, 165, 250, 0.15)' }}
              >
                <HelpCircle size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-slate-400">
                  <p>
                    Add meaningful questions that probe the participant's understanding of the
                    security issue. At least <strong className="text-white">one question</strong> is required to publish.
                  </p>
                  <p className="mt-1 text-slate-500">
                    Example topics: component containing the vulnerability, possible attack paths,
                    security impact, fix strategy.
                  </p>
                </div>
              </div>

              <QuestionBuilder
                questions={draft.questions}
                onChange={(questions) => updateDraft({ questions })}
              />
            </Section>
          </div>

          {/* Sidebar — right 1/3 */}
          <div className="space-y-5">
            {/* Publish gate */}
            <PublishGate
              validation={validation}
              onPublish={handlePublish}
              onSaveDraft={() => submit('draft')}
              canSaveDraft={canSaveDraft}
              error={publishError}
              isPublishing={isPublishing}
            />



            {/* Challenge flow steps */}
            <div className="sx-card p-5 space-y-4">
              <h3 className="text-sm font-bold text-white">Publishing Flow</h3>
              <ol className="space-y-3 text-xs text-slate-500">
                {[
                  ['Org Login', true],
                  ['Create Challenge', true],
                  ['Add Valid Questions', draft.questions.length > 0],
                  ['Configure Verification', !!draft.verificationType],
                  ['Configure Points', !!draft.pointsReward],
                  ['Configure MST Reward', !!draft.mstReward],
                  ['Publish', validation.isValid],
                ].map(([step, done], i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{
                        background: done ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255,255,255,0.05)',
                        color: done ? '#34d399' : '#475569',
                        border: done ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      {done ? '✓' : i + 1}
                    </span>
                    <span style={{ color: done ? '#94a3b8' : '#475569' }}>{step as string}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </OrgShell>
  );
}
