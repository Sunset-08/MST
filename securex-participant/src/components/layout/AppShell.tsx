'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface AppShellProps {
  children: React.ReactNode;
  /** Pass true on the dashboard page to show the lofi background image */
  withBg?: boolean;
}

export function AppShell({ children, withBg }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
