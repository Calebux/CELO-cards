"use client";

import React from "react";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { celo } from "wagmi/chains";
import { miniPayConnector } from "./lib/minipay";
import { WalletSync } from "./lib/wallet";
import { PortraitOverlay } from "./components/PortraitOverlay";

// Heavy modals — load after initial paint
const DailyReward   = dynamic(() => import("./components/DailyReward").then(m => ({ default: m.DailyReward })), { ssr: false });
const UsernameModal = dynamic(() => import("./components/UsernameModal").then(m => ({ default: m.UsernameModal })), { ssr: false });
const TutorialModal = dynamic(() => import("./components/TutorialModal").then(m => ({ default: m.TutorialModal })), { ssr: false });

// Minimal wagmi config — only MiniPay connector, no RainbowKit / WalletConnect / Web3Auth
const miniPayConfig = createConfig({
  chains: [celo],
  transports: {
    [celo.id]: http("https://celo-mainnet.g.alchemy.com/v2/5TkObpGZSAQ-ntN5ZFswA"),
  },
  connectors: [miniPayConnector],
});

const queryClient = new QueryClient();

export function MiniPayProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={miniPayConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletSync />
        <PortraitOverlay />
        <DailyReward />
        <UsernameModal />
        <TutorialModal />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
