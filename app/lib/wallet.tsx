"use client";

// WalletSync — mounts once inside Providers.
// • In MiniPay WebView: auto-connects via the injected provider (no modal)
// • Everywhere: keeps gameStore.playerAddress + playerName in sync with wagmi address

import { useEffect } from "react";
import { useAccount, useConnect } from "wagmi";
import { useGameStore } from "./gameStore";
import { getMiniPayConnector, isMiniPay } from "./minipay";
import { useRef } from "react";
import type { CardProgressPayload } from "./cardProgress";

export function WalletSync() {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const setPlayerAddress = useGameStore((s) => s.setPlayerAddress);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const hydrateCardProgress = useGameStore((s) => s.hydrateCardProgress);
  const clearCardProgress = useGameStore((s) => s.clearCardProgress);
  const playerName = useGameStore((s) => s.playerName);
  const progressAddressRef = useRef<string | null>(null);

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
        await connectAsync({ connector });
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
  }, [connectAsync, isConnected]);

  useEffect(() => {
    setPlayerAddress(address ?? null);
  }, [address, setPlayerAddress]);

  useEffect(() => {
    if (!address) {
      setPlayerName("");
      return;
    }
    void fetch(`/api/username?address=${address.toLowerCase()}&t=${Date.now()}`)
      .then((r) => r.json())
      .then((d: { username?: string | null }) => {
        setPlayerName(d.username ?? "");
      })
      .catch(() => {});
  }, [address, setPlayerName]);

  useEffect(() => {
    if (!address) {
      return;
    }

    const lower = address.toLowerCase();
    const switchedWallet = progressAddressRef.current !== lower;
    progressAddressRef.current = lower;
    if (switchedWallet) {
      clearCardProgress();
    }

    let cancelled = false;
    void fetch(`/api/card-progress?address=${lower}&t=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: CardProgressPayload | null) => {
        if (cancelled || !data) return;
        hydrateCardProgress({
          attunedCardIds: data.attunedCardIds ?? [],
          cardPerformance: data.cardPerformance ?? {},
          updatedAt: data.updatedAt ?? 0,
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [address, clearCardProgress, hydrateCardProgress]);

  return null;
}
