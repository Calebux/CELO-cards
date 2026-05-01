"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { celo, celoAlfajores } from "wagmi/chains";
import { RainbowKitProvider, getDefaultWallets } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { WalletSync } from "./lib/wallet";
import { PortraitOverlay } from "./components/PortraitOverlay";
import { DailyReward } from "./components/DailyReward";
import { UsernameModal } from "./components/UsernameModal";
import { TutorialModal } from "./components/TutorialModal";


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

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <WalletSync />
          <PortraitOverlay />
          <DailyReward />
          <UsernameModal />
          <TutorialModal />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

