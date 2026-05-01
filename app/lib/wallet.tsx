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
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const playerName = useGameStore((s) => s.playerName);

  useEffect(() => {
    if (!isConnected && isMiniPay()) {
      connect({ connector: injected() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPlayerAddress(address ?? null);
  }, [address, setPlayerAddress]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, setPlayerName]);

  return null;
}
