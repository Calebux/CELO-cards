"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";

/**
 * Pings the server so a newly verified player is paid their welcome bonus
 * without having to claim anything.
 *
 * Deliberately dumb: it sends an address and ignores the answer. Whether the
 * wallet is verified, whether it has been welcomed before, and whether any
 * money moves are all decided in /api/welcome-bonus — nothing here can cause a
 * payment, so there is nothing here worth tampering with.
 *
 * It used to ask exactly once per wallet per page load, which missed almost
 * everyone. A player is normally connected BEFORE they verify, so the single
 * ping went out while they were still unverified and answered "no"; verifying
 * then sends them out to GoodDollar and back, and when the returning session
 * fails to reconnect — 42% of resumes give up — no further ping is ever sent.
 * So it now retries on a slow timer while the answer can still change.
 *
 * This is the fast path, not the guarantee: /api/cron/welcome-sweep pays anyone
 * this misses. Retrying here only shortens the wait for the player in front of
 * the game, which is why the interval is lazy and the component gives up once
 * the server says the question is settled.
 *
 * Mounted from app/providers.tsx only, so it never runs in the MiniPay tree:
 * GoodDollar must not operate in the Mini App, and the bonus is paid in G$.
 */
/** Long enough to be invisible, short enough to land inside the 24h window. */
const RETRY_MS = 90_000;
/** ~15 minutes of a single session. The sweep covers anything past that. */
const MAX_ATTEMPTS = 10;

export function WelcomeBonus() {
  const { address, isConnected } = useAccount();
  const settled = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) return;
    const key = address.toLowerCase();
    // Once the server has told us this wallet is done, stop asking about it.
    if (settled.current === key) return;

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const ask = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const res = await fetch("/api/welcome-bonus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: key }),
        });
        const data = (await res.json()) as { sent?: boolean; alreadySent?: boolean; verified?: boolean };
        // "paid" and "already paid" are both final. "verified: false" is not —
        // that is precisely the player who is about to go and verify.
        if (data.sent || data.alreadySent) {
          settled.current = key;
          return;
        }
      } catch {
        // A player who cannot reach us has bigger problems than a bonus.
      }
      if (!cancelled && attempts < MAX_ATTEMPTS) timer = setTimeout(() => void ask(), RETRY_MS);
    };

    void ask();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [address, isConnected]);

  return null;
}
