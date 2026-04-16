"use client";

import { useEffect, useRef } from "react";
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
  return new Date(isoDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function HistoryPage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { matchHistory } = useGameStore();

  useEffect(() => {
    const scale = () => {
      if (!wrapRef.current) return;
      const w = document.body.clientWidth;
      const h = document.body.clientHeight;
      const s = Math.min(w / DESIGN_W, h / DESIGN_H);
      wrapRef.current.style.transform = `scale(${s})`;
    };
    scale();
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, transformOrigin: "top left", position: "relative" }}>

        {/* Background */}
        <img src={BG_IMAGE} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.82)" }} />

        {/* Top Bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
            <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase" }}>ACTION ORDER</span>
          </button>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#9ca3af", textTransform: "uppercase" }}>MATCH HISTORY</div>
          <WalletSection />
        </div>

        {/* Content */}
        <div style={{ position: "absolute", top: 68, left: 0, right: 0, bottom: 0, overflowY: "auto", padding: "40px 80px" }}>

          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.5px" }}>Match History</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                {matchHistory.length === 0 ? "No matches yet" : `${matchHistory.length} match${matchHistory.length === 1 ? "" : "es"} recorded`}
              </div>
            </div>
            <button
              onClick={() => router.push("/profile")}
              style={{ background: "rgba(86,164,203,0.1)", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 8, padding: "10px 20px", color: "#56a4cb", fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: 1 }}
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
              <button
                onClick={() => router.push("/create")}
                style={{ marginTop: 16, background: "linear-gradient(135deg, #56a4cb, #b9e7f4)", border: "none", borderRadius: 8, padding: "12px 32px", color: "#000", fontSize: 14, fontWeight: 800, cursor: "pointer", letterSpacing: 1 }}
              >
                PLAY NOW
              </button>
            </div>
          )}

          {/* Table header */}
          {matchHistory.length > 0 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 120px 120px 120px 100px", gap: 16, padding: "0 24px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 8 }}>
                {["#", "OPPONENT", "RESULT", "SCORE", "POINTS", "DATE"].map((h) => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#475569", textTransform: "uppercase" }}>{h}</div>
                ))}
              </div>

              {/* Rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {matchHistory.map((match, idx) => {
                  const char = CHARACTERS.find((c) => c.id === match.opponentCharId);
                  const isWin = match.outcome === "win";
                  return (
                    <div
                      key={match.id + idx}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "60px 1fr 120px 120px 120px 100px",
                        gap: 16,
                        padding: "16px 24px",
                        background: "rgba(255,255,255,0.025)",
                        border: `1px solid ${isWin ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)"}`,
                        borderRadius: 10,
                        alignItems: "center",
                        transition: "background 0.15s",
                      }}
                    >
                      {/* # */}
                      <div style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>#{matchHistory.length - idx}</div>

                      {/* Opponent */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {char && (
                          <img
                            src={`/characters/${char.id}.webp`}
                            alt={char.name}
                            style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: `2px solid ${char.color}40` }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{char?.name ?? match.opponentCharId}</div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>{char?.className ?? ""}</div>
                        </div>
                      </div>

                      {/* Result badge */}
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "5px 14px", borderRadius: 20,
                        background: isWin ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                        border: `1px solid ${isWin ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
                        fontSize: 12, fontWeight: 800, letterSpacing: 1.5,
                        color: isWin ? "#4ade80" : "#f87171",
                      }}>
                        {isWin ? "WIN" : "LOSS"}
                      </div>

                      {/* Round score */}
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9" }}>
                        {match.playerRoundsWon} <span style={{ color: "#475569", fontSize: 13 }}>—</span> {match.opponentRoundsWon}
                      </div>

                      {/* Points */}
                      <div style={{ fontSize: 14, fontWeight: 700, color: isWin ? "#56a4cb" : "#64748b" }}>
                        {isWin ? "+" : ""}{match.pointsEarned} pts
                      </div>

                      {/* Date */}
                      <div style={{ fontSize: 12, color: "#64748b" }} title={formatDate(match.date)}>
                        {timeAgo(match.date)}
                      </div>
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
