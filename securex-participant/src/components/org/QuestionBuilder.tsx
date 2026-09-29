'use client';

// ============================================================
// SECUREX — Challenge Question Builder
// Member 2 — Organization Side Add-On
//
// Allows organization admin to configure valid questions
// for a security challenge. Supports:
//   - Multiple choice (with A/B/C/D options and correct answer)
//   - Short answer
//   - Structured response
//   - Security reasoning
// ============================================================

import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, HelpCircle, CheckSquare } from 'lucide-react';
import type { ChallengeQuestion, QuestionType } from '@/lib/types/org';

// ----------------------------------------------------------
// Utility: generate a new empty question
// ----------------------------------------------------------

function newQuestion(type: QuestionType = 'multiple_choice'): ChallengeQuestion {
  return {
    id: 'q-' + Math.random().toString(36).slice(2, 10),
    type,
    questionText: '',
    options:
      type === 'multiple_choice'
        ? [
            { id: 'A', text: '' },
            { id: 'B', text: '' },
            { id: 'C', text: '' },
            { id: 'D', text: '' },
          ]
        : undefined,
    correctAnswer: type === 'multiple_choice' ? 'A' : undefined,
    expectedAnswer: type !== 'multiple_choice' ? '' : undefined,
    points: 10,
  };
}

// ----------------------------------------------------------
// Question type labels
// ----------------------------------------------------------

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: '🔘 Multiple Choice',
  short_answer: '✏️ Short Answer',
  structured_response: '📋 Structured Response',
  security_reasoning: '🔒 Security Reasoning',
};

// ----------------------------------------------------------
// Single question editor
// ----------------------------------------------------------

