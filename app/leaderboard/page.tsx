"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { WalletSection } from "../components/WalletSection";

const BG_IMAGE = "/new addition/gameplay landing page.webp";

const DESIGN_W = 1440;
const DESIGN_H = 823;

type Tab = "casual" | "ranked";

type Player = {
  rank: number;
  address: string;
  wins: number;
  losses: number;
  points: number;
  lastSeen: number;
};

function truncateAddress(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function winPct(wins: number, losses: number): string {
  const total = wins + losses;
  if (total === 0) return "—";
  return Math.round((wins / total) * 100) + "%";
}

const RANK_COLORS: Record<number, string> = {
  1: "#FFD700",
  2: "#C0C0C0",
  3: "#CD7F32",
};

export default function Leaderboard() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { address } = useAccount();
  const [tab, setTab] = useState<Tab>("casual");
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    const scale = () => {
      if (!wrapRef.current) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isPortrait = vh > vw;
      let s: number;
      let transform: string;
      if (isPortrait) {
        s = Math.min(vh / DESIGN_W, vw / DESIGN_H);
        transform = `translate(-50%, -50%) rotate(90deg) scale(${s})`;
      } else {
        s = Math.min(vw / DESIGN_W, vh / DESIGN_H);
        transform = `translate(-50%, -50%) scale(${s})`;
      }
      wrapRef.current.style.transform = transform;
    };
    scale();
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, []);

  const loadLeaderboard = () => {
    setLoading(true);
    setFetchError(false);
    void fetch(`/api/leaderboard?tab=${tab}&limit=50`)
      .then((r) => r.json())
      .then((data: { players: Player[] }) => {
        setPlayers(data.players ?? []);
        setLoading(false);
      })
      .catch(() => { setLoading(false); setFetchError(true); });
  };

  useEffect(() => {
    loadLeaderboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "fixed", top: "50%", left: "50%", transformOrigin: "center center" }}>

        {/* Background */}
        <img src={BG_IMAGE} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.75)" }} />

        {/* ── Top Bar ── */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
            <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase", fontFamily: "var(--font-space-grotesk), sans-serif" }}>ACTION ORDER</span>
          </button>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#9ca3af", textTransform: "uppercase" }}>LEADERBOARD</div>
          <WalletSection />
        </div>

        {/* Main container */}
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -46%)", width: 820 }}>

          {/* Corner accents */}
          {[
            { top: -12, left: -12, borderLeft: "1.5px solid #b9e7f4", borderTop: "1.5px solid #b9e7f4" },
            { top: -12, right: -12, borderRight: "1.5px solid #b9e7f4", borderTop: "1.5px solid #b9e7f4" },
            { bottom: -12, left: -12, borderLeft: "1.5px solid #b9e7f4", borderBottom: "1.5px solid #b9e7f4" },
            { bottom: -12, right: -12, borderRight: "1.5px solid #b9e7f4", borderBottom: "1.5px solid #b9e7f4" },
          ].map((s, i) => (
            <div key={i} style={{ position: "absolute", width: 36, height: 36, ...s }} />
          ))}

          {/* Glass panel */}
          <div style={{
            backgroundColor: "rgba(15, 23, 42, 0.55)",
            border: "2.4px solid #b9e7f4", borderRadius: 6,
            backdropFilter: "blur(6px)",
            padding: "36px 40px 32px",
            position: "relative", overflow: "hidden",
            boxShadow: "0 0 20px rgba(185, 231, 244, 0.2)",
          }}>
            {/* Scanline */}
            <div style={{ position: "absolute", top: -2, left: -2, right: -2, height: 1.5, backgroundColor: "#56a4cb" }} />

            {/* Heading */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 26, fontWeight: 700, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: -0.5, margin: 0, lineHeight: "32px" }}>
                  Leaderboard
                </h2>
                <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0", letterSpacing: 0.5 }}>
                  Global rankings across all players
                </p>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 8 }}>
                {(["casual", "ranked"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={{
                      padding: "7px 20px",
                      border: `1.5px solid ${tab === t ? "#56a4cb" : "#334155"}`,
                      borderRadius: 5,
                      background: tab === t ? "rgba(86,164,203,0.15)" : "rgba(17,10,24,0.4)",
                      color: tab === t ? "#b9e7f4" : "#6b7280",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all 0.2s",
                    }}
                  >
                    {t === "casual" ? "Casual" : "Ranked"}
                  </button>
                ))}
              </div>
            </div>

            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "48px 1fr 90px 60px 60px 70px",
              gap: 0,
              padding: "8px 16px",
              borderBottom: "1px solid #1e293b",
              marginBottom: 4,
            }}>
              {["#", "PLAYER", "POINTS", "W", "L", "WIN%"].map((col) => (
                <span key={col} style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: "#475569", textTransform: "uppercase" }}>{col}</span>
              ))}
            </div>

            {/* Table rows */}
            <div style={{ minHeight: 340, maxHeight: 340, overflowY: "auto" }}>
              {loading ? (
                <div>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "48px 1fr 90px 60px 60px 70px", gap: 0, padding: "12px 16px", borderBottom: "1px solid rgba(30,41,59,0.6)" }}>
                      <div style={{ width: 24, height: 14, borderRadius: 3, background: "rgba(255,255,255,0.06)", animation: "shimmer 1.4s ease-in-out infinite", animationDelay: `${i * 0.08}s` }} />
                      <div style={{ width: `${60 + (i % 3) * 12}%`, height: 14, borderRadius: 3, background: "rgba(255,255,255,0.06)", animation: "shimmer 1.4s ease-in-out infinite", animationDelay: `${i * 0.08}s` }} />
                      <div style={{ width: 44, height: 14, borderRadius: 3, background: "rgba(255,255,255,0.06)", animation: "shimmer 1.4s ease-in-out infinite", animationDelay: `${i * 0.08}s` }} />
                      <div style={{ width: 20, height: 14, borderRadius: 3, background: "rgba(255,255,255,0.06)", animation: "shimmer 1.4s ease-in-out infinite", animationDelay: `${i * 0.08}s` }} />
                      <div style={{ width: 20, height: 14, borderRadius: 3, background: "rgba(255,255,255,0.06)", animation: "shimmer 1.4s ease-in-out infinite", animationDelay: `${i * 0.08}s` }} />
                      <div style={{ width: 30, height: 14, borderRadius: 3, background: "rgba(255,255,255,0.06)", animation: "shimmer 1.4s ease-in-out infinite", animationDelay: `${i * 0.08}s` }} />
                    </div>
                  ))}
                </div>
              ) : fetchError ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 340, gap: 12 }}>
                  <span style={{ fontSize: 32 }}>⚠️</span>
                  <p style={{ fontSize: 13, color: "#f87171", letterSpacing: 1 }}>Failed to load leaderboard</p>
                  <button onClick={loadLeaderboard} style={{ background: "rgba(86,164,203,0.12)", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 6, padding: "8px 20px", color: "#56a4cb", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 1 }}>RETRY</button>
                </div>
              ) : players.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 340, gap: 12 }}>
                  <span className="material-icons" style={{ color: "#334155", fontSize: 48 }}>leaderboard</span>
                  <p style={{ fontSize: 13, color: "#475569", letterSpacing: 1, textTransform: "uppercase" }}>No matches recorded yet</p>
                  <p style={{ fontSize: 11, color: "#334155", letterSpacing: 0.5 }}>Play a match to appear here</p>
                </div>
              ) : (
                players.map((p) => {
                  const isMe = address && p.address.toLowerCase() === address.toLowerCase();
                  const rankColor = RANK_COLORS[p.rank];
                  return (
                    <div
                      key={p.address}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "48px 1fr 90px 60px 60px 70px",
                        gap: 0,
                        padding: "10px 16px",
                        borderBottom: "1px solid rgba(30,41,59,0.6)",
                        backgroundColor: isMe ? "rgba(86,164,203,0.1)" : "transparent",
                        borderLeft: isMe ? "2px solid #56a4cb" : "2px solid transparent",
                        transition: "background 0.2s",
                      }}
                    >
                      {/* Rank */}
                      <span style={{
                        fontSize: rankColor ? 15 : 13,
                        fontWeight: 800,
                        color: rankColor ?? "#475569",
                        textShadow: rankColor ? `0 0 8px ${rankColor}` : "none",
                      }}>
                        {p.rank <= 3 ? ["🥇", "🥈", "🥉"][p.rank - 1] : `#${p.rank}`}
                      </span>

                      {/* Address */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          fontSize: 13,
                          fontWeight: isMe ? 700 : 500,
                          color: isMe ? "#b9e7f4" : "#94a3b8",
                          fontFamily: "monospace",
                          letterSpacing: 0.5,
                        }}>
                          {truncateAddress(p.address)}
                        </span>
                        {isMe && (
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: "#56a4cb", textTransform: "uppercase", background: "rgba(86,164,203,0.15)", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 3, padding: "1px 5px" }}>
                            YOU
                          </span>
                        )}
                      </div>

                      {/* Points */}
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9" }}>
                        {p.points.toLocaleString()}
                      </span>

                      {/* Wins */}
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#4ade80" }}>{p.wins}</span>

                      {/* Losses */}
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#f87171" }}>{p.losses}</span>

                      {/* Win % */}
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>{winPct(p.wins, p.losses)}</span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer / back */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 20 }}>
              <div style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
              <button
                onClick={() => router.push("/")}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit" }}
              >
                ← Back to Menu
              </button>
              <div style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
            </div>
          </div>
        </div>

        {/* Footer bar */}
        <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#4ade80" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", letterSpacing: 1.2, textTransform: "uppercase" }}>
            ACTION ORDER — CELO MAINNET
          </span>
        </div>

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
