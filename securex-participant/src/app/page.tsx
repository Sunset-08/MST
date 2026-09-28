'use client';

// ============================================================
// SECUREX — Portal Selection (Root Entry Page)
// The first page every unauthenticated user sees.
// Authenticated users are redirected from their respective
// login pages to the correct dashboard.
// ============================================================

import Link from 'next/link';
import {
  ShieldCheck,
  User,
  Building2,
  Crown,
  ArrowRight,
  Zap,
  GitBranch,
  BarChart3,
} from 'lucide-react';

const PORTALS = [
  {
    id: 'participant',
    icon: User,
    color: 'blue',
    accent: '#3b82f6',
    glow: 'rgba(59,130,246,0.12)',
    border: 'rgba(59,130,246,0.25)',
    label: 'PARTICIPANT',
    tagline: 'Compete. Solve. Earn.',
    description:
      'Discover security challenges, submit solutions, earn Points after verification, build reputation, maintain streaks and climb the global leaderboard.',
    bullets: [
      { icon: Zap, text: '100–500 Points per verified challenge' },
      { icon: ShieldCheck, text: 'MSTC rewards on-chain' },
      { icon: BarChart3, text: 'Global leaderboard & levels' },
    ],
    href: '/auth/login',
    cta: 'Enter Participant Portal',
    badge: null,
  },
  {
    id: 'organization',
    icon: Building2,
    color: 'violet',
    accent: '#7c3aed',
    glow: 'rgba(124,58,237,0.12)',
    border: 'rgba(124,58,237,0.25)',
    label: 'ORGANIZATION',
    tagline: 'Create. Configure. Manage.',
    description:
      'Connect your GitHub org, publish security challenges tied to real repositories, configure verification, manage submissions and contributors.',
    bullets: [
      { icon: GitBranch, text: 'GitHub-integrated challenges' },
      { icon: ShieldCheck, text: 'Automated & rule-based verification' },
      { icon: Zap, text: 'Configure Points & MSTC rewards' },
    ],
    href: '/org/auth/login',
    cta: 'Enter Organization Portal',
    badge: null,
  },
  {
    id: 'admin',
    icon: Crown,
    color: 'amber',
    accent: '#f59e0b',
    glow: 'rgba(245,158,11,0.10)',
    border: 'rgba(245,158,11,0.25)',
    label: 'ADMIN',
    tagline: 'Monitor. Manage. Operate.',
    description:
      'Platform-level administration. Manage users, organizations, challenges, verification oversight, reward monitoring and platform analytics.',
    bullets: [
      { icon: BarChart3, text: 'Platform-wide analytics' },
      { icon: Building2, text: 'Organization & user management' },
      { icon: ShieldCheck, text: 'Submission & reward oversight' },
    ],
    href: '/admin/login',
    cta: 'Enter Admin Portal',
    badge: 'PLATFORM ADMIN',
  },
];

export default function PortalSelectionPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-violet-500/5 rounded-full blur-3xl" />
        <div className="absolute top-2/3 right-1/3 w-64 h-64 bg-amber-500/4 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-6xl relative z-10 space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/15 border border-blue-500/20 mb-2">
            <ShieldCheck size={32} className="text-blue-400" />
          </div>
          <h1 className="text-5xl lg:text-6xl font-black text-white tracking-tight">
            SECURE<span className="text-blue-400">X</span>
          </h1>
          <p className="text-slate-400 text-lg font-medium">
            Security challenges. Verified rewards. Blockchain-native.
          </p>
          <p className="text-slate-600 text-sm">Choose your portal to continue</p>
        </div>

        {/* Portal Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {PORTALS.map((portal) => {
            const Icon = portal.icon;
            return (
              <div
                key={portal.id}
                id={`portal-card-${portal.id}`}
                className="group relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
                style={{
                  background: 'rgba(15,20,40,0.7)',
                  backdropFilter: 'blur(16px)',
                  border: `1px solid ${portal.border}`,
                  boxShadow: `0 0 40px ${portal.glow}`,
                }}
              >
                {/* Badge */}
                {portal.badge && (
                  <div
                    className="absolute top-4 right-4 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest"
                    style={{ background: `${portal.accent}20`, color: portal.accent, border: `1px solid ${portal.border}` }}
                  >
                    {portal.badge}
                  </div>
                )}

                {/* Top section */}
                <div className="p-7 flex-1 space-y-5">
                  {/* Icon + label */}
                  <div className="space-y-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: `${portal.accent}18`, border: `1px solid ${portal.border}` }}
                    >
                      <Icon size={24} style={{ color: portal.accent }} />
                    </div>
                    <div>
                      <p
                        className="text-xs font-bold tracking-[0.2em] uppercase mb-1"
                        style={{ color: portal.accent }}
                      >
                        {portal.label}
                      </p>
                      <p className="text-slate-500 text-sm font-medium">{portal.tagline}</p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-slate-400 text-sm leading-relaxed">{portal.description}</p>

                  {/* Feature bullets */}
                  <ul className="space-y-2">
                    {portal.bullets.map(({ icon: BulletIcon, text }) => (
                      <li key={text} className="flex items-center gap-2.5 text-xs text-slate-500">
                        <BulletIcon size={13} style={{ color: portal.accent, flexShrink: 0 }} />
                        {text}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* CTA */}
                <div className="px-7 pb-7">
                  <Link
                    href={portal.href}
                    id={`portal-enter-${portal.id}`}
                    className="flex items-center justify-between w-full px-5 py-3 rounded-xl font-semibold text-sm transition-all duration-200 group-hover:gap-3"
                    style={{
                      background: `${portal.accent}15`,
                      border: `1px solid ${portal.border}`,
                      color: portal.accent,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = `${portal.accent}25`;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = `${portal.accent}15`;
                    }}
                  >
                    <span>{portal.cta}</span>
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-700">
          Backend authentication enforces role access. Selecting a portal does not grant permissions.
        </p>
      </div>
    </div>
  );
}
