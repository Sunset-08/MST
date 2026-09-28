'use client';

// ============================================================
// SECUREX — Challenge Workspace
// Supports: Code/Fix, Investigation, SecurityReport challenge types
// ============================================================

import { use, useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { getChallengeById, startChallenge } from '@/lib/api/challenges';
import { errorMessage } from '@/lib/api/client';
import { submitAttempt, waitForVerification, type SubmissionPayload } from '@/lib/api/submissions';
import type { Challenge, ChallengeAttempt, ChallengeQuestionPublic, VerificationResult } from '@/lib/types';
import { cn, DIFFICULTY_BG, formatPoints } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Zap, Coins, Info, Code2, Search, FileText, AlertTriangle } from 'lucide-react';
import { VerifiedCard, FailedCard, PendingCard } from '@/components/participant/verification/VerificationResult';

// ============================================================
// Sub-forms for each challenge type
// ============================================================

function CodeFixForm({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (k: string, v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-2">
          Patch / Solution Code *
        </label>
        <p className="text-xs text-slate-500 mb-2">
          Paste your complete fix. Include the full modified file(s) or a unified diff.
        </p>
        <textarea
          id="submission-patch"
          placeholder={`// Example:\nfunction sanitizeInput(input: string): string {\n  return DOMPurify.sanitize(input);\n}`}
          value={value.patch ?? ''}
          onChange={(e) => onChange('patch', e.target.value)}
          className="code-area min-h-[240px]"
          required
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">Repository / PR URL</label>
          <input
            id="submission-repo-url"
            type="url"
            placeholder="https://github.com/..."
            value={value.repositoryUrl ?? ''}
            onChange={(e) => onChange('repositoryUrl', e.target.value)}
            className="sx-input"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">Commit Hash</label>
          <input
            id="submission-commit"
            type="text"
            placeholder="abc1234..."
            value={value.commitHash ?? ''}
            onChange={(e) => onChange('commitHash', e.target.value)}
            className="sx-input font-mono"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-2">Explanation *</label>
        <p className="text-xs text-slate-500 mb-2">
          Explain the vulnerability and how your fix addresses it.
        </p>
        <textarea
          id="submission-explanation"
          placeholder="The vulnerability is caused by... My fix works by..."
          value={value.explanation ?? ''}
          onChange={(e) => onChange('explanation', e.target.value)}
          className="sx-textarea"
          rows={4}
          required
        />
      </div>
    </div>
  );
}

function InvestigationForm({
  questions,
  value,
  onChange,
}: {
  questions: ChallengeQuestionPublic[];
  value: Record<string, string>;
  onChange: (k: string, v: string) => void;
}) {
  if (questions.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-300">Describe your findings for the reviewer.</p>
        <textarea
          id="submission-findings"
          placeholder="What is the vulnerability, how is it exploited, where is it in the code, and how would you fix it?"
          value={value.findings ?? ''}
          onChange={(e) => onChange('findings', e.target.value)}
          className="sx-textarea"
          rows={8}
          required
        />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className="bg-blue-400/5 border border-blue-400/15 rounded-xl p-4">
        <p className="text-sm text-slate-300">Answer the following questions about the security vulnerability.</p>
      </div>

      {questions.map((q, i) => (
        <div key={q.id}>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            {i + 1}. {q.questionText} *
          </label>
          {q.type === 'multiple_choice' && q.options ? (
            <div className="space-y-2">
              {q.options.map((o) => (
                <label key={o.id} className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2 cursor-pointer hover:bg-white/5">
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    value={o.id}
                    checked={value[q.id] === o.id}
                    onChange={() => onChange(q.id, o.id)}
                    required
                  />
                  <span className="text-sm text-slate-300"><strong className="text-white">{o.id}.</strong> {o.text}</span>
                </label>
              ))}
            </div>
          ) : (
            <textarea
              id={`submission-${q.id}`}
              value={value[q.id] ?? ''}
              onChange={(e) => onChange(q.id, e.target.value)}
              className="sx-textarea"
              rows={q.type === 'short_answer' ? 2 : 4}
              required
            />
          )}
        </div>
      ))}
    </div>
  );
}

function SecurityReportForm({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (k: string, v: string) => void;
}) {
  return (
    <div className="space-y-5">
      {[
        {
          key: 'vulnerability',
          label: '1. Vulnerability',
          placeholder: 'CVE type, OWASP category, technical description...',
          rows: 3,
        },
        {
          key: 'impact',
          label: '2. Impact',
          placeholder: 'Confidentiality / Integrity / Availability impact. CVSS score if applicable...',
          rows: 3,
        },
        {
          key: 'attackPath',
          label: '3. Attack Path',
          placeholder: 'Step-by-step: 1. Attacker visits URL... 2. Injects payload... 3. Data exfiltrated...',
          rows: 4,
        },
        {
          key: 'recommendedFix',
          label: '4. Recommended Fix',
          placeholder: 'Specific code changes, configurations, or architectural fixes...',
          rows: 4,
        },
        {
          key: 'evidence',
          label: '5. Evidence (optional)',
          placeholder: 'PoC payload, screenshots description, logs...',
          rows: 3,
        },
      ].map(({ key, label, placeholder, rows }) => (
        <div key={key}>
          <label className="block text-sm font-semibold text-slate-300 mb-2">{label}</label>
          <textarea
            id={`submission-report-${key}`}
            placeholder={placeholder}
            value={value[key] ?? ''}
            onChange={(e) => onChange(key, e.target.value)}
            className="sx-textarea"
            rows={rows}
          />
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Main Workspace Page
// ============================================================

export default function ChallengeWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [attempt, setAttempt] = useState<ChallengeAttempt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [submitError, setSubmitError] = useState('');

  // Load the challenge and create (or resume) the participant's attempt.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await getChallengeById(id);
        if (cancelled) return;
        setChallenge(c);
        setAttempt(await startChallenge(id));
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err, 'Could not open this challenge'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  function updateField(k: string, v: string) {
    setFormData((prev) => ({ ...prev, [k]: v }));
  }

  function buildPayload(c: Challenge): SubmissionPayload {
    const base: SubmissionPayload = { challengeId: c.id, type: c.type };
    if (c.type === 'Investigation') {
      const structuredAnswers = Object.fromEntries(Object.entries(formData).filter(([, v]) => v.trim() !== ''));
      return { ...base, structuredAnswers };
    }
    return { ...base, ...formData };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge || !attempt) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const pending = await submitAttempt(attempt.id, buildPayload(challenge));
      setResult(pending);
      // Rule-based challenges verify within moments; manual reviews stay Pending until a reviewer decides.
      await waitForVerification(pending.submissionId, setResult);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Submission failed'));
      setResult(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetry() {
    setResult(null);
    setFormData({});
    setSubmitError('');
    try {
      setAttempt(await startChallenge(id));
    } catch (err) {
      setSubmitError(errorMessage(err, 'Could not start a new attempt'));
    }
  }

  const CHALLENGE_TABS = challenge
    ? [
        { id: 'code', label: 'Code/Fix', icon: Code2, enabled: challenge.type === 'Fix' || challenge.type === 'Code' },
        { id: 'investigation', label: 'Investigation', icon: Search, enabled: challenge.type === 'Investigation' },
        { id: 'report', label: 'Security Report', icon: FileText, enabled: challenge.type === 'SecurityReport' },
      ].filter((t) => t.enabled)
    : [];

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-16 w-full rounded-xl" />
          ))}
        </div>
      </AppShell>
    );
  }

  if (!challenge || !attempt) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto text-center py-20 space-y-4">
          <AlertTriangle size={36} className="text-amber-400 mx-auto" />
          <p className="text-slate-300">{loadError || 'This challenge is not available.'}</p>
          <Link href={`/challenges/${id}`} className="sx-btn sx-btn-secondary inline-flex">Back to challenge</Link>
        </div>
      </AppShell>
    );
  }

  // Show verification result
  if (result) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto">
          <Link href="/challenges" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-white transition-colors mb-6">
            <ArrowLeft size={14} /> Back to Challenges
          </Link>
          {result.status === 'Verified' && (
            <VerifiedCard result={result} challengeTitle={challenge.title} />
          )}
          {result.status === 'Failed' && (
            <FailedCard result={result} onRetry={handleRetry} />
          )}
          {result.status === 'Pending' && <PendingCard reason={result.reason ?? undefined} />}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back */}
        <Link
          href={`/challenges/${id}`}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          {challenge.title}
        </Link>

        {/* Challenge header strip */}
        <div className="sx-card p-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className={cn('sx-badge', DIFFICULTY_BG[challenge.difficulty])}>
              {challenge.difficulty}
            </span>
            <h1 className="font-bold text-white">{challenge.title}</h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {attempt.maxAttempts ? (
              <span className="text-xs text-slate-500">Attempt {attempt.attemptNumber} of {attempt.maxAttempts}</span>
            ) : null}
            <span className="flex items-center gap-1.5 text-amber-400 font-bold">
              <Zap size={14} />
              +{formatPoints(challenge.pointsReward)} pts on verify
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <Coins size={14} />
              +{challenge.mstReward} MSTC
            </span>
          </div>
        </div>

        {/* Verification notice */}
        <div className="flex items-start gap-3 bg-amber-400/5 border border-amber-400/15 rounded-xl p-4">
          <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-slate-400">
            <strong className="text-amber-400">Points are awarded only after backend verification.</strong>{' '}
            Submitting a solution does not instantly award points. The backend engine will verify your submission.
          </p>
        </div>

        {/* Description reference */}
        <div className="sx-card p-4">
          <div className="flex items-start gap-3">
            <Info size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-slate-400 leading-relaxed">{challenge.description}</p>
          </div>
        </div>

        {/* Submission form */}
        <form onSubmit={handleSubmit} id="submission-form" className="sx-card p-6 space-y-6">
          <div className="flex items-center gap-2 border-b border-white/5 pb-4">
            {CHALLENGE_TABS.map(({ id: tabId, label, icon: Icon }) => (
              <div key={tabId} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-400/10 border border-blue-400/20">
                <Icon size={14} className="text-blue-400" />
                <span className="text-sm font-semibold text-blue-300">{label}</span>
              </div>
            ))}
          </div>

          {(challenge.type === 'Fix' || challenge.type === 'Code') && (
            <CodeFixForm value={formData} onChange={updateField} />
          )}
          {challenge.type === 'Investigation' && (
            <InvestigationForm questions={challenge.questions ?? []} value={formData} onChange={updateField} />
          )}
          {challenge.type === 'SecurityReport' && (
            <SecurityReportForm value={formData} onChange={updateField} />
          )}

          {submitError && (
            <div className="bg-rose-400/10 border border-rose-400/20 rounded-xl p-4">
              <p className="text-sm text-rose-400">{submitError}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-white/5 flex-wrap gap-3">
            <p className="text-xs text-slate-600">
              By submitting, you agree that your solution will be verified by the SECUREX backend engine.
            </p>
            <button
              id="submit-solution-btn"
              type="submit"
              disabled={submitting}
              className="sx-btn sx-btn-primary sx-btn-lg gap-3"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send size={18} />
                  Submit for Verification
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
