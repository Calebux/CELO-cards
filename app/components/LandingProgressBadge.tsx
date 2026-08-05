"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useGameStore } from "../lib/gameStore";
import { BOUNTY_MIN_POINTS_TO_WIN } from "../lib/bountyConfig";

type BountyMe = { points: number; rank: number | null; qualified: boolean; totalUsd: number };

/**
 * Shows today's bounty points, from the server.
 *
 * This used to show gameStore.playerPoints, which is computed on the client and
 * scores every ROUND (slot wins x10, +50 a round, +100 a match). The bounty
 * scores only completed MATCHES. The two diverge fast — a player with 265
 * bounty points saw 620 here, assumed she had cleared the 500 threshold, and
 * would have been paid nothing. Whatever number sits next to the word "points"
 * has to be the one that decides payment.
 */
export function LandingProgressBadge({ isCompact }: { isCompact: boolean }) {
  const winStreak = useGameStore((state) => state.winStreak);
  const { address } = useAccount();
  const [me, setMe] = useState<BountyMe | null>(null);

  useEffect(() => {
    if (!address) { setMe(null); return; }
    let cancelled = false;
    const load = () => {
      void fetch(`/api/bounty?address=${address.toLowerCase()}&limit=1&t=${Date.now()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { you?: BountyMe | null }) => { if (!cancelled) setMe(d.you ?? null); })
        .catch(() => {});
    };
    load();
    // Points land server-side after a match resolves, so refresh on return to
    // the landing rather than leaving a stale number on screen.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
  }, [address]);

  const points = me?.points ?? 0;
  const qualified = me?.qualified ?? false;
  const remaining = Math.max(0, BOUNTY_MIN_POINTS_TO_WIN - points);
  const pct = Math.min(100, (points / BOUNTY_MIN_POINTS_TO_WIN) * 100);

  return (
    <div className="ko-points-badge" style={{ top: isCompact ? 656 : 596 }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{qualified ? "💰" : "⚡"}</span>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 96 }}>
        <span className="ko-points-label">{address ? "Today's Points" : "Total Points"}</span>
        <span className="ko-points-value" style={qualified ? { color: "#4ade80", textShadow: "0 0 12px rgba(74,222,128,0.5)" } : undefined}>
          {points.toLocaleString()}
          {address && !qualified && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}> / {BOUNTY_MIN_POINTS_TO_WIN}</span>
          )}
        </span>
        {address && (
          <>
            {/* The bar makes "am I getting paid today" readable at a glance,
                which the raw number alone never did. */}
            <div style={{ width: "100%", height: 3, borderRadius: 2, background: "rgba(148,163,184,0.2)", marginTop: 3, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: qualified ? "#4ade80" : "#56a4cb", transition: "width .3s" }} />
            </div>
            <span style={{ fontSize: 9, fontWeight: 600, color: qualified ? "#4ade80" : "#64748b", letterSpacing: 0.3, marginTop: 2 }}>
              {qualified
                ? `In the money${me?.totalUsd ? ` · $${me.totalUsd}` : ""}`
                : `${remaining.toLocaleString()} to qualify`}
            </span>
          </>
        )}
      </div>
      {winStreak > 1 && (
        <>
          <div style={{ width: 1, height: 24, background: "rgba(168,85,247,0.3)", marginLeft: 8, marginRight: 8 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span className="ko-points-label" style={{ color: "#f97316" }}>Win Streak</span>
            <span className="ko-points-value" style={{ color: "#f97316", textShadow: "0 0 12px rgba(249,115,22,0.6)" }}>🔥 {winStreak}</span>
          </div>
        </>
      )}
    </div>
  );
}
