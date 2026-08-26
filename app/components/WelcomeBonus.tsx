"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";

/**
 * Pings the server once per connected wallet so a newly verified player is paid
 * their welcome bonus without having to claim anything.
 *
 * Deliberately dumb: it sends an address and ignores the answer. Whether the
 * wallet is verified, whether it has been welcomed before, and whether any
 * money moves are all decided in /api/welcome-bonus — nothing here can cause a
 * payment, so there is nothing here worth tampering with.
 *
 * Mounted from app/providers.tsx only, so it never runs in the MiniPay tree:
 * GoodDollar must not operate in the Mini App, and the bonus is paid in G$.
 */
export function WelcomeBonus() {
  const { address, isConnected } = useAccount();
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) return;
    const key = address.toLowerCase();
    // Once per wallet per page load. The server is the real guard; this just
    // keeps a re-render from making the same pointless request twice.
    if (asked.current === key) return;
    asked.current = key;

    void fetch("/api/welcome-bonus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: key }),
    }).catch(() => {
      // A player who cannot reach us has bigger problems than a bonus, and the
      // next page load tries again.
    });
  }, [address, isConnected]);

  return null;
}
