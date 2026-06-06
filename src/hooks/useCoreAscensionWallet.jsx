import React, { useCallback, useMemo } from "react";
import { ethers } from "ethers";
import {
  createAppKit,
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
  useAppKitProvider,
  useDisconnect,
} from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { defineChain } from "@reown/appkit/networks";

import {
  RPC_URL,
  CHAIN_ID,
  EXPLORER_BASE_URL,
} from "../config.js";

const PROJECT_ID = "146ee334d324044083b6427d4bbf9202";

export const electroneum = defineChain({
  id: CHAIN_ID,
  caipNetworkId: `eip155:${CHAIN_ID}`,
  chainNamespace: "eip155",
  name: "Electroneum Mainnet",
  nativeCurrency: {
    name: "Electroneum",
    symbol: "ETN",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "Electroneum Explorer",
      url: EXPLORER_BASE_URL,
    },
  },
});

const metadata = {
  name: "CORE Ascension Vault",
  description: "CORE Ascension Vault on Electroneum",
  url: window.location.origin,
  icons: [`${window.location.origin}/logo.png`],
};

export const appKitModal = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [electroneum],
  defaultNetwork: electroneum,
  projectId: PROJECT_ID,
  metadata,
  enableInjected: false,
  allowUnsupportedChain: false,
  features: {
    analytics: true,
    email: false,
    socials: false,
  },
});

// Always points directly at Electroneum RPC — never affected by
// WalletConnect's chain reporting. Used for all read-only contract calls.
const readOnlyProvider = new ethers.JsonRpcProvider(RPC_URL);

export function useCoreAscensionWallet() {
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const { switchNetwork, caipNetwork } = useAppKitNetwork();

  const { address, isConnected, status } = useAppKitAccount({
    namespace: "eip155",
  });

  const { walletProvider } = useAppKitProvider("eip155");

  // Signing provider — wraps the wallet's transport, used only for
  // transactions. May report chain 999 on Android WalletConnect; that's
  // fine because we never use it for reads.
  const signingProvider = useMemo(() => {
    if (!isConnected || !walletProvider) return null;
    try {
      return new ethers.BrowserProvider(walletProvider);
    } catch (err) {
      console.warn("Failed to create BrowserProvider:", err);
      return null;
    }
  }, [isConnected, walletProvider]);

  const connectWallet = useCallback(async () => {
    try {
      await open({ view: "Connect", namespace: "eip155" });
    } catch (err) {
      console.error("Connect wallet failed:", err);
    }
  }, [open]);

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnect();
    } catch (err) {
      console.error("Disconnect wallet failed:", err);
    }
  }, [disconnect]);

  const ensureCorrectNetwork = useCallback(async () => {
    if (!isConnected || !walletProvider) {
      throw new Error("Wallet not connected");
    }
    const currentChainId = caipNetwork?.id ? Number(caipNetwork.id) : null;
    if (currentChainId !== CHAIN_ID) {
      await switchNetwork(electroneum);
    }
  }, [isConnected, walletProvider, caipNetwork?.id, switchNetwork]);

  // Always creates a fresh BrowserProvider for signing so the signer
  // is never stale after a reconnect.
  const getSigner = useCallback(async () => {
    if (!isConnected || !walletProvider) {
      throw new Error("Wallet not connected");
    }
    const browserProvider = new ethers.BrowserProvider(walletProvider);
    return browserProvider.getSigner();
  }, [isConnected, walletProvider]);

  return {
    provider: readOnlyProvider,   // ✅ reads  — always chain 52014
    signingProvider,              // ✅ writes — BrowserProvider via wallet
    walletProvider,               // raw transport, if needed directly
    account: address || null,
    isConnected,
    walletStatus: status,
    connectWallet,
    disconnectWallet,
    ensureCorrectNetwork,
    getSigner,
  };
}