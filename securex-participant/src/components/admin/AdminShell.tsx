'use client';

// ============================================================
// SECUREX — Admin Shell (Layout wrapper for all /admin pages)
// Mirrors OrgShell pattern — clean sidebar + topbar
// ============================================================

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Crown,
  LayoutDashboard,
  Users,
  Building2,
  Target,
  ClipboardList,
  Coins,
  GitBranch,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Bell,
  ChevronRight,
} from 'lucide-react';
import { useAdmin } from '@/lib/context/AdminContext';
import { cn } from '@/lib/utils';

const ADMIN_NAV = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/organizations', label: 'Organizations', icon: Building2 },
  { href: '/admin/challenges', label: 'Challenges', icon: Target },
  { href: '/admin/submissions', label: 'Submissions', icon: ClipboardList },
  { href: '/admin/rewards', label: 'Rewards', icon: Coins },
  { href: '/admin/github', label: 'GitHub', icon: GitBranch },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { admin, isLoggedIn, logout } = useAdmin();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Guard: redirect to admin login if not authenticated
  useEffect(() => {
    if (!isLoggedIn) {
      router.push('/admin/login');
    }
  }, [isLoggedIn, router]);

  if (!isLoggedIn || !admin) return null;

  function handleLogout() {
    logout();
    router.push('/admin/login');
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/5">
        <Link href="/admin/dashboard" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <ShieldCheck size={16} className="text-amber-400" />
          </div>
          <div>
            <span className="text-base font-black text-white">
              SECURE<span className="text-amber-400">X</span>
            </span>
            <p className="text-[10px] text-amber-400/70 font-bold tracking-widest uppercase">
              Platform Admin
            </p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              id={`admin-nav-${label.toLowerCase().replace(/\s/g, '-')}`}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                active
                  ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5',
              )}
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight size={13} />}
            </Link>
          );
        })}
      </nav>

      {/* Admin info + logout */}
      <div className="px-3 py-4 border-t border-white/5 space-y-3">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center text-white font-bold text-sm">
            {(admin.displayName?.[0] ?? admin.username[0]).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {admin.displayName ?? admin.username}
            </p>
            <p className="text-xs text-amber-400 font-bold uppercase tracking-wide">
              Platform Admin
            </p>
          </div>
        </div>

        {/* Switch portal */}
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-500 hover:text-white hover:bg-white/5 transition-all"
        >
          <Crown size={13} />
          Switch Portal
        </Link>

        <button
          id="admin-logout-btn"
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-400/10 transition-all w-full"
        >
          <LogOut size={13} />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--sx-bg-base)' }}>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 border-r border-white/5">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative w-60 flex flex-col border-r border-white/5 z-10"
            style={{ background: 'var(--sx-bg-elevated)' }}>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 flex items-center px-4 lg:px-6 border-b border-white/5 gap-4 flex-shrink-0">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-white/5 text-slate-400"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs text-slate-600 uppercase tracking-widest font-bold hidden sm:block">
              SECUREX Admin
            </span>
            <ChevronRight size={12} className="text-slate-700 hidden sm:block" />
            <span className="text-sm font-semibold text-white capitalize">
              {pathname.split('/').pop()?.replace(/-/g, ' ') ?? 'Dashboard'}
            </span>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            <button className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors relative">
              <Bell size={16} />
            </button>
            <div
              className="px-2.5 py-1 rounded-lg text-xs font-bold text-amber-400 border border-amber-400/20"
              style={{ background: 'rgba(245,158,11,0.1)' }}
            >
              ADMIN
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
