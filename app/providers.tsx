"use client";

import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, createStorage, fallback, http } from "wagmi";
import { celo, celoAlfajores } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
// CSS loaded async — avoids render-blocking the first paint (not needed in MiniPay at all)
const RainbowKitStyles = dynamic(() => import("./components/RainbowKitStyles").then(m => ({ default: m.RainbowKitStyles })), { ssr: false });
import { WalletSync } from "./lib/wallet";
import { createWeb3AuthConnector } from "./lib/web3auth";
import { PortraitOverlay } from "./components/PortraitOverlay";
import { DeferredGlobalOverlays } from "./components/DeferredGlobalOverlays";

// Heavy modals — load after initial paint so they don't block first interaction
const DailyReward    = dynamic(() => import("./components/DailyReward").then(m => ({ default: m.DailyReward })), { ssr: false });
const UsernameModal  = dynamic(() => import("./components/UsernameModal").then(m => ({ default: m.UsernameModal })), { ssr: false });
const VerifyPromptModal = dynamic(() => import("./components/VerifyPromptModal").then(m => ({ default: m.VerifyPromptModal })), { ssr: false });
const TutorialModal  = dynamic(() => import("./components/TutorialModal").then(m => ({ default: m.TutorialModal })), { ssr: false });

// WalletConnect (getDefaultWallets) removed from initial bundle — saves ~1MB on mobile parse time.
// Users connect via: MetaMask/injected wallets, or Web3Auth (social login).
const config = createConfig({
  chains: [celo, celoAlfajores],
  storage: createStorage({ key: "ao-wagmi" }),
  transports: {
    // Alchemy first, public Forno as fallback — a transient Alchemy 429 (e.g. a
    // burst of concurrent Web3Auth signups exceeding the free tier) fails over
    // instead of breaking sign-in. The web path previously had no fallback.
    [celo.id]: fallback([
      http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL),
      http("https://forno.celo.org"),
    ]),
    [celoAlfajores.id]: http(),
  },
  // miniPayConnector is intentionally excluded — it lives only in MiniPayProviders.
  // Including it here caused web3auth's MetaMask SDK to fire metamask:// deeplinks
  // inside MiniPay's WebView whenever the web config was evaluated.
  connectors: [createWeb3AuthConnector(), injected()],
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1 },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <RainbowKitStyles />
          <WalletSync />
          <PortraitOverlay />
          <DeferredGlobalOverlays>
            <DailyReward />
            <UsernameModal />
            <VerifyPromptModal />
            <TutorialModal />
          </DeferredGlobalOverlays>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
