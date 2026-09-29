'use client';

// ============================================================
// SECUREX — Org Shell (Layout wrapper for org pages)
// Member 2 — Organization Side Add-On
// ============================================================

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  LayoutDashboard,
  PlusCircle,
  ListChecks,
  Settings,
  LogOut,
  ChevronRight,
  Wallet,
  ClipboardCheck,
  Menu,
  X,
  ShieldCheck,
  Bell,
} from 'lucide-react';
import { useOrg } from '@/lib/context/OrgContext';

const ORG_NAV = [
  { href: '/org/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/org/challenges/create', label: 'Create Challenge', icon: PlusCircle },
  { href: '/org/challenges', label: 'My Challenges', icon: ListChecks },
  { href: '/org/submissions', label: 'Submissions', icon: ClipboardCheck },
  { href: '/org/settings', label: 'Settings', icon: Settings },
];

function OrgSidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { admin, organization, logout } = useOrg();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/org/auth/login');
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`sx-sidebar ${isOpen ? 'open' : ''}`}
        style={{ borderRight: '1px solid rgba(139, 92, 246, 0.15)' }}
      >
        {/* Logo */}
        <div className="p-5 border-b border-white/5">
          <Link href="/org/dashboard" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center group-hover:bg-violet-500/30 transition-colors">
              <Building2 size={16} className="text-violet-400" />
            </div>
            <div className="flex items-center gap-1.5">
              <img
                src="/devarena-logo.jpg"
                alt="DevArena"
                className="h-6 object-contain"
                style={{ filter: 'brightness(1.05)' }}
              />
              <span className="text-slate-500 text-xs font-normal">Org</span>
            </div>
          </Link>
        </div>

        {/* Org mini-card */}
        {organization && (
          <div className="p-4 mx-3 my-3 rounded-xl bg-[var(--sx-bg-elevated)] border border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {organization.name[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{organization.name}</p>
                <p className="text-xs text-slate-500 capitalize">{admin?.role ?? 'admin'}</p>
              </div>
            </div>

          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-1">
          {ORG_NAV.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');

            return (
              <Link
                key={href}
                href={href}
                className={`sx-sidebar-link ${isActive ? 'active' : ''}`}
                onClick={onClose}
                style={
                  isActive
                    ? { background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa' }
                    : undefined
                }
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
          <button onClick={handleLogout} className="sx-sidebar-link w-full">
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function OrgTopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { admin } = useOrg();

  return (
    <header
      className="fixed top-0 left-0 right-0 z-20 h-14 flex items-center justify-between px-4 md:pl-[256px]"
      style={{
        background: 'rgba(10, 14, 26, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <button onClick={onMenuClick} className="md:hidden sx-btn-ghost p-2 rounded-lg">
        <Menu size={20} />
      </button>

      <div className="flex items-center gap-2 ml-auto">
        <button
          id="org-notifications-btn"
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors"
        >
          <Bell size={16} className="text-slate-500" />
        </button>
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white font-bold text-xs">
          {(admin?.displayName ?? admin?.username ?? 'A')[0].toUpperCase()}
        </div>
      </div>
    </header>
  );
}

export function OrgShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isLoggedIn, isReady, needsOrganization, organization } = useOrg();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) return;
    if (needsOrganization) router.replace('/org/setup');
    else if (!isLoggedIn) router.replace('/org/auth/login');
  }, [isReady, isLoggedIn, needsOrganization, router]);

  if (!isReady || !isLoggedIn || !organization) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <OrgSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 md:ml-60">
        <OrgTopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="pt-14 p-6 min-h-screen">{children}</main>
      </div>
    </div>
  );
}
