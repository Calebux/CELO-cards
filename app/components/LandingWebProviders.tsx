"use client";

import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, createStorage, http } from "wagmi";
import { celo, celoAlfajores } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { WalletSync } from "../lib/wallet";
import { createWeb3AuthConnector } from "../lib/web3auth";

const UsernameModal = dynamic(() => import("./UsernameModal").then(m => ({ default: m.UsernameModal })), { ssr: false });

const config = createConfig({
  chains: [celo, celoAlfajores],
  storage: createStorage({ key: "ao-wagmi" }),
  transports: {
    [celo.id]: http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL),
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
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
