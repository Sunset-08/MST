import { BrowserProvider, JsonRpcProvider, getAddress } from "ethers";
import { MST_TESTNET } from "./network.js";

export class WalletError extends Error {
  constructor(message, code, cause) {
    super(message);
    this.name = "WalletError";
    this.code = code;
    this.cause = cause;
  }
}

const UNRECOGNIZED_CHAIN = 4902;
const USER_REJECTED = 4001;
const UNSUPPORTED_METHOD = [4200, -32601, -32004];

/** Returns the injected EIP-1193 provider (MetaMask etc.) or throws. */
export function getInjectedProvider(ethereum = globalThis.ethereum) {
  if (!ethereum || typeof ethereum.request !== "function") {
    throw new WalletError("No EIP-1193 wallet found. Install MetaMask or another EVM wallet.", "NO_WALLET");
  }
  return ethereum;
}

const parseChainId = (hex) => Number(BigInt(hex));

export async function getChainId(ethereum = globalThis.ethereum) {
  return parseChainId(await getInjectedProvider(ethereum).request({ method: "eth_chainId" }));
}

export async function isMstTestnet(ethereum = globalThis.ethereum, network = MST_TESTNET) {
  return (await getChainId(ethereum)) === network.chainId;
}

/** Address already authorized for this site, or null (never prompts). */
export async function getConnectedAddress(ethereum = globalThis.ethereum) {
  const accounts = await getInjectedProvider(ethereum).request({ method: "eth_accounts" });
  return accounts?.[0] ? getAddress(accounts[0]) : null;
}

/** Prompts the wallet for access; returns address, chain info, ethers provider and signer. */
export async function connectWallet(ethereum = globalThis.ethereum, network = MST_TESTNET) {
  const eth = getInjectedProvider(ethereum);
  let accounts;
  try {
    accounts = await eth.request({ method: "eth_requestAccounts" });
  } catch (err) {
    if (err?.code === USER_REJECTED) throw new WalletError("Wallet connection rejected by user.", "USER_REJECTED", err);
    throw new WalletError(`Wallet connection failed: ${err?.message ?? err}`, "CONNECT_FAILED", err);
  }
  if (!accounts?.length) throw new WalletError("Wallet returned no accounts.", "NO_ACCOUNTS");
  const chainId = await getChainId(eth);
  const provider = new BrowserProvider(eth, "any");
  const signer = await provider.getSigner(accounts[0]);
  return { address: await signer.getAddress(), chainId, isMstTestnet: chainId === network.chainId, provider, signer };
}

/** ethers signer for the currently selected wallet account. */
export async function getSigner(ethereum = globalThis.ethereum) {
  return new BrowserProvider(getInjectedProvider(ethereum), "any").getSigner();
}

/** Asks the wallet to switch to MST Testnet, adding the network first if the wallet does not know it. */
export async function switchToMstTestnet(ethereum = globalThis.ethereum, network = MST_TESTNET) {
  const eth = getInjectedProvider(ethereum);
  const chainIdHex = "0x" + network.chainId.toString(16);
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  } catch (err) {
    const code = err?.code ?? err?.data?.originalError?.code;
    if (code === UNRECOGNIZED_CHAIN) {
      try {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chainIdHex,
              chainName: network.chainName,
              nativeCurrency: network.nativeCurrency,
              rpcUrls: network.rpcUrls,
              blockExplorerUrls: network.blockExplorerUrls,
            },
          ],
        });
      } catch (addErr) {
        if (addErr?.code === USER_REJECTED) throw new WalletError("Adding MST Testnet was rejected by user.", "USER_REJECTED", addErr);
        throw new WalletError(`Could not add MST Testnet: ${addErr?.message ?? addErr}`, "ADD_CHAIN_FAILED", addErr);
      }
    } else if (code === USER_REJECTED) {
      throw new WalletError("Network switch rejected by user.", "USER_REJECTED", err);
    } else if (UNSUPPORTED_METHOD.includes(code)) {
      throw new WalletError(`This wallet cannot switch networks. Select ${network.chainName} manually.`, "SWITCH_UNSUPPORTED", err);
    } else {
      throw new WalletError(`Network switch failed: ${err?.message ?? err}`, "SWITCH_FAILED", err);
    }
  }
  const now = await getChainId(eth);
  if (now !== network.chainId) {
    throw new WalletError(`Wallet is on chain ${now}, expected ${network.chainName} (${network.chainId}).`, "WRONG_NETWORK");
  }
  return now;
}

/**
 * Throws unless the wallet is on MST Testnet. Read-only by default; pass { autoSwitch: true }
 * only from an explicit user action (e.g. a "Switch to MST" button).
 */
export async function requireMstTestnet(ethereum = globalThis.ethereum, { autoSwitch = false, network = MST_TESTNET } = {}) {
  if (await isMstTestnet(ethereum, network)) return network.chainId;
  if (!autoSwitch) {
    throw new WalletError(`Wrong network. Switch your wallet to ${network.chainName} (${network.chainId}).`, "WRONG_NETWORK");
  }
  return switchToMstTestnet(ethereum, network);
}

/** Subscribes to account changes. cb(address | null). Returns an unsubscribe function. */
export function onAccountsChanged(ethereum = globalThis.ethereum, cb) {
  const eth = getInjectedProvider(ethereum);
  const handler = (accounts) => cb(accounts?.[0] ? getAddress(accounts[0]) : null);
  eth.on("accountsChanged", handler);
  return () => eth.removeListener("accountsChanged", handler);
}

/** Subscribes to chain changes. cb(chainId, isMstTestnet). Returns an unsubscribe function. */
export function onChainChanged(ethereum = globalThis.ethereum, cb, network = MST_TESTNET) {
  const eth = getInjectedProvider(ethereum);
  const handler = (chainIdHex) => {
    const chainId = parseChainId(chainIdHex);
    cb(chainId, chainId === network.chainId);
  };
  eth.on("chainChanged", handler);
  return () => eth.removeListener("chainChanged", handler);
}

/** Read-only provider pinned to the MST Testnet RPC (no wallet needed). */
export function getReadProvider(network = MST_TESTNET, rpcUrl = network.rpcUrls[0]) {
  // cacheTimeout -1: never serve a cached nonce/state to back-to-back transactions.
  return new JsonRpcProvider(rpcUrl, { chainId: network.chainId, name: network.chainName }, { staticNetwork: true, cacheTimeout: -1 });
}

/** Confirms that an RPC endpoint really serves the expected chain. */
export async function verifyRpcChain(provider, network = MST_TESTNET) {
  const chainId = parseChainId(await provider.send("eth_chainId", []));
  if (chainId !== network.chainId) {
    throw new WalletError(`RPC serves chain ${chainId}, expected ${network.chainName} (${network.chainId}).`, "WRONG_NETWORK");
  }
  const blockNumber = await provider.getBlockNumber();
  return { chainId, blockNumber };
}
