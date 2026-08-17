"use client";

import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, createStorage, fallback, http } from "wagmi";
import { celo, celoAlfajores } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { WalletSync } from "../lib/wallet";
import { createWeb3AuthConnector } from "../lib/web3auth";

const UsernameModal = dynamic(() => import("./UsernameModal").then(m => ({ default: m.UsernameModal })), { ssr: false });
const VerifyPromptModal = dynamic(() => import("./VerifyPromptModal").then(m => ({ default: m.VerifyPromptModal })), { ssr: false });
const ReverifyModal = dynamic(() => import("./ReverifyModal").then(m => ({ default: m.ReverifyModal })), { ssr: false });

const config = createConfig({
  chains: [celo, celoAlfajores],
  storage: createStorage({ key: "ao-wagmi" }),
  transports: {
    // Alchemy first, public Forno as fallback — a transient Alchemy 429 (e.g. a
    // burst of concurrent Web3Auth sign-ins exceeding the free tier) fails over
    // instead of breaking sign-in on the landing page.
    [celo.id]: fallback([
      http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL),
      http("https://forno.celo.org"),
    ]),
    [celoAlfajores.id]: http(),
  },
  connectors: [createWeb3AuthConnector(), injected()],
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1 },
  },
});

export function LandingWebProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <WalletSync />
        <UsernameModal />
        <VerifyPromptModal />
        <ReverifyModal />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
