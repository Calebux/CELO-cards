"use client";

import { useGameStore } from "../lib/gameStore";

export function LandingProgressBadge({ isCompact }: { isCompact: boolean }) {
  const playerPoints = useGameStore((state) => state.playerPoints);
  const winStreak = useGameStore((state) => state.winStreak);

  return (
    <div className="ko-points-badge" style={{ top: isCompact ? 656 : 596 }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>⚡</span>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span className="ko-points-label">Total Points</span>
        <span className="ko-points-value">{playerPoints.toLocaleString()}</span>
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
