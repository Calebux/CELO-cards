"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "../lib/gameStore";
import { WalletSection } from "../components/WalletSection";
import { CHARACTERS } from "../lib/gameData";

const BG_IMAGE = "/new addition/gameplay landing page.webp";
const DESIGN_W = 1440;
const DESIGN_H = 823;

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function HistoryPage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { matchHistory } = useGameStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const scale = () => {
      if (!wrapRef.current) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isPortrait = vh > vw;
      let transform: string;
      if (isPortrait) {
        const s = Math.min(vw / DESIGN_H, vh / DESIGN_W);
        const tx = vw / 2 + (DESIGN_H * s) / 2;
        const ty = vh / 2 - (DESIGN_W * s) / 2;
        transform = `translate(${tx}px, ${ty}px) rotate(90deg) scale(${s})`;
      } else {
        const s = Math.min(vw / DESIGN_W, vh / DESIGN_H);
        const tx = (vw - DESIGN_W * s) / 2;
        const ty = (vh - DESIGN_H * s) / 2;
        transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      }
      wrapRef.current.style.transform = transform;
    };
    scale();
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left" }}>

        <img src={BG_IMAGE} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.82)" }} />

        {/* Top Bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0, fontFamily: "inherit" }}>
            <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase" }}>ACTION ORDER</span>
          </button>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#9ca3af", textTransform: "uppercase" }}>MATCH HISTORY</div>
          <WalletSection />
        </div>

        {/* Content */}
        <div style={{ position: "absolute", top: 68, left: 0, right: 0, bottom: 0, overflowY: "auto", padding: "40px 80px" }}>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.5px" }}>Match History</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                {matchHistory.length === 0 ? "No matches yet" : `${matchHistory.length} match${matchHistory.length === 1 ? "" : "es"} recorded`}
              </div>
            </div>
            <button
              onClick={() => router.push("/profile")}
              style={{ background: "rgba(86,164,203,0.1)", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 8, padding: "10px 20px", color: "#56a4cb", fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: 1, fontFamily: "inherit" }}
            >
              ← PROFILE
            </button>
          </div>

          {/* Empty state */}
          {matchHistory.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, paddingTop: 120, color: "#475569" }}>
              <div style={{ fontSize: 64 }}>⚔️</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#64748b" }}>No matches yet</div>
              <div style={{ fontSize: 14, color: "#475569" }}>Complete a match to see your history here.</div>
              <button onClick={() => router.push("/create")} style={{ marginTop: 16, background: "linear-gradient(135deg, #56a4cb, #b9e7f4)", border: "none", borderRadius: 8, padding: "12px 32px", color: "#000", fontSize: 14, fontWeight: 800, cursor: "pointer", letterSpacing: 1, fontFamily: "inherit" }}>
                PLAY NOW
              </button>
            </div>
          )}

          {matchHistory.length > 0 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 110px 140px 110px 90px 28px", gap: 16, padding: "0 24px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 8 }}>
                {["#", "OPPONENT", "RESULT", "ROUNDS", "POINTS", "DATE", ""].map((h) => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#475569", textTransform: "uppercase" }}>{h}</div>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {matchHistory.map((match, idx) => {
                  const char = CHARACTERS.find((c) => c.id === match.opponentCharId);
                  const isWin = match.outcome === "win";
                  const isExpanded = expandedId === match.id + idx;
                  const totalRounds = match.playerRoundsWon + match.opponentRoundsWon;

                  return (
                    <div key={match.id + idx} style={{ borderRadius: 10, overflow: "hidden", background: `rgba(255,255,255,${isExpanded ? "0.04" : "0.025"})`, border: `1px solid ${isWin ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)"}`, transition: "background 0.15s" }}>

                      {/* Main row */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : match.id + idx)}
                        style={{ width: "100%", display: "grid", gridTemplateColumns: "56px 1fr 110px 140px 110px 90px 28px", gap: 16, padding: "14px 24px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", alignItems: "center", textAlign: "left" }}
                      >
                        <div style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>#{matchHistory.length - idx}</div>

                        {/* Opponent */}
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", border: `2px solid ${char?.color ?? "#475569"}40`, flexShrink: 0, background: "#1e293b" }}>
                            <img src={char?.portrait ?? ""} alt={char?.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{char?.name ?? match.opponentCharId}</div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>{char?.className ?? ""}</div>
                          </div>
                        </div>

                        {/* Result badge */}
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: isWin ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)", border: `1px solid ${isWin ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`, fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: isWin ? "#4ade80" : "#f87171", width: "fit-content" }}>
                          {isWin ? "WIN" : "LOSS"}
                        </div>

                        {/* Round dots */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ display: "flex", gap: 4 }}>
                            {Array.from({ length: 3 }).map((_, i) => (
                              <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i < match.playerRoundsWon ? "#06a8f9" : "rgba(255,255,255,0.1)", border: `1px solid ${i < match.playerRoundsWon ? "#06a8f9" : "rgba(255,255,255,0.15)"}`, boxShadow: i < match.playerRoundsWon ? "0 0 6px #06a8f9" : "none" }} />
                            ))}
                          </div>
                          <span style={{ fontSize: 12, color: "#475569" }}>—</span>
                          <div style={{ display: "flex", gap: 4 }}>
                            {Array.from({ length: 3 }).map((_, i) => (
                              <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i < match.opponentRoundsWon ? char?.color ?? "#f87171" : "rgba(255,255,255,0.1)", border: `1px solid ${i < match.opponentRoundsWon ? char?.color ?? "#f87171" : "rgba(255,255,255,0.15)"}`, boxShadow: i < match.opponentRoundsWon ? `0 0 6px ${char?.color}` : "none" }} />
                            ))}
                          </div>
                        </div>

                        {/* Points */}
                        <div style={{ fontSize: 14, fontWeight: 700, color: isWin ? "#56a4cb" : "#64748b" }}>
                          {isWin ? "+" : ""}{match.pointsEarned} pts
                        </div>

                        {/* Date */}
                        <div style={{ fontSize: 12, color: "#64748b" }} title={formatDate(match.date)}>{timeAgo(match.date)}</div>

                        {/* Expand arrow */}
                        <div style={{ color: "#475569", fontSize: 14, transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▼</div>
                      </button>

                      {/* Expanded breakdown */}
                      {isExpanded && (
                        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                          {/* Rounds breakdown */}
                          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "14px 18px" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#475569", textTransform: "uppercase", marginBottom: 12 }}>Round Breakdown</div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              {Array.from({ length: totalRounds }).map((_, i) => {
                                const playerWon = i < match.playerRoundsWon;
                                return (
                                  <div key={i} style={{ flex: 1, padding: "8px 6px", borderRadius: 6, textAlign: "center", background: playerWon ? "rgba(6,168,249,0.12)" : `rgba(${char ? "var(--opp-rgb, 248,113,113)" : "248,113,113"},0.12)`, border: `1px solid ${playerWon ? "rgba(6,168,249,0.3)" : "rgba(248,113,113,0.3)"}` }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: playerWon ? "#06a8f9" : "#f87171" }}>R{i + 1}</div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", marginTop: 2 }}>{playerWon ? "WIN" : "LOSS"}</div>
                                  </div>
                                );
                              })}
                              {totalRounds === 0 && <div style={{ fontSize: 12, color: "#475569" }}>No round data</div>}
                            </div>
                          </div>

                          {/* Opponent info */}
                          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                            {char && (
                              <div style={{ width: 60, height: 80, borderRadius: 6, overflow: "hidden", border: `2px solid ${char.color}50`, flexShrink: 0 }}>
                                <img src={char.standingArt} alt={char.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }} />
                              </div>
                            )}
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#475569", textTransform: "uppercase", marginBottom: 4 }}>Opponent</div>
                              <div style={{ fontSize: 16, fontWeight: 800, color: char?.color ?? "#f87171", textTransform: "uppercase", letterSpacing: 1 }}>{char?.name ?? match.opponentCharId}</div>
                              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{char?.className ?? ""}</div>
                              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{char?.passive?.name}</div>
                            </div>
                          </div>

                          {/* Stats summary */}
                          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "14px 18px" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#475569", textTransform: "uppercase", marginBottom: 12 }}>Summary</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 12, color: "#64748b" }}>Outcome</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: isWin ? "#4ade80" : "#f87171" }}>{isWin ? "Victory" : "Defeat"}</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 12, color: "#64748b" }}>Score</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{match.playerRoundsWon} – {match.opponentRoundsWon}</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 12, color: "#64748b" }}>Points earned</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24" }}>+{match.pointsEarned}</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 12, color: "#64748b" }}>Date</span>
                                <span style={{ fontSize: 12, color: "#64748b" }}>{formatDate(match.date)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
