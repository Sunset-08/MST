// ============================================================
// SECUREX — Utility helpers
// ============================================================

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Difficulty, ChallengeStatus, SecurityCategory } from '@/lib/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPoints(points: number): string {
  return points.toLocaleString('en-US');
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

export function truncateAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ============================================================
// Difficulty helpers
// ============================================================

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  Easy: 'text-emerald-400',
  Medium: 'text-amber-400',
  Hard: 'text-rose-400',
  Expert: 'text-purple-400',
};

export const DIFFICULTY_BG: Record<Difficulty, string> = {
  Easy: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
  Medium: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  Hard: 'bg-rose-400/10 text-rose-400 border-rose-400/20',
  Expert: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
};

// ============================================================
// Status helpers
// ============================================================

export const STATUS_COLORS: Record<ChallengeStatus, string> = {
  'Not Started': 'bg-slate-700 text-slate-300',
  Attempted: 'bg-blue-400/10 text-blue-400 border border-blue-400/20',
  Submitted: 'bg-indigo-400/10 text-indigo-400 border border-indigo-400/20',
  'Under Review': 'bg-amber-400/10 text-amber-400 border border-amber-400/20',
  Verified: 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20',
  Failed: 'bg-rose-400/10 text-rose-400 border border-rose-400/20',
};

export const STATUS_ICON: Record<ChallengeStatus, string> = {
  'Not Started': '○',
  Attempted: '◔',
  Submitted: '◕',
  'Under Review': '⟳',
  Verified: '✅',
  Failed: '✗',
};

// ============================================================
// Category helpers
// ============================================================

export const CATEGORY_COLORS: Partial<Record<SecurityCategory, string>> = {
  'Smart Contract': 'text-violet-400',
  'Web Security': 'text-cyan-400',
  'API Security': 'text-blue-400',
  Authentication: 'text-indigo-400',
  Authorization: 'text-purple-400',
  Cryptography: 'text-amber-400',
  'Dependency / Supply Chain': 'text-orange-400',
  'Cloud / Infrastructure': 'text-sky-400',
  DevSecOps: 'text-teal-400',
  'Frontend Security': 'text-pink-400',
  'Backend Security': 'text-rose-400',
  'Database Security': 'text-red-400',
  Privacy: 'text-lime-400',
  Configuration: 'text-slate-400',
};
