'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Trophy,
  User,
  Target,
  Gift,
  LogOut,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { useParticipant } from '@/lib/context/ParticipantContext';
import { formatPoints } from '@/lib/utils';
import { getLevelFromPoints } from '@/lib/constants/levels';
import { authLogout } from '@/lib/api/auth';
import { useRouter } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/challenges', label: 'Challenges', icon: Target },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/profile', label: 'My Profile', icon: User },
  { href: '/rewards', label: 'Rewards', icon: Gift },
];

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { participant, totalPoints } = useParticipant();
  const levelInfo = getLevelFromPoints(totalPoints);
  const router = useRouter();

  async function handleSignOut() {
    await authLogout();
    router.push('/auth/login');
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`sx-sidebar ${isOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="p-5 border-b border-white/5">
          <Link href="/dashboard" className="flex items-center group">
            <Image
              src="/devarena-logo.jpg"
              alt="DevArena"
              width={130}
              height={34}
              className="object-contain transition-opacity group-hover:opacity-90"
              style={{ filter: 'brightness(1.05)' }}
            />
          </Link>
        </div>

        {/* Participant mini-card */}
        {participant && (
          <div className="p-4 mx-3 my-3 rounded-xl bg-[var(--sx-bg-elevated)] border border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {participant.displayName?.[0] ?? participant.username[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {participant.displayName ?? participant.username}
                </p>
                <p className={`text-xs font-medium ${levelInfo.color}`}>
                  Lv.{levelInfo.level} {levelInfo.title}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1">
              <Zap size={12} className="text-amber-400" />
              <span className="text-xs font-bold text-amber-400 points-counter">
                {formatPoints(totalPoints)} pts
              </span>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`sx-sidebar-link ${isActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <Icon size={18} />
                <span className="flex-1">{label}</span>
                {isActive && <ChevronRight size={14} className="opacity-50" />}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="p-3 border-t border-white/5">
          <button
            onClick={handleSignOut}
            className="sx-sidebar-link w-full text-left"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
