"use client";

// WalletSync — mounts once inside Providers.
// • In MiniPay WebView: auto-connects via the injected provider (no modal)
// • Everywhere: keeps gameStore.playerAddress + playerName in sync with wagmi address

import { useEffect } from "react";
import { celo } from "wagmi/chains";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { useGameStore } from "./gameStore";
import { getMiniPayConnector, isMiniPay } from "./minipay";

export function WalletSync() {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const setPlayerAddress = useGameStore((s) => s.setPlayerAddress);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const playerName = useGameStore((s) => s.playerName);

  useEffect(() => {
    if (!isMiniPay() || isConnected) return;

    let cancelled = false;
    let inFlight = false;
    let attempts = 0;
    const connector = getMiniPayConnector();

    const ensureConnected = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const result = await connectAsync({ connector, chainId: celo.id });
        if (!cancelled && result.chainId !== celo.id) {
          await switchChainAsync({ chainId: celo.id }).catch(() => {});
        }
      } catch {
        // Provider injection can lag inside MiniPay WebViews; retry below.
      } finally {
        inFlight = false;
      }
    };

    void ensureConnected();

    const retry = window.setInterval(() => {
      if (cancelled || isConnected) {
        window.clearInterval(retry);
        return;
      }
      attempts += 1;
      if (attempts > 8) {
        window.clearInterval(retry);
        return;
      }
      void ensureConnected();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(retry);
    };
  }, [connectAsync, isConnected, switchChainAsync]);

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
