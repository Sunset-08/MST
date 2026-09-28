'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
