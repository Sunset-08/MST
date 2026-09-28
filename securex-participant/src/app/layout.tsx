import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'SECUREX — Security Challenge Platform',
  description:
    'Earn Points and MST rewards by solving real-world security challenges. The gamified Web3 security platform for developers and researchers.',
  keywords: ['security', 'challenges', 'web3', 'blockchain', 'CTF', 'bug bounty', 'points'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
