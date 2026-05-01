"use client";

import { useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { celo, celoAlfajores } from "wagmi/chains";
import { RainbowKitProvider, getDefaultWallets } from "@rainbow-me/rainbowkit";
import { Web3AuthProvider, type Web3AuthContextConfig } from "@web3auth/modal/react";
import { WagmiProvider as Web3AuthWagmiProvider } from "@web3auth/modal/react/wagmi";
import "@rainbow-me/rainbowkit/styles.css";
import { WalletSync } from "./lib/wallet";
import { AuthModeProvider, type AuthMode } from "./lib/authMode";
import { isMiniPay } from "./lib/minipay";
import { PortraitOverlay } from "./components/PortraitOverlay";
import { DailyReward } from "./components/DailyReward";
import { UsernameModal } from "./components/UsernameModal";
import { TutorialModal } from "./components/TutorialModal";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK, type CustomChainConfig } from "@web3auth/no-modal";


const { connectors } = getDefaultWallets({
  appName: "Action Order",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "action-order",
});

const config = createConfig({
  chains: [celo, celoAlfajores],
  transports: {
    [celo.id]: http("https://celo-mainnet.g.alchemy.com/v2/5TkObpGZSAQ-ntN5ZFswA"),
    [celoAlfajores.id]: http(),
  },
  connectors,
});

const queryClient = new QueryClient();

const web3AuthClientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID;
const web3AuthEnabled = Boolean(web3AuthClientId);

function toWeb3AuthChain(chain: typeof celo | typeof celoAlfajores): CustomChainConfig {
  return {
    chainNamespace: CHAIN_NAMESPACES.EIP155,
    chainId: `0x${chain.id.toString(16)}`,
    rpcTarget: chain.rpcUrls.default.http[0],
    displayName: chain.name,
    logo: "",
    blockExplorerUrl: chain.blockExplorers?.default.url,
    ticker: chain.nativeCurrency.symbol,
    tickerName: chain.nativeCurrency.name,
    decimals: chain.nativeCurrency.decimals,
  };
}

const web3AuthConfig: Web3AuthContextConfig | null = web3AuthEnabled
  ? {
      web3AuthOptions: {
        clientId: web3AuthClientId!,
        web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
        chains: [toWeb3AuthChain(celo), toWeb3AuthChain(celoAlfajores)],
        uiConfig: {
          appName: "Action Order",
          mode: "dark",
          primaryButton: "socialLogin",
          loginMethodsOrder: ["google", "discord", "twitter", "apple", "github", "email_passwordless"],
          hideSuccessScreen: true,
        },
        modalConfig: {
          connectors: {
            auth: {
              label: "Social Login",
              showOnModal: true,
              loginMethods: {
                google: { name: "Google", showOnModal: true, mainOption: true },
                discord: { name: "Discord", showOnModal: true, mainOption: true },
                twitter: { name: "X", showOnModal: true, mainOption: true },
                apple: { name: "Apple", showOnModal: true },
                github: { name: "GitHub", showOnModal: true },
                email_passwordless: { name: "Email", showOnModal: true },
              },
            },
          },
        },
      },
    }
  : null;

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WalletSync />
      <PortraitOverlay />
      <DailyReward />
      <UsernameModal />
      <TutorialModal />
      {children}
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [authMode, setAuthMode] = useState<AuthMode>(web3AuthEnabled ? "web3auth" : "wagmi");

  useEffect(() => {
    if (!web3AuthEnabled) return;
    if (isMiniPay()) setAuthMode("wagmi");
  }, []);

  const content = useMemo(() => {
    if (authMode === "web3auth" && web3AuthConfig) {
      return (
        <Web3AuthProvider config={web3AuthConfig}>
          <Web3AuthWagmiProvider>
            <AppShell>{children}</AppShell>
          </Web3AuthWagmiProvider>
        </Web3AuthProvider>
      );
    }

    return (
      <WagmiProvider config={config}>
        <RainbowKitProvider>
          <AppShell>{children}</AppShell>
        </RainbowKitProvider>
      </WagmiProvider>
    );
  }, [authMode, children]);

  return (
    <AuthModeProvider mode={authMode}>
      <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
    </AuthModeProvider>
  );
}
