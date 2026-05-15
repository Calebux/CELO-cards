"use client";

import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { celo, celoAlfajores } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
// CSS loaded async — avoids render-blocking the first paint (not needed in MiniPay at all)
const RainbowKitStyles = dynamic(() => import("./components/RainbowKitStyles").then(m => ({ default: m.RainbowKitStyles })), { ssr: false });
import { WalletSync } from "./lib/wallet";
import { miniPayConnector } from "./lib/minipay";
import { createWeb3AuthConnector } from "./lib/web3auth";
import { PortraitOverlay } from "./components/PortraitOverlay";

// Heavy modals — load after initial paint so they don't block first interaction
const DailyReward    = dynamic(() => import("./components/DailyReward").then(m => ({ default: m.DailyReward })), { ssr: false });
const UsernameModal  = dynamic(() => import("./components/UsernameModal").then(m => ({ default: m.UsernameModal })), { ssr: false });
const TutorialModal  = dynamic(() => import("./components/TutorialModal").then(m => ({ default: m.TutorialModal })), { ssr: false });

// WalletConnect (getDefaultWallets) removed from initial bundle — saves ~1MB on mobile parse time.
// Users connect via: MetaMask/injected wallets, or Web3Auth (social login).
const config = createConfig({
  chains: [celo, celoAlfajores],
  transports: {
    [celo.id]: http("https://celo-mainnet.g.alchemy.com/v2/5TkObpGZSAQ-ntN5ZFswA"),
    [celoAlfajores.id]: http(),
  },
  connectors: [miniPayConnector, createWeb3AuthConnector(), injected()],
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <RainbowKitStyles />
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
