'use client';

// ============================================================
// SECUREX — Providers
// React Query, Wagmi (MST Testnet, injected wallet) and the auth/role contexts
// ============================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { mstTestnet } from '@/lib/chain/mst';
import { AuthProvider } from '@/lib/context/AuthContext';
import { ParticipantProvider } from '@/lib/context/ParticipantContext';
import { OrgProvider } from '@/lib/context/OrgContext';
import { AdminProvider } from '@/lib/context/AdminContext';

// Wagmi config — BridgeKey / any EVM wallet exposes an injected EIP-1193 provider (window.ethereum)
const wagmiConfig = createConfig({
  chains: [mstTestnet],
  connectors: [injected()],
  transports: { [mstTestnet.id]: http() },
  ssr: true,
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
        <AuthProvider>
          <AdminProvider>
            <OrgProvider>
              <ParticipantProvider>{children}</ParticipantProvider>
            </OrgProvider>
          </AdminProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