function QuestionEditor({
  question,
  index,
  onUpdate,
  onRemove,
}: {
  question: ChallengeQuestion;
  index: number;
  onUpdate: (q: ChallengeQuestion) => void;
  onRemove: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  function updateField<K extends keyof ChallengeQuestion>(key: K, value: ChallengeQuestion[K]) {
    onUpdate({ ...question, [key]: value });
  }

  function updateOption(optionId: string, text: string) {
    onUpdate({
      ...question,
      options: question.options?.map((o) => (o.id === optionId ? { ...o, text } : o)),
    });
  }

  function changeType(newType: QuestionType) {
    const base = newQuestion(newType);
    onUpdate({ ...base, id: question.id, questionText: question.questionText, points: question.points });
  }

  return (
    <div
      className="sx-card border rounded-xl overflow-hidden"
      style={{ borderColor: 'rgba(139, 92, 246, 0.2)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer"
        style={{ background: 'rgba(139, 92, 246, 0.06)' }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white"
            style={{ background: 'rgba(139, 92, 246, 0.4)' }}
          >
            {index + 1}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {question.questionText.trim() || `Question ${index + 1}`}
            </p>
            <p className="text-xs text-slate-500">{QUESTION_TYPE_LABELS[question.type]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{question.points} pts</span>
          <button
            type="button"
            id={`remove-question-${index}-btn`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="sx-btn-ghost p-1.5 rounded-lg hover:text-rose-400"
            title="Remove question"
          >
            <Trash2 size={14} />
          </button>
          {collapsed ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronUp size={16} className="text-slate-500" />}
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="p-5 space-y-4">
          {/* Question type selector */}
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block">Question type</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((type) => (
              <button
                key={type}
                type="button"
                id={`question-${index}-type-${type}`}
                onClick={() => changeType(type)}
                className="text-xs px-3 py-2 rounded-lg border transition-all"
                style={{
                  background: question.type === type ? 'rgba(139, 92, 246, 0.2)' : 'var(--sx-bg-elevated)',
                  borderColor: question.type === type ? 'rgba(139, 92, 246, 0.5)' : 'rgba(255,255,255,0.08)',
                  color: question.type === type ? '#c4b5fd' : 'var(--sx-text-secondary)',
                }}
              >
                {QUESTION_TYPE_LABELS[type]}
              </button>
            ))}
          </div>

          {/* Question text */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Question Text
            </label>
            <textarea
              id={`question-${index}-text`}
              className="sx-textarea"
              placeholder="What causes the authentication bypass?"
              value={question.questionText}
              onChange={(e) => updateField('questionText', e.target.value)}
              rows={2}
              style={{ minHeight: '70px' }}
            />
          </div>

          {/* Multiple choice options */}
          {question.type === 'multiple_choice' && question.options && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Answer Options
              </label>
              {question.options.map((opt) => (
                <div key={opt.id} className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{
                      background:
                        question.correctAnswer === opt.id
                          ? 'rgba(52, 211, 153, 0.2)'
                          : 'rgba(255,255,255,0.05)',
                      color: question.correctAnswer === opt.id ? '#34d399' : '#64748b',
                      border:
                        question.correctAnswer === opt.id
                          ? '1px solid rgba(52, 211, 153, 0.4)'
                          : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {opt.id}
                  </div>
                  <input
                    id={`question-${index}-option-${opt.id}`}
                    type="text"
                    className="sx-input flex-1"
                    placeholder={`Option ${opt.id}`}
                    value={opt.text}
                    onChange={(e) => updateOption(opt.id, e.target.value)}
                  />
                  <button
                    type="button"
                    id={`question-${index}-correct-${opt.id}-btn`}
                    onClick={() => updateField('correctAnswer', opt.id)}
                    className="text-xs px-3 py-2 rounded-lg border transition-all flex-shrink-0"
                    title="Set as correct answer"
                    style={{
                      background:
                        question.correctAnswer === opt.id
                          ? 'rgba(52, 211, 153, 0.15)'
                          : 'transparent',
                      borderColor:
                        question.correctAnswer === opt.id
                          ? 'rgba(52, 211, 153, 0.4)'
                          : 'rgba(255,255,255,0.08)',
                      color: question.correctAnswer === opt.id ? '#34d399' : '#64748b',
                    }}
                  >
                    {question.correctAnswer === opt.id ? (
                      <CheckSquare size={13} />
                    ) : (
                      <span className="text-xs">✓</span>
                    )}
                  </button>
                </div>
              ))}
              <p className="text-xs text-slate-600">Click ✓ to mark the correct answer.</p>
            </div>
          )}

          {/* Expected answer for non-MC */}
          {question.type !== 'multiple_choice' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Expected Answer / Guidance
              </label>
              <textarea
                id={`question-${index}-expected`}
                className="sx-textarea"
                placeholder="Describe what a correct answer should include..."
                value={question.expectedAnswer ?? ''}
                onChange={(e) => updateField('expectedAnswer', e.target.value)}
                rows={3}
                style={{ minHeight: '80px' }}
              />
            </div>
          )}

          {/* Points */}
          <div className="space-y-1 max-w-[180px]">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Question Points
            </label>
            <input
              id={`question-${index}-points`}
              type="number"
              className="sx-input"
              min={1}
              max={100}
              value={question.points}
              onChange={(e) => updateField('points', Number(e.target.value))}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------
// Question Builder (exported)
// ----------------------------------------------------------

interface QuestionBuilderProps {
  questions: ChallengeQuestion[];
  onChange: (questions: ChallengeQuestion[]) => void;
}

export function QuestionBuilder({ questions, onChange }: QuestionBuilderProps) {
  const [newType, setNewType] = useState<QuestionType>('multiple_choice');
  function addQuestion(type: QuestionType = 'multiple_choice') {
    onChange([...questions, newQuestion(type)]);
  }

  function updateQuestion(index: number, updated: ChallengeQuestion) {
    const next = [...questions];
    next[index] = updated;
    onChange(next);
  }

  function removeQuestion(index: number) {
    onChange(questions.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {/* Existing questions */}
      {questions.length === 0 && (
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: 'rgba(139, 92, 246, 0.04)', border: '1px dashed rgba(139, 92, 246, 0.2)' }}
        >
          <HelpCircle size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 font-medium">No questions yet</p>
          <p className="text-xs text-slate-600 mt-1">
            Add at least one valid question for participants to answer.
          </p>
        </div>
      )}

      {questions.map((q, idx) => (
        <QuestionEditor
          key={q.id}
          question={q}
          index={idx}
          onUpdate={(updated) => updateQuestion(idx, updated)}
          onRemove={() => removeQuestion(idx)}
        />
      ))}

      {/* Add question: one control; the type of an existing question is changed inside its own editor */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="add-question-type"
          className="sx-input"
          style={{ width: 'auto', minWidth: 210, appearance: 'none', cursor: 'pointer' }}
          value={newType}
          onChange={(e) => setNewType(e.target.value as QuestionType)}
          aria-label="Type of the question to add"
        >
          {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((type) => (
            <option key={type} value={type}>{QUESTION_TYPE_LABELS[type]}</option>
          ))}
        </select>
        <button
          type="button"
          id="add-question-btn"
          onClick={() => addQuestion(newType)}
          className="sx-btn sx-btn-secondary sx-btn-sm"
        >
          <Plus size={14} />
          Add question
        </button>
      </div>

      {/* Summary */}
      {questions.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span>{questions.length} question{questions.length !== 1 ? 's' : ''}</span>
          <span>•</span>
          <span>
            {questions.reduce((acc, q) => acc + q.points, 0)} total points
          </span>
        </div>
      )}
    </div>
  );
}
