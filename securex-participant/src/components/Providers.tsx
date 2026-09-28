'use client';

// ============================================================
// SECUREX — Providers
// Wraps the app with React Query, Wagmi, and all role contexts
// ============================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { ParticipantProvider } from '@/lib/context/ParticipantContext';
import { OrgProvider } from '@/lib/context/OrgContext';
import { AdminProvider } from '@/lib/context/AdminContext';

// Wagmi config — BridgeKey is injected EVM wallet (window.ethereum)
const wagmiConfig = createConfig({
  chains: [mainnet],
  connectors: [injected()],
  transports: { [mainnet.id]: http() },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AdminProvider>
          <OrgProvider>
            <ParticipantProvider>{children}</ParticipantProvider>
          </OrgProvider>
        </AdminProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
