'use client';

// ============================================================
// SECUREX — Challenge Explorer
// ============================================================

import { useState, useMemo, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ChallengeCard } from '@/components/participant/challenges/ChallengeCard';
import { ChallengeFilters } from '@/components/participant/challenges/ChallengeFilters';
import { getChallenges } from '@/lib/api/challenges';
import type { Challenge, ChallengeFilters as FiltersType } from '@/lib/types';
import { Target, LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';

const INITIAL_FILTERS: FiltersType = {
  search: '',
  difficulty: 'All',
  category: 'All',
  status: 'All',
};

type ViewMode = 'grid' | 'list';

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<FiltersType>(INITIAL_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Load challenges on mount and filter changes
  useEffect(() => {
    setIsLoading(true);
    getChallenges(filters)
      .then((r) => setChallenges(r.data))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [filters]);

  function updateFilters(partial: Partial<FiltersType>) {
    setFilters((prev) => ({ ...prev, ...partial }));
  }

  const stats = useMemo(() => ({
    total: challenges.length,
    easy: challenges.filter((c) => c.difficulty === 'Easy').length,
    medium: challenges.filter((c) => c.difficulty === 'Medium').length,
    hard: challenges.filter((c) => c.difficulty === 'Hard').length,
  }), [challenges]);

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Target size={24} className="text-blue-400" />
            Challenge Explorer
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Find and solve security challenges to earn Points and MSTC rewards
          </p>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-6 py-4 border-y border-white/5 flex-wrap">
          <div className="text-sm">
            <span className="font-bold text-white">{stats.total}</span>
            <span className="text-slate-500 ml-1">challenges</span>
          </div>
          <div className="text-sm">
            <span className="font-bold text-emerald-400">{stats.easy}</span>
            <span className="text-slate-500 ml-1">Easy</span>
          </div>
          <div className="text-sm">
            <span className="font-bold text-amber-400">{stats.medium}</span>
            <span className="text-slate-500 ml-1">Medium</span>
          </div>
          <div className="text-sm">
            <span className="font-bold text-rose-400">{stats.hard}</span>
            <span className="text-slate-500 ml-1">Hard</span>
          </div>

          {/* View toggle */}
          <div className="ml-auto flex items-center gap-1 bg-white/5 rounded-lg p-1">
            <button
              id="view-grid-btn"
              onClick={() => setViewMode('grid')}
              className={cn('p-1.5 rounded', viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white')}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              id="view-list-btn"
              onClick={() => setViewMode('list')}
              className={cn('p-1.5 rounded', viewMode === 'list' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white')}
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex gap-6">
          {/* Filters sidebar */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="sx-card p-5 sticky top-20">
              <ChallengeFilters
                filters={filters}
                onChange={updateFilters}
                total={stats.total}
              />
            </div>
          </aside>

          {/* Challenge list / grid */}
          <div className="flex-1 min-w-0">
            {/* Mobile filters */}
            <div className="lg:hidden mb-4">
              <div className="sx-card p-4">
                <ChallengeFilters
                  filters={filters}
                  onChange={updateFilters}
                  total={stats.total}
                />
              </div>
            </div>

            {isLoading ? (
              <div className={cn(
                viewMode === 'grid'
                  ? 'grid sm:grid-cols-2 gap-4'
                  : 'space-y-4'
              )}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="sx-card p-5 space-y-3 h-52">
                    <div className="skeleton h-4 w-20" />
                    <div className="skeleton h-6 w-3/4" />
                    <div className="skeleton h-4 w-full" />
                    <div className="skeleton h-4 w-2/3" />
                  </div>
                ))}
              </div>
            ) : challenges.length === 0 ? (
              <div className="text-center py-20">
                <Target size={48} className="text-slate-700 mx-auto mb-4" />
                <p className="text-slate-400 font-medium">No challenges found</p>
                <p className="text-slate-600 text-sm mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              <div className={cn(
                viewMode === 'grid'
                  ? 'grid sm:grid-cols-2 gap-4'
                  : 'space-y-4'
              )}>
                {challenges.map((c) => (
                  <ChallengeCard key={c.id} challenge={c} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
