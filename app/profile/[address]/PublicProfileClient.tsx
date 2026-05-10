"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DESIGN_W, DESIGN_H } from "../../lib/designConstants";

const BG_IMAGE = "/new addition/gameplay landing page.webp";

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
  return `${Math.round((won / played) * 100)}%`;
}

type LeaderboardEntry = {
  address: string;
  playerName?: string;
  wins: number;
  losses: number;
  points: number;
  rank?: number;
};

type AchievementId = "first_blood" | "warrior" | "veteran" | "on_fire" | "unstoppable" | "centurion" | "legend" | "iron_will";

const ACHIEVEMENT_META: Record<AchievementId, { icon: string; name: string; description: string; color: string }> = {
  first_blood: { icon: "🩸", name: "First Blood", description: "Win 1 match", color: "#f87171" },
  warrior:     { icon: "⚔️", name: "Warrior", description: "Win 5 matches", color: "#fb923c" },
  veteran:     { icon: "🎖️", name: "Veteran", description: "Play 10 matches", color: "#60a5fa" },
  on_fire:     { icon: "🔥", name: "On Fire", description: "3-win streak", color: "#f97316" },
  unstoppable: { icon: "⚡", name: "Unstoppable", description: "5-win streak", color: "#fbbf24" },
  centurion:   { icon: "💎", name: "Centurion", description: "1,000 points", color: "#b9e7f4" },
  legend:      { icon: "👑", name: "Legend", description: "5,000 points", color: "#FFD700" },
  iron_will:   { icon: "🛡️", name: "Iron Will", description: "Win after 3+ losses", color: "#94a3b8" },
};

type Props = { address: string };

