'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useAuth } from '@/lib/context/AuthContext';

/** Participant portal shell. Requires a signed-in user; participants must connect GitHub first. */
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
    <div className="min-h-screen bg-[var(--sx-bg-base)]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="sx-main-content">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="pt-4 pb-12">{children}</main>
      </div>
    </div>
  );
}
