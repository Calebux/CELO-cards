"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useGameStore } from "../lib/gameStore";
import { WalletSection } from "../components/WalletSection";
import { SoundSettingsButton } from "../components/SoundSettings";
import { ClaimGDollar } from "../components/ClaimGDollar";

const BG_IMAGE = "/new addition/gameplay landing page.webp";

const DESIGN_W = 1440;
const DESIGN_H = 823;

type Achievement = {
  id: string;
  icon: string;
  name: string;
  description: string;
  unlocked: boolean;
  color: string;
};

function getRank(points: number): { label: string; color: string } {
  if (points >= 5000) return { label: "LEGEND", color: "#FFD700" };
  if (points >= 2000) return { label: "MASTER", color: "#c084fc" };
  if (points >= 1000) return { label: "VETERAN", color: "#06a8f9" };
  if (points >= 400)  return { label: "FIGHTER", color: "#56a4cb" };
  if (points >= 100)  return { label: "ROOKIE", color: "#4ade80" };
  return { label: "UNRANKED", color: "#475569" };
}

function winRate(won: number, played: number): string {
  if (played === 0) return "—";
  return Math.round((won / played) * 100) + "%";
}

export default function ProfilePage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { address } = useAccount();

  const {
    playerPoints,
    matchesPlayed,
    matchesWon,
    matchesLost,
    winStreak,
    maxWinStreak,
    playerName,
    setPlayerName,
    matchHistory,
  } = useGameStore();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

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

  const rank = getRank(playerPoints);

  const achievements: Achievement[] = [
    {
      id: "first_blood",
      icon: "🩸",
      name: "First Blood",
      description: "Win your first match",
      unlocked: matchesWon >= 1,
      color: "#f87171",
    },
    {
      id: "warrior",
      icon: "⚔️",
      name: "Warrior",
      description: "Win 5 matches",
      unlocked: matchesWon >= 5,
      color: "#fb923c",
    },
    {
      id: "veteran",
      icon: "🎖️",
      name: "Veteran",
      description: "Play 10 matches",
      unlocked: matchesPlayed >= 10,
      color: "#60a5fa",
    },
    {
      id: "on_fire",
      icon: "🔥",
      name: "On Fire",
      description: "Reach a 3-win streak",
      unlocked: maxWinStreak >= 3,
      color: "#f97316",
    },
    {
      id: "unstoppable",
      icon: "⚡",
      name: "Unstoppable",
      description: "Reach a 5-win streak",
      unlocked: maxWinStreak >= 5,
      color: "#fbbf24",
    },
    {
      id: "centurion",
      icon: "💎",
      name: "Centurion",
      description: "Earn 1,000 points",
      unlocked: playerPoints >= 1000,
      color: "#b9e7f4",
    },
    {
      id: "legend",
      icon: "👑",
      name: "Legend",
      description: "Reach LEGEND rank (5,000 pts)",
      unlocked: playerPoints >= 5000,
      color: "#FFD700",
    },
    {
      id: "iron_will",
      icon: "🛡️",
      name: "Iron Will",
      description: "Win a match after 3 consecutive losses",
      unlocked: matchesWon >= 1 && matchesLost >= 3,
      color: "#8c25f4",
    },
  ];

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, transformOrigin: "top left", position: "relative" }}>

        {/* Background */}
        <img src={BG_IMAGE} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.78)" }} />

        {/* ── Top Bar ── */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
            <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase", fontFamily: "var(--font-space-grotesk), sans-serif" }}>ACTION ORDER</span>
          </button>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#9ca3af", textTransform: "uppercase" }}>PLAYER PROFILE</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <SoundSettingsButton />
            <WalletSection />
          </div>
        </div>

        {/* Main layout */}
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -47%)", width: 900, display: "flex", gap: 24 }}>

          {/* Left column */}
          <div style={{ width: 260, display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Identity card */}
            <div style={{ backgroundColor: "rgba(15,23,42,0.6)", border: "1.5px solid rgba(86,164,203,0.3)", borderRadius: 8, backdropFilter: "blur(8px)", padding: "28px 24px", textAlign: "center", boxShadow: "0 0 20px rgba(86,164,203,0.1)" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: `linear-gradient(135deg, ${rank.color}33, transparent)`, border: `2px solid ${rank.color}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <span className="material-icons" style={{ fontSize: 28, color: rank.color }}>person</span>
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: rank.color, textTransform: "uppercase", marginBottom: 6 }}>{rank.label}</div>

              {/* Editable player name */}
              {editingName ? (
                <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 4 }}>
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    maxLength={20}
                    autoFocus
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid #56a4cb", borderRadius: 6, padding: "4px 8px", color: "#f1f5f9", fontSize: 13, fontWeight: 700, width: 120, textAlign: "center", outline: "none" }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { setPlayerName(nameInput); setEditingName(false); }
                      if (e.key === "Escape") { setEditingName(false); }
                    }}
                  />
                  <button onClick={() => { setPlayerName(nameInput); setEditingName(false); }} style={{ background: "#56a4cb", border: "none", borderRadius: 6, padding: "4px 8px", color: "#000", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>✓</button>
                  <button onClick={() => setEditingName(false)} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, padding: "4px 8px", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}>✕</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 4 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", letterSpacing: 0.5 }}>
                    {playerName || (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—")}
                  </div>
                  <button
                    onClick={() => { setNameInput(playerName); setEditingName(true); }}
                    title="Edit name"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", fontSize: 13, padding: 0, lineHeight: 1 }}
                  >✏️</button>
                </div>
              )}

              <div style={{ fontSize: 11, color: "#475569", fontFamily: "monospace" }}>
                {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "NOT CONNECTED"}
              </div>
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: rank.color, textShadow: `0 0 14px ${rank.color}80` }}>
                  {playerPoints.toLocaleString()}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#475569", textTransform: "uppercase", marginTop: 4 }}>TOTAL POINTS</div>
              </div>
            </div>

            {/* G$ UBI Claim */}
            <ClaimGDollar />

            {/* Stats */}
            <div style={{ backgroundColor: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "20px 20px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#475569", textTransform: "uppercase", marginBottom: 14 }}>Match Stats</div>
              {[
                { label: "Played", value: matchesPlayed, color: "#94a3b8" },
                { label: "Wins", value: matchesWon, color: "#4ade80" },
                { label: "Losses", value: matchesLost, color: "#f87171" },
                { label: "Win Rate", value: winRate(matchesWon, matchesPlayed), color: "#b9e7f4" },
                { label: "Streak", value: winStreak > 0 ? `🔥 ${winStreak}` : winStreak, color: winStreak >= 3 ? "#f97316" : "#94a3b8" },
                { label: "Best Streak", value: maxWinStreak, color: maxWinStreak >= 5 ? "#fbbf24" : "#94a3b8" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right column — achievements */}
          <div style={{ flex: 1 }}>
            <div style={{ backgroundColor: "rgba(15,23,42,0.55)", border: "1.5px solid #b9e7f4", borderRadius: 8, backdropFilter: "blur(6px)", padding: "28px 28px 24px", boxShadow: "0 0 20px rgba(185,231,244,0.15)", position: "relative", overflow: "hidden" }}>
              {/* Scanline */}
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, backgroundColor: "#56a4cb" }} />

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: -0.5, margin: 0 }}>Achievements</h2>
                  <p style={{ fontSize: 11, color: "#94a3b8", margin: "4px 0 0", letterSpacing: 0.5 }}>
                    {unlockedCount} / {achievements.length} unlocked
                  </p>
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: "#56a4cb", textTransform: "uppercase", padding: "4px 10px", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 4 }}>
                  {Math.round((unlockedCount / achievements.length) * 100)}% complete
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 4, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 24, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(unlockedCount / achievements.length) * 100}%`, background: "linear-gradient(90deg, #56a4cb, #b9e7f4)", borderRadius: 2, transition: "width 0.6s ease" }} />
              </div>

              {/* Achievement grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {achievements.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      backgroundColor: a.unlocked ? `${a.color}12` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${a.unlocked ? a.color + "50" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: 8,
                      padding: "14px 12px",
                      textAlign: "center",
                      opacity: a.unlocked ? 1 : 0.45,
                      transition: "all 0.2s",
                      position: "relative",
                    }}
                  >
                    {a.unlocked && (
                      <div style={{ position: "absolute", top: 6, right: 6 }}>
                        <span className="material-icons" style={{ fontSize: 10, color: a.color }}>check_circle</span>
                      </div>
                    )}
                    <div style={{ fontSize: 24, marginBottom: 8, filter: a.unlocked ? "none" : "grayscale(1)" }}>{a.icon}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: a.unlocked ? "#f1f5f9" : "#475569", letterSpacing: 0.5, marginBottom: 4 }}>{a.name}</div>
                    <div style={{ fontSize: 9, color: "#475569", lineHeight: "12px" }}>{a.description}</div>
                  </div>
                ))}
              </div>

              {/* Empty state for new players */}
              {matchesPlayed === 0 && (
                <div style={{ marginTop: 20, padding: "16px", background: "rgba(86,164,203,0.06)", border: "1px solid rgba(86,164,203,0.15)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "#64748b", lineHeight: "18px" }}>
                    Play your first match to unlock achievements and start tracking your stats.
                  </div>
                  <button onClick={() => router.push("/create")} style={{ marginTop: 10, background: "linear-gradient(135deg, #56a4cb, #b9e7f4)", border: "none", borderRadius: 6, padding: "8px 20px", color: "#000", fontSize: 11, fontWeight: 800, cursor: "pointer", letterSpacing: 1 }}>PLAY NOW</button>
                </div>
              )}

              {/* Bottom links */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 20 }}>
                <div style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
                <button
                  onClick={() => router.push("/history")}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#56a4cb", letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit" }}
                >
                  MATCH HISTORY ({matchHistory.length})
                </button>
                <div style={{ width: 1, height: 12, backgroundColor: "#1e293b" }} />
                <button
                  onClick={() => router.push("/")}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit" }}
                >
                  ← BACK TO MENU
                </button>
                <div style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#4ade80" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", letterSpacing: 1.2, textTransform: "uppercase" }}>
            ACTION ORDER — CELO MAINNET
          </span>
        </div>

      </div>
    </div>
  );
}
