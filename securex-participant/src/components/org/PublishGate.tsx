'use client';

// ============================================================
// SECUREX — Publish Gate
// Member 2 — Organization Side Add-On
//
// Shows a locked publish button with validation checklist
// until all conditions are met (including MST funding).
// ============================================================

import { Lock, CheckCircle2, XCircle, Rocket } from 'lucide-react';
import type { PublishValidationResult } from '@/lib/types/org';

interface PublishGateProps {
  validation: PublishValidationResult;
  onPublish: () => void;
  onSaveDraft?: () => void;
  canSaveDraft?: boolean;
  error?: string;
  isPublishing: boolean;
}

export function PublishGate({ validation, onPublish, onSaveDraft, canSaveDraft, error, isPublishing }: PublishGateProps) {
  const { isValid, isMstSatisfied, missingFields } = validation;

  return (
    <div className="sx-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: isValid ? 'rgba(52, 211, 153, 0.1)' : 'rgba(248, 113, 113, 0.1)',
            border: `1px solid ${isValid ? 'rgba(52, 211, 153, 0.3)' : 'rgba(248, 113, 113, 0.2)'}`,
          }}
        >
          {isValid ? (
            <Rocket size={20} style={{ color: '#34d399' }} />
          ) : (
            <Lock size={20} style={{ color: '#f87171' }} />
          )}
        </div>
        <div>
          <h3 className="font-bold text-white">Publish Challenge</h3>
          <p className="text-xs text-slate-500">
            {isValid ? 'All requirements met — ready to publish' : 'Complete all requirements to publish'}
          </p>
        </div>
      </div>

      {/* Missing fields checklist */}
      {missingFields.length > 0 && (
        <div
          className="rounded-xl p-4 space-y-2"
          style={{ background: 'rgba(248, 113, 113, 0.05)', border: '1px solid rgba(248, 113, 113, 0.15)' }}
        >
          <p className="text-xs font-semibold text-rose-400 uppercase tracking-wide mb-3">
            Missing requirements:
          </p>
          {missingFields.map((field, i) => (
            <div key={i} className="flex items-center gap-2">
              <XCircle size={14} style={{ color: '#f87171' }} className="flex-shrink-0" />
              <span className="text-xs text-slate-400">{field}</span>
            </div>
          ))}
        </div>
      )}

      {/* Completed requirements */}
      {isValid && (
        <div
          className="rounded-xl p-4 space-y-2"
          style={{ background: 'rgba(52, 211, 153, 0.05)', border: '1px solid rgba(52, 211, 153, 0.2)' }}
        >
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-3">
            All requirements satisfied ✓
          </p>
          {['MST funding', 'Challenge details', 'Questions', 'Verification criteria', 'Rewards configured'].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <CheckCircle2 size={14} style={{ color: '#34d399' }} className="flex-shrink-0" />
              <span className="text-xs text-slate-400">{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* MST gate warning */}
      {!isMstSatisfied && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-xs"
          style={{ background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.2)' }}
        >
          <Lock size={14} className="text-amber-400 flex-shrink-0" />
          <p className="text-amber-300">
            Minimum MST funding is required before publishing a challenge.
          </p>
        </div>
      )}

      {/* Publish button */}
      <button
        id="org-publish-challenge-btn"
        type="button"
        disabled={!isValid || isPublishing}
        onClick={onPublish}
        title={!isValid ? 'Complete all requirements to publish' : 'Publish this challenge'}
        className="sx-btn w-full relative"
        style={{
          background: isValid
            ? 'linear-gradient(135deg, #10b981, #059669)'
            : 'rgba(255,255,255,0.05)',
          color: isValid ? 'white' : 'var(--sx-text-muted)',
          border: isValid ? 'none' : '1px solid rgba(255,255,255,0.08)',
          cursor: isValid ? 'pointer' : 'not-allowed',
        }}
      >
        {isPublishing ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Publishing...
          </>
        ) : (
          <>
            {!isValid && <Lock size={15} />}
            {isValid && <Rocket size={15} />}
            Publish Challenge
            {!isValid && (
              <span className="ml-auto text-lg leading-none">🔒</span>
            )}
          </>
        )}
      </button>

      {onSaveDraft && (
        <button
          id="org-save-draft-btn"
          type="button"
          disabled={!canSaveDraft || isPublishing}
          onClick={onSaveDraft}
          className="sx-btn sx-btn-secondary w-full"
        >
          Save as draft
        </button>
      )}

      {error && (
        <div className="rounded-lg p-3 text-xs text-rose-300" style={{ background: 'rgba(248, 113, 113, 0.08)', border: '1px solid rgba(248, 113, 113, 0.2)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
