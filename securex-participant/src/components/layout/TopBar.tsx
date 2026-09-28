'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, Bell, Flame, Zap, Trophy } from 'lucide-react';
import { useParticipant } from '@/lib/context/ParticipantContext';
import { WalletButton } from '@/components/participant/wallet/WalletButton';
import { formatPoints } from '@/lib/utils';

export function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { participant, totalPoints, currentStreak, globalRank } = useParticipant();
  const [_notifications] = useState(3);

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between px-4 md:px-6 h-14 bg-[var(--sx-bg-surface)]/80 backdrop-blur-xl border-b border-white/5">
      {/* Left: mobile menu + brand */}
      <div className="flex items-center gap-3">
        <button
          id="mobile-menu-btn"
          onClick={onMenuClick}
          className="md:hidden p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>

        {/* Quick stats row (desktop) */}
        {participant && (
          <div className="hidden md:flex items-center gap-4 ml-2">
            <div className="flex items-center gap-1.5">
              <Zap size={14} className="text-amber-400" />
              <span className="text-sm font-bold text-amber-400 points-counter">
                {formatPoints(totalPoints)}
              </span>
              <span className="text-xs text-slate-500">pts</span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-1.5">
              <Flame size={14} className="text-orange-400" />
              <span className="text-sm font-semibold text-orange-400">{currentStreak}</span>
              <span className="text-xs text-slate-500">day streak</span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-1.5">
              <Trophy size={14} className="text-violet-400" />
              <span className="text-sm font-semibold text-violet-400">#{globalRank}</span>
            </div>
          </div>
        )}
      </div>

      {/* Right: wallet + notifications + avatar */}
      <div className="flex items-center gap-2">
        <WalletButton />

        <button
          id="notifications-btn"
          className="relative p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors"
          aria-label="Notifications"
        >
          <Bell size={18} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full" />
        </button>

        {participant && (
          <Link href="/profile" id="profile-avatar-link">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm cursor-pointer hover:ring-2 hover:ring-blue-500/50 transition-all">
              {(participant.displayName?.[0] ?? participant.username[0]).toUpperCase()}
            </div>
          </Link>
        )}
      </div>
    </header>
  );
}
