// MST Testnet parameters, from the ethereum-lists chain registry (chainid.network) and
// confirmed live: eth_chainId on the RPC returns 0x5752035 (91562037).
export const MST_TESTNET = Object.freeze({
  chainId: 91562037,
  chainIdHex: "0x5752035",
  chainName: "MST Testnet",
  nativeCurrency: { name: "MST Native Coin", symbol: "tMSTC", decimals: 18 },
  rpcUrls: ["https://testnetrpc.mstblockchain.com"],
  blockExplorerUrls: ["https://testnet.mstscan.com"],
  faucetUrl: "https://faucet.mstblockchain.com",
});

export const txUrl = (hash, network = MST_TESTNET) => `${network.blockExplorerUrls[0]}/tx/${hash}`;
export const addressUrl = (address, network = MST_TESTNET) => `${network.blockExplorerUrls[0]}/address/${address}`;
