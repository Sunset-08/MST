import { defineChain } from 'viem';

// MST Testnet (chain registry: chainid.network #91562037; verified against the live RPC).
export const MST_TESTNET_ID = 91562037;

export const mstTestnet = defineChain({
  id: MST_TESTNET_ID,
  name: 'MST Testnet',
  nativeCurrency: { name: 'MST Native Coin', symbol: 'tMSTC', decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_MST_RPC_URL ?? 'https://testnetrpc.mstblockchain.com'] } },
  blockExplorers: { default: { name: 'MSTScan', url: 'https://testnet.mstscan.com' } },
  testnet: true,
});

export const explorerAddressUrl = (address: string) => `${mstTestnet.blockExplorers.default.url}/address/${address}`;
export const explorerTxUrl = (hash: string) => `${mstTestnet.blockExplorers.default.url}/tx/${hash}`;
