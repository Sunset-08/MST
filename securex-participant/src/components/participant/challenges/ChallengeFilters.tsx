'use client';

// ============================================================
// SECUREX — ChallengeFilters
// ============================================================

import { Search, X } from 'lucide-react';
import type { ChallengeFilters, Difficulty, SecurityCategory } from '@/lib/types';

const DIFFICULTIES: Array<Difficulty | 'All'> = ['All', 'Easy', 'Medium', 'Hard', 'Expert'];

const CATEGORIES: Array<SecurityCategory | 'All'> = [
  'All',
  'Smart Contract',
  'Web Security',
  'API Security',
  'Authentication',
  'Authorization',
  'Cryptography',
  'Dependency / Supply Chain',
  'Cloud / Infrastructure',
  'DevSecOps',
  'Frontend Security',
  'Backend Security',
  'Database Security',
  'Privacy',
  'Configuration',
];

const DIFFICULTY_ACTIVE: Record<string, string> = {
  All: 'bg-white/10 text-white',
  Easy: 'bg-emerald-400/15 text-emerald-400 border-emerald-400/30',
  Medium: 'bg-amber-400/15 text-amber-400 border-amber-400/30',
  Hard: 'bg-rose-400/15 text-rose-400 border-rose-400/30',
  Expert: 'bg-purple-400/15 text-purple-400 border-purple-400/30',
};

interface ChallengeFiltersProps {
  filters: ChallengeFilters;
  onChange: (f: Partial<ChallengeFilters>) => void;
  total: number;
}

export function ChallengeFilters({ filters, onChange, total }: ChallengeFiltersProps) {
  const hasActiveFilters =
    filters.search || filters.difficulty !== 'All' || filters.category !== 'All';

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="sx-input-wrapper">
        <Search
          size={16}
          className="sx-input-leading-icon"
        />
        <input
          id="challenge-search"
          type="text"
          placeholder="Search challenges..."
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          className={`sx-input sx-input-icon-left${filters.search ? ' sx-input-icon-right' : ''}`}
        />
        {filters.search && (
          <button
            onClick={() => onChange({ search: '' })}
            className="sx-input-trailing-icon"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Difficulty filter */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
          Difficulty
        </p>
        <div className="flex flex-wrap gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              id={`filter-difficulty-${d.toLowerCase()}`}
              onClick={() => onChange({ difficulty: d })}
              className={`sx-badge border cursor-pointer transition-all ${
                filters.difficulty === d
                  ? DIFFICULTY_ACTIVE[d]
                  : 'bg-transparent text-slate-400 border-white/10 hover:border-white/20 hover:text-white'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Category filter */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
          Category
        </p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              id={`filter-category-${c.toLowerCase().replace(/[\s/]/g, '-')}`}
              onClick={() => onChange({ category: c })}
              className={`sx-badge border cursor-pointer transition-all ${
                filters.category === c
                  ? 'bg-blue-400/15 text-blue-400 border-blue-400/30'
                  : 'bg-transparent text-slate-400 border-white/10 hover:border-white/20 hover:text-white'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Results count + clear */}
      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <p className="text-sm text-slate-500">
          <span className="font-bold text-white">{total}</span> challenges
        </p>
        {hasActiveFilters && (
          <button
            id="filter-clear-btn"
            onClick={() => onChange({ search: '', difficulty: 'All', category: 'All', status: 'All' })}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
          >
            <X size={12} />
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
