"use client";

import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, custom, fallback, http } from "wagmi";
import { celo } from "wagmi/chains";
import { getMiniPayProvider, miniPayConnector } from "../lib/minipay";
import { WalletSync } from "../lib/wallet";

const UsernameModal = dynamic(() => import("./UsernameModal").then(m => ({ default: m.UsernameModal })), { ssr: false });

const miniPayTransport = fallback([
  custom({
    async request({ method, params }: { method: string; params?: unknown[] }) {
      const provider = getMiniPayProvider();
      if (!provider) throw new Error("not-minipay");
      return provider.request({ method: method as never, params: params as never });
    },
  }),
  http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL),
]);

const miniPayConfig = createConfig({
  chains: [celo],
  transports: {
    [celo.id]: miniPayTransport,
  },
  connectors: [miniPayConnector],
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1 },
  },
});

export function LandingMiniPayProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={miniPayConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletSync />
        <UsernameModal />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
