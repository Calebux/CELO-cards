"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useGameStore } from "../lib/gameStore";
import { WalletSection } from "../components/WalletSection";
import { ClaimGDollar } from "../components/ClaimGDollar";
import { CHARACTERS, CARDS } from "../lib/gameData";

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
    unlockedPremiumCards,
  } = useGameStore();

  const ownedCards = CARDS.filter((c) => c.isPremium && unlockedPremiumCards.includes(c.id));

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [serverUnlocked, setServerUnlocked] = useState<Set<string>>(new Set());

  const saveUsername = async (name: string) => {
    if (!address) { setPlayerName(name); setEditingName(false); return; }
    setNameSaving(true);
    setNameError("");
    try {
      const res = await fetch("/api/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, username: name }),
      });
      const data = await res.json() as { ok?: boolean; username?: string; error?: string };
      if (!res.ok) {
        setNameError(data.error ?? "Failed to save");
      } else {
        setPlayerName(data.username ?? name);
        setEditingName(false);
      }
    } catch {
      setNameError("Network error");
    } finally {
      setNameSaving(false);
    }
  };

  // Sync achievements to server and fetch persisted unlocks
  const syncAchievements = useCallback(async (addr: string) => {
    try {
      const res = await fetch("/api/achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: addr,
          stats: { matchesWon, matchesPlayed, playerPoints, maxWinStreak, matchesLost },
        }),
      });
      if (res.ok) {
        const { unlockedIds } = await res.json() as { unlockedIds: string[] };
        setServerUnlocked(new Set(unlockedIds));
      }
    } catch {
      // offline — silently ignore
    }
  }, [matchesWon, matchesPlayed, playerPoints, maxWinStreak, matchesLost]);

  useEffect(() => {
    if (address) syncAchievements(address);
  }, [address, syncAchievements]);

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

  const rank = getRank(playerPoints);

  const achievements: Achievement[] = [
    { id: "first_blood",  icon: "🩸", name: "First Blood",   description: "Win your first match",                   unlocked: matchesWon >= 1 || serverUnlocked.has("first_blood"),                    color: "#f87171" },
    { id: "warrior",      icon: "⚔️",  name: "Warrior",       description: "Win 5 matches",                          unlocked: matchesWon >= 5 || serverUnlocked.has("warrior"),                        color: "#fb923c" },
    { id: "veteran",      icon: "🎖️", name: "Veteran",       description: "Play 10 matches",                        unlocked: matchesPlayed >= 10 || serverUnlocked.has("veteran"),                    color: "#60a5fa" },
    { id: "on_fire",      icon: "🔥", name: "On Fire",        description: "Reach a 3-win streak",                   unlocked: maxWinStreak >= 3 || serverUnlocked.has("on_fire"),                      color: "#f97316" },
    { id: "unstoppable",  icon: "⚡", name: "Unstoppable",    description: "Reach a 5-win streak",                   unlocked: maxWinStreak >= 5 || serverUnlocked.has("unstoppable"),                  color: "#fbbf24" },
    { id: "centurion",    icon: "💎", name: "Centurion",      description: "Earn 1,000 points",                      unlocked: playerPoints >= 1000 || serverUnlocked.has("centurion"),                 color: "#b9e7f4" },
    { id: "legend",       icon: "👑", name: "Legend",         description: "Reach LEGEND rank (5,000 pts)",          unlocked: playerPoints >= 5000 || serverUnlocked.has("legend"),                    color: "#FFD700" },
    { id: "iron_will",    icon: "🛡️", name: "Iron Will",     description: "Win a match after 3 consecutive losses", unlocked: (matchesWon >= 1 && matchesLost >= 3) || serverUnlocked.has("iron_will"), color: "#8c25f4" },
  ];

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  // Derived stats from match history
  const { favouriteChar, topRival, totalPointsAllTime } = useMemo(() => {
    const charPlayed: Record<string, number> = {};
    const rivalWins: Record<string, number> = {};
    let total = 0;
    for (const m of matchHistory) {
      charPlayed[m.playerCharId] = (charPlayed[m.playerCharId] ?? 0) + 1;
      rivalWins[m.opponentCharId] = (rivalWins[m.opponentCharId] ?? 0) + (m.outcome === "win" ? 1 : 0);
      total += m.pointsEarned;
    }
    const favId = Object.entries(charPlayed).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const rivalId = Object.entries(rivalWins).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      favouriteChar: favId ? CHARACTERS.find((c) => c.id === favId) ?? null : null,
      topRival: rivalId ? CHARACTERS.find((c) => c.id === rivalId) ?? null : null,
      totalPointsAllTime: total,
    };
  }, [matchHistory]);

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left" }}>

        {/* Background */}
        <img src={BG_IMAGE} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.78)" }} />

        {/* ── Top Bar ── */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
            <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase", fontFamily: "var(--font-space-grotesk), sans-serif" }}>ACTION ORDER</span>
          </button>
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#9ca3af", textTransform: "uppercase" }}>PLAYER PROFILE</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <WalletSection />
          </div>
        </div>

        {/* Main layout — 3 columns, pinned below nav, no scroll */}
        <div style={{ position: "absolute", left: "50%", top: 80, transform: "translateX(-50%)", width: 1300, display: "flex", gap: 20, alignItems: "flex-start" }}>

          {/* ── Col 1: Identity + G$ + Stats ── */}
          <div style={{ width: 230, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Identity card */}
            <div style={{ backgroundColor: "rgba(15,23,42,0.6)", border: "1.5px solid rgba(86,164,203,0.3)", borderRadius: 8, backdropFilter: "blur(8px)", padding: "20px 18px", textAlign: "center", boxShadow: "0 0 20px rgba(86,164,203,0.1)" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: `linear-gradient(135deg, ${rank.color}33, transparent)`, border: `2px solid ${rank.color}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <span className="material-icons" style={{ fontSize: 24, color: rank.color }}>person</span>
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: rank.color, textTransform: "uppercase", marginBottom: 5 }}>{rank.label}</div>

              {editingName ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 3, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
                    <input
                      value={nameInput}
                      onChange={(e) => { setNameInput(e.target.value); setNameError(""); }}
                      maxLength={20}
                      autoFocus
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid #56a4cb", borderRadius: 6, padding: "3px 6px", color: "#f1f5f9", fontSize: 12, fontWeight: 700, width: 100, textAlign: "center", outline: "none" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveUsername(nameInput);
                        if (e.key === "Escape") { setEditingName(false); setNameError(""); }
                      }}
                    />
                    <button onClick={() => void saveUsername(nameInput)} disabled={nameSaving} style={{ background: "#56a4cb", border: "none", borderRadius: 6, padding: "3px 7px", color: "#000", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>{nameSaving ? "…" : "✓"}</button>
                    <button onClick={() => { setEditingName(false); setNameError(""); }} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, padding: "3px 7px", color: "#94a3b8", fontSize: 11, cursor: "pointer" }}>✕</button>
                  </div>
                  {nameError && <span style={{ fontSize: 9, color: "#f87171" }}>{nameError}</span>}
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 3 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9", letterSpacing: 0.5 }}>
                    {playerName || (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—")}
                  </div>
                  <button onClick={() => { setNameInput(playerName); setEditingName(true); }} title="Edit name" style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", fontSize: 12, padding: 0, lineHeight: 1 }}>✏️</button>
                </div>
              )}

              <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>
                {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "NOT CONNECTED"}
              </div>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: rank.color, textShadow: `0 0 14px ${rank.color}80` }}>
                  {playerPoints.toLocaleString()}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#475569", textTransform: "uppercase", marginTop: 3 }}>TOTAL POINTS</div>
              </div>
            </div>

            {/* G$ UBI Claim */}
            <ClaimGDollar />

            {/* Stats */}
            <div style={{ backgroundColor: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "16px 16px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#475569", textTransform: "uppercase", marginBottom: 10 }}>Match Stats</div>
              {[
                { label: "Played",      value: matchesPlayed,  color: "#94a3b8" },
                { label: "Wins",        value: matchesWon,     color: "#4ade80" },
                { label: "Losses",      value: matchesLost,    color: "#f87171" },
                { label: "Win Rate",    value: winRate(matchesWon, matchesPlayed), color: "#b9e7f4" },
                { label: "Streak",      value: winStreak > 0 ? `🔥 ${winStreak}` : winStreak, color: winStreak >= 3 ? "#f97316" : "#94a3b8" },
                { label: "Best Streak", value: maxWinStreak,   color: maxWinStreak >= 5 ? "#fbbf24" : "#94a3b8" },
                { label: "Pts Earned",  value: totalPointsAllTime > 0 ? `+${totalPointsAllTime.toLocaleString()}` : "—", color: "#fbbf24" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Col 2: Achievements ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ backgroundColor: "rgba(15,23,42,0.55)", border: "1.5px solid #b9e7f4", borderRadius: 8, backdropFilter: "blur(6px)", padding: "22px 22px 18px", boxShadow: "0 0 20px rgba(185,231,244,0.15)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, backgroundColor: "#56a4cb" }} />

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: -0.5, margin: 0 }}>Achievements</h2>
                  <p style={{ fontSize: 10, color: "#94a3b8", margin: "3px 0 0", letterSpacing: 0.5 }}>{unlockedCount} / {achievements.length} unlocked</p>
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: "#56a4cb", textTransform: "uppercase", padding: "4px 10px", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 4 }}>
                  {Math.round((unlockedCount / achievements.length) * 100)}% complete
                </div>
              </div>

              <div style={{ height: 3, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 18, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(unlockedCount / achievements.length) * 100}%`, background: "linear-gradient(90deg, #56a4cb, #b9e7f4)", borderRadius: 2, transition: "width 0.6s ease" }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {achievements.map((a) => (
                  <div key={a.id} style={{ backgroundColor: a.unlocked ? `${a.color}12` : "rgba(255,255,255,0.03)", border: `1px solid ${a.unlocked ? a.color + "50" : "rgba(255,255,255,0.06)"}`, borderRadius: 8, padding: "12px 10px", textAlign: "center", opacity: a.unlocked ? 1 : 0.45, transition: "all 0.2s", position: "relative" }}>
                    {a.unlocked && (
                      <div style={{ position: "absolute", top: 5, right: 5 }}>
                        <span className="material-icons" style={{ fontSize: 10, color: a.color }}>check_circle</span>
                      </div>
                    )}
                    <div style={{ fontSize: 22, marginBottom: 6, filter: a.unlocked ? "none" : "grayscale(1)" }}>{a.icon}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: a.unlocked ? "#f1f5f9" : "#475569", letterSpacing: 0.5, marginBottom: 3 }}>{a.name}</div>
                    <div style={{ fontSize: 8, color: "#475569", lineHeight: "11px" }}>{a.description}</div>
                  </div>
                ))}
              </div>

              {matchesPlayed === 0 && (
                <div style={{ marginTop: 16, padding: "14px", background: "rgba(86,164,203,0.06)", border: "1px solid rgba(86,164,203,0.15)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#64748b", lineHeight: "17px" }}>Play your first match to unlock achievements and start tracking your stats.</div>
                  <button onClick={() => router.push("/create")} style={{ marginTop: 8, background: "linear-gradient(135deg, #56a4cb, #b9e7f4)", border: "none", borderRadius: 6, padding: "7px 18px", color: "#000", fontSize: 11, fontWeight: 800, cursor: "pointer", letterSpacing: 1 }}>PLAY NOW</button>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16 }}>
                <div style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
                <button onClick={() => router.push("/history")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#56a4cb", letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit" }}>
                  MATCH HISTORY ({matchHistory.length})
                </button>
                <div style={{ width: 1, height: 12, backgroundColor: "#1e293b" }} />
                <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit" }}>
                  ← BACK TO MENU
                </button>
                <div style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
              </div>
            </div>
          </div>

          {/* ── Col 3: Main + Top Rival + My Cards ── */}
          <div style={{ width: 190, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {(favouriteChar || topRival) ? (
              <>
                {favouriteChar && (
                  <div style={{ backgroundColor: "rgba(15,23,42,0.6)", border: `1px solid ${favouriteChar.color}40`, borderRadius: 8, overflow: "hidden", boxShadow: `0 0 12px ${favouriteChar.color}15` }}>
                    <div style={{ height: 110, overflow: "hidden", position: "relative" }}>
                      <img src={favouriteChar.standingArt} alt={favouriteChar.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.8) 100%)" }} />
                      <div style={{ position: "absolute", top: 6, left: 8, fontSize: 8, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>MAIN</div>
                    </div>
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: favouriteChar.color, textTransform: "uppercase", letterSpacing: 0.5 }}>{favouriteChar.name}</div>
                      <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>{favouriteChar.className}</div>
                    </div>
                  </div>
                )}
                {topRival && (
                  <div style={{ backgroundColor: "rgba(15,23,42,0.6)", border: `1px solid ${topRival.color}40`, borderRadius: 8, overflow: "hidden", boxShadow: `0 0 12px ${topRival.color}15` }}>
                    <div style={{ height: 110, overflow: "hidden", position: "relative" }}>
                      <img src={topRival.standingArt} alt={topRival.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.8) 100%)" }} />
                      <div style={{ position: "absolute", top: 6, left: 8, fontSize: 8, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>TOP RIVAL</div>
                    </div>
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: topRival.color, textTransform: "uppercase", letterSpacing: 0.5 }}>{topRival.name}</div>
                      <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>{topRival.className}</div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ backgroundColor: "rgba(15,23,42,0.4)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "20px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>⚔️</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#334155", letterSpacing: 1.5, textTransform: "uppercase", lineHeight: "14px" }}>Play matches to reveal your main & rival</div>
              </div>
            )}

            {/* My Cards */}
            <div style={{ backgroundColor: "rgba(15,23,42,0.55)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "14px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#f87171", textTransform: "uppercase" }}>
                  Black Market
                </div>
                <div style={{ fontSize: 9, color: "#475569" }}>{ownedCards.length} owned</div>
              </div>

              {ownedCards.length === 0 ? (
                <div style={{ textAlign: "center", padding: "14px 0" }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>🃏</div>
                  <div style={{ fontSize: 9, color: "#334155", lineHeight: "13px" }}>No premium cards yet</div>
                  <button
                    onClick={() => router.push("/black-market")}
                    style={{ marginTop: 8, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 5, padding: "5px 12px", color: "#f87171", fontSize: 9, fontWeight: 800, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit" }}
                  >
                    VISIT MARKET
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {ownedCards.map((card) => (
                    <div key={card.id} title={card.name} style={{ width: 78, borderRadius: 6, overflow: "hidden", border: `1.5px solid ${card.color}`, position: "relative" }}>
                      <img src={card.image} alt={card.name} style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.9))", padding: "8px 4px 4px", textAlign: "center" }}>
                        <div style={{ fontSize: 7, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: 0.3, lineHeight: 1.2 }}>{card.name}</div>
                      </div>
                      <div style={{ position: "absolute", top: 3, right: 3, background: "rgba(0,0,0,0.7)", borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 8, fontWeight: 800, color: card.color }}>{card.knock}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