export default function PublicProfileClient({ address }: Props) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);

  const [entry, setEntry] = useState<LeaderboardEntry | null>(null);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  const [streak, setStreak] = useState<{ count: number; longestStreak: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(address);
  const shortAddr = isValidAddress ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;

  // Scale to viewport
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const sx = window.innerWidth / DESIGN_W;
      const sy = window.innerHeight / DESIGN_H;
      const s = Math.min(sx, sy);
      el.style.transform = `scale(${s})`;
      el.style.transformOrigin = "top left";
      el.style.width = `${DESIGN_W}px`;
      el.style.height = `${DESIGN_H}px`;
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!isValidAddress) { setLoading(false); setNotFound(true); return; }
    const addr = address.toLowerCase();

    const loadData = async () => {
      setLoading(true);
      try {
        const [lbRes, achRes, strRes] = await Promise.all([
          fetch(`/api/leaderboard?tab=casual&limit=200`),
          fetch(`/api/achievements?address=${addr}`),
          fetch(`/api/streak?address=${addr}`),
        ]);

        if (lbRes.ok) {
          const { players } = await lbRes.json() as { players: LeaderboardEntry[] };
          const found = players.find(p => p.address.toLowerCase() === addr);
          if (found) setEntry(found); else setNotFound(true);
        } else {
          setNotFound(true);
        }

        if (achRes.ok) {
          const { unlockedIds } = await achRes.json() as { unlockedIds: string[] };
          setUnlockedAchievements(unlockedIds);
        }

        if (strRes.ok) {
          const s = await strRes.json() as { count: number; longestStreak: number };
          setStreak(s);
        }
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [address, isValidAddress]);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const copyLink = () => {
    void navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const rank = entry ? getRank(entry.points) : { label: "UNRANKED", color: "#475569" };
  const displayName = entry?.playerName ?? shortAddr;
  const wins = entry?.wins ?? 0;
  const losses = entry?.losses ?? 0;
  const played = wins + losses;

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#000" }}>
      <div ref={wrapRef}>
        {/* Background */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${BG_IMAGE})`, backgroundSize: "cover", backgroundPosition: "center", filter: "brightness(0.25)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,rgba(86,164,203,0.06) 0%,transparent 60%)" }} />

        {/* Nav */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", borderBottom: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(10px)", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={() => router.push("/")} style={{ background: "none", border: "none", color: "#56a4cb", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>← Home</button>
            <div style={{ fontSize: 11, fontWeight: 900, color: "#e2e8f0", letterSpacing: 2 }}>PLAYER PROFILE</div>
          </div>
          <button onClick={copyLink} style={{ padding: "6px 14px", borderRadius: 6, cursor: "pointer", background: "rgba(86,164,203,0.1)", border: "1px solid rgba(86,164,203,0.3)", fontSize: 9, fontWeight: 700, color: "#56a4cb", fontFamily: "inherit", letterSpacing: 1 }}>
            {copied ? "Link Copied!" : "🔗 Share Profile"}
          </button>
        </div>

        {/* Content */}
        <div style={{ position: "absolute", top: 64, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 32px", overflowY: "auto" }}>
          {loading && (
            <div style={{ color: "#6b7280", fontSize: 13, marginTop: 80 }}>Loading profile...</div>
          )}

          {!loading && notFound && (
            <div style={{ textAlign: "center", marginTop: 80 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>❓</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8" }}>Player not found</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>This address hasn&apos;t played yet.</div>
            </div>
          )}

          {!loading && !notFound && entry && (
            <div style={{ width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Identity card */}
              <div style={{ backgroundColor: "rgba(15,23,42,0.7)", border: `1.5px solid ${rank.color}33`, borderRadius: 12, padding: "28px 28px", textAlign: "center", boxShadow: `0 0 24px ${rank.color}18`, position: "relative" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${rank.color}, transparent)`, borderRadius: "12px 12px 0 0" }} />
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: `linear-gradient(135deg, ${rank.color}33, transparent)`, border: `2px solid ${rank.color}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <span className="material-icons" style={{ fontSize: 30, color: rank.color }}>person</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#e2e8f0", marginBottom: 4 }}>{displayName}</div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: rank.color, textTransform: "uppercase", marginBottom: 10 }}>{rank.label}</div>
                <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>{address}</div>

                {entry.rank && (
                  <div style={{ display: "inline-block", marginTop: 12, padding: "4px 14px", background: "rgba(86,164,203,0.1)", border: "1px solid rgba(86,164,203,0.25)", borderRadius: 20 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#56a4cb" }}>#{entry.rank} on Leaderboard</span>
                  </div>
                )}
              </div>

              {/* Stats grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {[
                  { label: "Points", value: entry.points.toLocaleString(), color: rank.color },
                  { label: "Wins", value: wins, color: "#4ade80" },
                  { label: "Win Rate", value: winRate(wins, played), color: "#b9e7f4" },
                  { label: "Streak", value: streak ? `🔥 ${streak.count}d` : "—", color: "#f97316" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "14px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color }}>{value}</div>
                    <div style={{ fontSize: 8, color: "#475569", marginTop: 3, textTransform: "uppercase", letterSpacing: 1.5 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Achievements */}
              {unlockedAchievements.length > 0 && (
                <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "18px 18px" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#475569", textTransform: "uppercase", marginBottom: 12 }}>Achievements</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {unlockedAchievements.map(id => {
                      const meta = ACHIEVEMENT_META[id as AchievementId];
                      if (!meta) return null;
                      return (
                        <div key={id} title={meta.description} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", background: `${meta.color}15`, border: `1px solid ${meta.color}40`, borderRadius: 20 }}>
                          <span style={{ fontSize: 13 }}>{meta.icon}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: meta.color }}>{meta.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CTA */}
              <div style={{ textAlign: "center" }}>
                <button onClick={() => router.push("/")} style={{ padding: "10px 28px", borderRadius: 8, cursor: "pointer", background: "rgba(86,164,203,0.15)", border: "1px solid rgba(86,164,203,0.4)", fontSize: 11, fontWeight: 800, color: "#b9e7f4", letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "inherit" }}>
                  Play Action Order →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
