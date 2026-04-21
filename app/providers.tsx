"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { celo, celoAlfajores } from "wagmi/chains";
import { RainbowKitProvider, getDefaultWallets } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { WalletSync } from "./lib/wallet";
import { PortraitOverlay } from "./components/PortraitOverlay";
import { DailyReward } from "./components/DailyReward";
import { SoundSettingsButton } from "./components/SoundSettings";

const { connectors } = getDefaultWallets({
  appName: "Action Order",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "action-order",
});

const config = createConfig({
  chains: [celo, celoAlfajores],
  transports: {
    [celo.id]: http(),
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
          {/* Global floating sound toggle — bottom-right corner */}
          <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 100 }}>
            <SoundSettingsButton />
          </div>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
