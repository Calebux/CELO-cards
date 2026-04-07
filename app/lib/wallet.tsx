"use client";

// WalletSync — mounts once inside Providers.
// • In MiniPay WebView: auto-connects via the injected provider (no modal)
// • Everywhere: keeps gameStore.playerAddress in sync with wagmi address

import { useEffect } from "react";
import { useAccount, useConnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { useGameStore } from "./gameStore";
import { isMiniPay } from "./minipay";

export function WalletSync() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const setPlayerAddress = useGameStore((s) => s.setPlayerAddress);

  // Auto-connect inside MiniPay on first render
  useEffect(() => {
    if (!isConnected && isMiniPay()) {
      connect({ connector: injected() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep store in sync whenever wagmi address changes
  useEffect(() => {
    setPlayerAddress(address ?? null);
  }, [address, setPlayerAddress]);

  return null;
}
