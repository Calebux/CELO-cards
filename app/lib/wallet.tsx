"use client";

// WalletSync — mounts once inside Providers.
// • In MiniPay WebView: auto-connects via the injected provider (no modal)
// • Everywhere: keeps gameStore.playerAddress + playerName in sync with wagmi address

import { useEffect } from "react";
import { useAccount, useConnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { useGameStore } from "./gameStore";
import { isMiniPay } from "./minipay";

export function WalletSync() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const setPlayerAddress = useGameStore((s) => s.setPlayerAddress);
  const setPlayerName    = useGameStore((s) => s.setPlayerName);
  const playerName       = useGameStore((s) => s.playerName);

  // Auto-connect inside MiniPay on first render
  useEffect(() => {
    if (!isConnected && isMiniPay()) {
      connect({ connector: injected() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep address in sync
  useEffect(() => {
    setPlayerAddress(address ?? null);
  }, [address, setPlayerAddress]);

  // When address changes, fetch username from Redis and sync to store
  useEffect(() => {
    if (!address) return;
    void fetch(`/api/username?address=${address.toLowerCase()}&t=${Date.now()}`)
      .then((r) => r.json())
      .then((d: { username?: string | null }) => {
        if (d.username && d.username !== playerName) {
          setPlayerName(d.username);
        }
      })
      .catch(() => {});
  // Only re-run when the address changes; playerName intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, setPlayerName]);

  return null;
}

