"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "../lib/gameStore";
import { BOUNTY_CLAIM_URL, BOUNTY_MIN_POINTS_TO_WIN } from "../lib/bountyConfig";

type BountyMe = { points: number; rank: number | null; qualified: boolean; totalUsd: number };
type BountyResponse = { you?: BountyMe | null; careerPoints?: number | null };

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
  const localPoints = useGameStore((state) => state.playerPoints);
  // Deliberately NOT useAccount(): this badge renders on the landing page
  // OUTSIDE LandingWalletHud, which is what mounts WagmiProvider — any wagmi
  // hook here throws "useConfig must be used within WagmiProvider" on render.
  // WalletSync already mirrors the connected address into the store, so the
  // store is the safe source for a component that lives outside the tree.
  const address = useGameStore((state) => state.playerAddress);
  const [me, setMe] = useState<BountyMe | null>(null);
  const [career, setCareer] = useState<number | null>(null);

  useEffect(() => {
    if (!address) { setMe(null); return; }
    let cancelled = false;
    const load = () => {
      void fetch(`/api/bounty?address=${address.toLowerCase()}&limit=1&t=${Date.now()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: BountyResponse) => {
          if (cancelled) return;
          setMe(d.you ?? null);
          setCareer(typeof d.careerPoints === "number" ? d.careerPoints : null);
        })
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
      <div style={{ display: "flex", flexDirection: "column", minWidth: 92 }}>
        {/* Career total leads. It never resets, so it is the number a player
            identifies with — the daily bounty bucket starting at zero each
            midnight read as "my points were wiped". */}
        <span className="ko-points-label">Total Points</span>
        <span className="ko-points-value">
          {(career ?? localPoints).toLocaleString()}
        </span>
        {address && (
          <>
            <div style={{ width: "100%", height: 3, borderRadius: 2, background: "rgba(148,163,184,0.2)", marginTop: 4, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: qualified ? "#4ade80" : "#56a4cb", transition: "width .3s" }} />
            </div>
            {qualified ? (
              <a
                href={BOUNTY_CLAIM_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 9, fontWeight: 700, color: "#4ade80", letterSpacing: 0.3, marginTop: 2, textDecoration: "none" }}
              >
                💰 Claim{me?.totalUsd ? ` $${me.totalUsd}` : ""} →
              </a>
            ) : (
              <span style={{ fontSize: 9, fontWeight: 600, color: "#64748b", letterSpacing: 0.3, marginTop: 2 }}>
                Today {points.toLocaleString()} · {remaining.toLocaleString()} to bounty
              </span>
            )}
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
