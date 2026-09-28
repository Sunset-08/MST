'use client';

// ============================================================
// SECUREX — Participant Context
// Server state: participant, stats, streak — sourced from the backend
// Points are the single scoring metric (NO XP)
// ============================================================

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Me, ParticipantStats } from '@/lib/types';
import { getMyStats } from '@/lib/api/profile';
import { errorMessage } from '@/lib/api/client';
import { useAuth } from '@/lib/context/AuthContext';

interface ParticipantContextValue {
  participant: Me | null;
  stats: ParticipantStats | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  // Points-based helpers
  totalPoints: number;
  globalRank: number;
  currentStreak: number;
}

const ParticipantContext = createContext<ParticipantContextValue | null>(null);

export function ParticipantProvider({ children }: { children: React.ReactNode }) {
  const { me, status, error: authError, reload } = useAuth();
  const [stats, setStats] = useState<ParticipantStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      setStats(await getMyStats());
    } catch (err) {
      setStatsError(errorMessage(err, 'Failed to load participant data'));
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') void loadStats();
    else setStats(null);
  }, [status, me?.id, loadStats]);

  const refresh = useCallback(async () => {
    await Promise.all([reload(), loadStats()]);
  }, [reload, loadStats]);

  return (
    <ParticipantContext.Provider
      value={{
        participant: me,
        stats,
        isLoading: status === 'loading' || (status === 'authenticated' && (!me || (statsLoading && !stats))),
        error: statsError ?? authError,
        refresh,
        totalPoints: me?.points ?? 0,
        globalRank: me?.globalRank ?? 0,
        currentStreak: stats?.streak.current ?? me?.currentStreak ?? 0,
      }}
    >
      {children}
    </ParticipantContext.Provider>
  );
}

export function useParticipant() {
  const ctx = useContext(ParticipantContext);
  if (!ctx) throw new Error('useParticipant must be used within ParticipantProvider');
  return ctx;
}
