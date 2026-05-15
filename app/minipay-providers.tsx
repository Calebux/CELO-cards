"use client";

import React from "react";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { celo } from "wagmi/chains";
import { miniPayConnector } from "./lib/minipay";
import { WalletSync } from "./lib/wallet";
import { PortraitOverlay } from "./components/PortraitOverlay";
import { DeferredGlobalOverlays } from "./components/DeferredGlobalOverlays";

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch on every mount/page transition — on-chain data doesn't change every second
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
    },
  },
});

export function MiniPayProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={miniPayConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletSync />
        <PortraitOverlay />
        <DeferredGlobalOverlays>
          <DailyReward />
          <UsernameModal />
          <TutorialModal />
        </DeferredGlobalOverlays>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
