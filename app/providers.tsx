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
import { useState, useEffect } from "react";

function GlobalFullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggle = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch { /* ignore */ }
  };

  return (
    <button
      onClick={() => void toggle()}
      title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        width: 44,
        height: 44,
        borderRadius: "50%",
        backgroundColor: "rgba(10,18,32,0.85)",
        border: "2px solid rgba(86,164,203,0.45)",
        boxShadow: "0 0 14px rgba(86,164,203,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        zIndex: 9000,
        backdropFilter: "blur(8px)",
        fontSize: 18,
        color: "#56a4cb",
        transition: "all 0.2s ease",
      }}
    >
      {isFullscreen ? "⊠" : "⛶"}
    </button>
  );
}
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
          <GlobalFullscreenButton />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

