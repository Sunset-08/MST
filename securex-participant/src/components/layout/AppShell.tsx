'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useAuth } from '@/lib/context/AuthContext';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { status, isReady, me } = useAuth();
  const router = useRouter();

  const needsGithub = Boolean(me && me.requirements.githubConnection && !me.github.connected);

  useEffect(() => {
    if (!isReady) return;
    if (status === 'anonymous') router.replace('/auth/login');
    else if (needsGithub) router.replace('/auth/onboarding');
  }, [isReady, status, needsGithub, router]);

  if (!isReady || status !== 'authenticated' || !me || needsGithub) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--sx-bg-base)]">
        <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--sx-bg-base)] relative text-slate-100">
      {/* Persistent dashboard background image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/bg-dashboard.png"
        alt=""
        aria-hidden="true"
        className="fixed inset-0 w-full h-full object-cover object-center pointer-events-none select-none"
        style={{ zIndex: 0, opacity: 0.9 }}
      />
      {/* Gradient overlay for readability */}
      <div
        className="fixed inset-0 pointer-events-none select-none"
        style={{
          zIndex: 0,
          background:
            'linear-gradient(to bottom, rgba(10,14,26,0.4) 0%, rgba(10,14,26,0.2) 40%, rgba(10,14,26,0.5) 100%)',
        }}
      />

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="sx-main-content relative" style={{ zIndex: 1 }}>
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="pt-4 pb-12">{children}</main>
      </div>
    </div>
  );
}
