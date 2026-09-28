'use client';

// ============================================================
// SECUREX — Participant Context
// Server state: participant, stats, streak — sourced from backend
// Points are the single scoring metric (NO XP)
// ============================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Participant, ParticipantStats } from '@/lib/types';
import { getMe, getMyStats } from '@/lib/api/profile';

interface ParticipantContextValue {
  participant: Participant | null;
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
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [stats, setStats] = useState<ParticipantStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [p, s] = await Promise.all([getMe(), getMyStats()]);
      setParticipant(p);
      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load participant data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ParticipantContext.Provider
      value={{
        participant,
        stats,
        isLoading,
        error,
        refresh,
        totalPoints: participant?.points ?? 0,
        globalRank: participant?.globalRank ?? 0,
        currentStreak: stats?.streak.current ?? 0,
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
