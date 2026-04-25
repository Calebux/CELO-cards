"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { isMiniPay, formatAddress } from "../lib/minipay";
import { useGameStore } from "../lib/gameStore";

const DESIGN_W = 1440;
const DESIGN_H = 823;

type LeaderboardPlayer = {
  address: string;
  name?: string;
  points: number;
  wins: number;
  losses: number;
  rank: number;
};

function useCountdown() {
  const [time, setTime] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const next = new Date(now);
      const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
      next.setUTCDate(now.getUTCDate() + daysUntilMonday);
      next.setUTCHours(0, 0, 0, 0);
      const diff = Math.max(0, next.getTime() - now.getTime());
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTime({ days: d, hours: h, minutes: m, seconds: s });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "SET YOUR USERNAME",
    body: "Claim a username so rivals know who they're facing. Your name appears on the leaderboard and in matches.",
    icon: "🎮",
    color: "#56a4cb",
  },
  {
    step: "02",
    title: "ACTIVATE YOUR PASS",
    body: "Buy a Season Pass to unlock ranked play. Your pass keeps you eligible for leaderboard climbs, weekly rewards, and tournament qualification without repeated match-fee prompts.",
    icon: "🎫",
    color: "#fbbf24",
  },
  {
    step: "03",
    title: "PLAY RANKED MATCHES",
    body: "Every ranked match you win earns Points. Beat higher-ranked opponents for bonus multipliers.",
    icon: "⚔️",
    color: "#f59e0b",
  },
  {
    step: "04",
    title: "CLIMB THE BOARD",
    body: "The leaderboard resets every Monday. Your points this week determine your standing for the prize.",
    icon: "📈",
    color: "#a855f7",
  },
  {
    step: "05",
    title: "TOP PLAYER WINS",
    body: "The #1 ranked player at Monday 00:00 UTC wins the full prize pool in G$ — streamed straight to their wallet.",
    icon: "💰",
    color: "#4ade80",
  },
];

function WalletSection() {
  const { address, isConnected } = useAccount();
  const base: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10,
    border: "1.5px solid #56a4cb", borderRadius: 6, padding: "8px 18px",
    backdropFilter: "blur(10px)",
    clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)",
    boxShadow: "0 0 16px rgba(86,164,203,0.3), inset 0 0 20px rgba(86,164,203,0.07)",
  };

  if (isMiniPay() && isConnected && address) {
    return (
      <div style={{ ...base, background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(86,164,203,0.18))" }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
        <div>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: "#56a4cb", textTransform: "uppercase", lineHeight: 1 }}>CELO WALLET</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#b9e7f4", letterSpacing: 1, lineHeight: 1.5 }}>{formatAddress(address)}</div>
        </div>
      </div>
    );
  }

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
        if (!mounted) return null;
        const connected = !!(account && chain);
        return (
          <button onClick={connected ? openAccountModal : openConnectModal} style={{
            ...base, cursor: "pointer", fontFamily: "inherit",
            background: connected
              ? "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(86,164,203,0.18))"
              : "linear-gradient(135deg, rgba(34,47,66,0.95), rgba(86,164,203,0.28))",
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#4ade80" : "#56a4cb", boxShadow: `0 0 6px ${connected ? "#4ade80" : "#56a4cb"}` }} />
            <div>
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: "#56a4cb", textTransform: "uppercase", lineHeight: 1 }}>
                {connected ? "CELO WALLET" : "CONNECT"}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#b9e7f4", letterSpacing: 1, lineHeight: 1.5 }}>
                {connected ? (account.displayName ?? formatAddress(account.address)) : "SIGN IN"}
              </div>
            </div>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

export default function WeeklyChallengePage() {
  const outerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { address } = useAccount();
  const { resetMatch, setVsBot, setWager, setMatchMode } = useGameStore();

  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [rank, setRank] = useState<number | null>(null);
  const [points, setPoints] = useState<number | null>(null);

  // Username state
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameSuccess, setNameSuccess] = useState(false);

  const countdown = useCountdown();

  // Scale transform
  useEffect(() => {
    const scale = () => {
      if (!wrapRef.current || !outerRef.current) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isPortrait = vh > vw;
      if (isPortrait) {
        const s = Math.min(vw / DESIGN_H, vh / DESIGN_W);
        const tx = vw / 2 + (DESIGN_H * s) / 2;
        const ty = vh / 2 - (DESIGN_W * s) / 2;
        wrapRef.current.style.transform = `translate(${tx}px, ${ty}px) rotate(90deg) scale(${s})`;
      } else {
        const s = Math.min(vw / DESIGN_W, vh / DESIGN_H);
        const tx = (vw - DESIGN_W * s) / 2;
        const ty = (vh - DESIGN_H * s) / 2;
        wrapRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      }
    };
    scale();
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, []);

  // Fetch leaderboard
  const fetchLeaderboard = useCallback(() => {
    setIsLoading(true);
    fetch("/api/leaderboard?tab=ranked&limit=10")
      .then((r) => r.json())
      .then((data: { players: LeaderboardPlayer[] }) => {
        const list = data.players ?? [];
        setPlayers(list);
        // Fetch usernames for all displayed addresses
        const addrs = list.map((p) => p.address).join(",");
        if (addrs) {
          return fetch(`/api/username?addresses=${addrs}`)
            .then((r) => r.json())
            .then((u: { map: Record<string, string> }) => setUsernames(u.map ?? {}));
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  // Fetch current user's rank + username
  useEffect(() => {
    if (!address) return;
    const addr = address.toLowerCase();
    fetch("/api/leaderboard?tab=ranked&limit=200")
      .then((r) => r.json())
      .then((data: { players: LeaderboardPlayer[] }) => {
        const idx = data.players?.findIndex((p) => p.address.toLowerCase() === addr);
        if (idx !== -1 && idx !== undefined) {
          setRank(idx + 1);
          setPoints(data.players[idx].points);
        }
      })
      .catch(() => {});

    fetch(`/api/username?address=${addr}`)
      .then((r) => r.json())
      .then((d: { username: string | null }) => {
        if (d.username) setMyUsername(d.username);
      })
      .catch(() => {});
  }, [address]);

  // Save username
  const handleSaveName = useCallback(async () => {
    if (!address || !nameInput.trim()) return;
    setNameSaving(true);
    setNameError("");
    setNameSuccess(false);
    try {
      const res = await fetch("/api/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.toLowerCase(), username: nameInput.trim() }),
      });
      const data = await res.json() as { ok?: boolean; username?: string; error?: string };
      if (!res.ok) {
        setNameError(data.error ?? "Failed to save");
      } else {
        setMyUsername(data.username ?? nameInput.trim());
        setNameSuccess(true);
        fetchLeaderboard();
      }
    } finally {
      setNameSaving(false);
    }
  }, [address, nameInput, fetchLeaderboard]);

  function displayName(p: LeaderboardPlayer) {
    if (p.name) return p.name;
    const name = usernames[p.address.toLowerCase()];
    return name ?? `${p.address.slice(0, 6)}…${p.address.slice(-4)}`;
  }

  const prizeDisplay = "120,000 G$";
  const qualified = rank !== null && rank <= 1;

  return (
    <div ref={outerRef} style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#050505", fontFamily: "var(--font-space-grotesk), sans-serif" }}>

      {/* Background */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <video autoPlay loop muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.10 }}
          onLoadedData={(e) => {
            // Pause video on low-end devices to save performance
            const conn = (navigator as { connection?: { effectiveType?: string } }).connection;
            if (conn?.effectiveType === "2g" || conn?.effectiveType === "slow-2g") {
              (e.target as HTMLVideoElement).pause();
            }
          }}>
          <source src="/new-assets/lobby-vs-scene.webm" type="video/webm" />
        </video>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(86,164,203,0.05) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(5,5,5,0.7) 0%, rgba(5,5,5,0.4) 40%, rgba(5,5,5,0.85) 100%)" }} />
      </div>

      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left", zIndex: 1 }}>

        {/* ── Top Bar ──────────────────────────────────────────────────── */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <button onClick={() => router.back()} className="ko-btn ko-btn-secondary" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px" }}>
              <span className="material-icons ko-btn-icon" style={{ fontSize: 16, color: "rgba(255,255,255,0.9)" }}>arrow_back_ios</span>
              <span className="ko-btn-text" style={{ fontSize: 13, letterSpacing: 1.5, fontWeight: 700, color: "rgba(255,255,255,0.9)", textTransform: "uppercase" }}>Back</span>
            </button>
            <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
              <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
              <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase" }}>ACTION ORDER</span>
            </button>
          </div>

          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, padding: "6px 18px", border: "1px solid rgba(251,204,92,0.3)", borderRadius: 4, background: "rgba(251,204,92,0.07)" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", boxShadow: "0 0 8px #f59e0b", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#f59e0b", textTransform: "uppercase" }}>WEEKLY CHALLENGE · LIVE</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={() => router.push("/leaderboard")} style={{ background: "none", border: "1px solid rgba(86,164,203,0.25)", borderRadius: 4, padding: "7px 16px", cursor: "pointer", color: "#9ca3af", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "inherit" }}>
              RANKINGS
            </button>
            <WalletSection />
          </div>
        </div>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div style={{ position: "absolute", top: 84, left: 0, right: 0, height: 260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 4, color: "#56a4cb", textTransform: "uppercase" }}>SEASON 1 · ORDER ASCENSION</div>
          <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: "-3.5px", color: "white", textTransform: "uppercase", textAlign: "center", lineHeight: 1, textShadow: "0 0 40px rgba(251,204,92,0.25)" }}>
            WEEKLY CHALLENGE
          </div>
          <div style={{ fontSize: 15, color: "#9ca3af", letterSpacing: 0.5, textAlign: "center", maxWidth: 560, lineHeight: 1.6 }}>
            Earn points in ranked matches all week. The #1 player when the clock hits zero claims the entire prize pool — paid on-chain.
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 40, marginTop: 6, alignItems: "flex-start" }}>
            <div style={{ textAlign: "center", position: "relative" }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: "#6b7280", textTransform: "uppercase" }}>TOTAL BOUNTY</div>
              <div style={{ 
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center"
              }}>
                <div style={{ 
                  fontSize: 32, 
                  fontWeight: 900, 
                  color: "#4ade80", 
                  letterSpacing: -1, 
                  marginTop: 2,
                  textShadow: "0 0 20px rgba(74,222,128,0.4)",
                  animation: "prizePulse 2s ease-in-out infinite"
                }}>
                  {prizeDisplay}
                </div>
                <div style={{ 
                  background: "linear-gradient(90deg, #4ade80, #22c55e)",
                  color: "#050505",
                  fontSize: 8,
                  fontWeight: 900,
                  padding: "2px 8px",
                  borderRadius: 4,
                  marginTop: -4,
                  letterSpacing: 1.5,
                  boxShadow: "0 4px 12px rgba(74,222,128,0.3)"
                }}>
                  ACTIVE PRIZE
                </div>
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: "#6b7280", textTransform: "uppercase", marginBottom: 2 }}>WEEK ENDS IN</div>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                {[
                  { v: countdown.days, label: "D" },
                  { v: countdown.hours, label: "H" },
                  { v: countdown.minutes, label: "M" },
                  { v: countdown.seconds, label: "S" },
                ].map(({ v, label }) => (
                  <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "#f59e0b", letterSpacing: -1, lineHeight: 1, minWidth: 28, textAlign: "center" }}>
                      {String(v).padStart(2, "0")}
                    </div>
                    <div style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", letterSpacing: 1 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
            {address && points !== null && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: "#6b7280", textTransform: "uppercase" }}>YOUR POINTS</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: rank === 1 ? "#f59e0b" : "#b9e7f4", letterSpacing: 0.5, marginTop: 2 }}>
                  {points.toLocaleString()} {rank === 1 && "👑"}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Main content: leaderboard + sidebar ──────────────────────── */}
        <div style={{ position: "absolute", top: 356, left: 64, right: 52, bottom: 26, display: "flex", gap: 20, alignItems: "flex-start", overflowY: "auto", overflowX: "hidden", paddingRight: 12 }}>

          {/* Left column: Live Leaderboard + How It Works below */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Live Leaderboard */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(86,164,203,0.15)", borderRadius: 8, overflow: "hidden", maxHeight: 480, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(86,164,203,0.1)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#6b7280", textTransform: "uppercase" }}>LIVE STANDINGS — TOP 10</div>
                <div style={{ fontSize: 10, color: "#475569", letterSpacing: 1 }}>POINTS THIS WEEK</div>
              </div>
              
              <div style={{ overflowY: "auto", flex: 1 }}>
                {isLoading ? (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {[...Array(5)].map((_, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.05)", animation: "pulse 1.5s infinite" }} />
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ width: "40%", height: 12, background: "rgba(255,255,255,0.06)", borderRadius: 4, animation: "pulse 1.5s infinite" }} />
                          <div style={{ width: "25%", height: 8, background: "rgba(255,255,255,0.04)", borderRadius: 4, animation: "pulse 1.5s infinite" }} />
                        </div>
                        <div style={{ width: 40, height: 16, background: "rgba(255,255,255,0.05)", borderRadius: 4, animation: "pulse 1.5s infinite" }} />
                      </div>
                    ))}
                  </div>
                ) : players.length === 0 ? (
                  <div style={{ padding: "32px 20px", textAlign: "center", color: "#334155", fontSize: 12 }}>
                    No ranked matches yet — be the first to compete.
                  </div>
                ) : (
                  <div>
                    {players.map((p, i) => {
                    const isFirst = i === 0;
                    const isMe = address && p.address.toLowerCase() === address.toLowerCase();
                    const rankColor = i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : i === 2 ? "#cd7c3a" : "#475569";
                    return (
                      <div key={p.address} style={{
                        display: "flex", alignItems: "center", gap: 14, padding: "13px 20px",
                        background: isFirst ? "rgba(251,204,92,0.04)" : isMe ? "rgba(86,164,203,0.07)" : "transparent",
                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                      }}>
                        <div style={{ width: 28, textAlign: "center", fontSize: isFirst ? 18 : 13, fontWeight: 900, color: rankColor, flexShrink: 0 }}>
                          {i === 0 ? "👑" : `#${i + 1}`}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: isMe ? "#b9e7f4" : "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {displayName(p)}
                            {isMe && <span style={{ marginLeft: 6, fontSize: 10, color: "#4ade80", fontWeight: 800 }}>YOU</span>}
                          </div>
                          <div style={{ fontSize: 10, color: "#475569", marginTop: 1, fontFamily: "monospace" }}>
                            {p.address.slice(0, 6)}…{p.address.slice(-4)}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 16, alignItems: "center", flexShrink: 0 }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: isFirst ? "#f59e0b" : "#94a3b8" }}>{p.points.toLocaleString()}</div>
                            <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1 }}>PTS</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#4ade80" }}>{p.wins}W</div>
                            <div style={{ fontSize: 9, color: "#475569" }}>{p.losses}L</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                )}
              </div>
            </div>

            {/* ── How It Works — directly below leaderboard ────────────── */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#6b7280", textTransform: "uppercase", marginBottom: 14 }}>HOW IT WORKS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                {HOW_IT_WORKS.map((item) => (
                  <div key={item.step} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${item.color}28`, borderRadius: 8, padding: "16px 14px", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: -6, right: 10, fontSize: 48, fontWeight: 900, color: `${item.color}0d`, letterSpacing: -2, lineHeight: 1, userSelect: "none" }}>{item.step}</div>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{item.icon}</div>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: item.color, textTransform: "uppercase", marginBottom: 4 }}>{item.step} · {item.title}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>{item.body}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Sidebar: player status + username + CTA */}
          <div style={{ width: 340, display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Username card */}
            {address && (
              <div style={{ background: myUsername ? "rgba(74,222,128,0.04)" : "rgba(251,204,92,0.05)", border: `1px solid ${myUsername ? "rgba(74,222,128,0.2)" : "rgba(251,204,92,0.25)"}`, borderRadius: 8, padding: "16px 18px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#6b7280", textTransform: "uppercase", marginBottom: 10 }}>
                  {myUsername ? "YOUR USERNAME" : "SET USERNAME"}
                </div>
                {myUsername ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#4ade80", letterSpacing: 0.5 }}>@{myUsername}</div>
                    <button onClick={() => { setMyUsername(null); setNameInput(""); setNameSuccess(false); }}
                      style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 10, color: "#475569", letterSpacing: 1 }}>
                      CHANGE
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10, lineHeight: 1.5 }}>
                      Claim a unique username to appear on the leaderboard.
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={nameInput}
                        onChange={(e) => { setNameInput(e.target.value); setNameError(""); setNameSuccess(false); }}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleSaveName(); }}
                        placeholder="eg. ShadowFist99"
                        maxLength={20}
                        style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 5, padding: "8px 12px", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit", outline: "none" }}
                      />
                      <button onClick={() => void handleSaveName()} disabled={nameSaving || !nameInput.trim()}
                        style={{ background: "linear-gradient(135deg, #1a4a2a, #0f2a18)", border: "1.5px solid #4ade80", borderRadius: 5, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 12, color: "#4ade80", letterSpacing: 1.5, opacity: nameSaving ? 0.6 : 1 }}>
                        {nameSaving ? "…" : "SAVE"}
                      </button>
                    </div>
                    {nameError && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{nameError}</div>}
                    {nameSuccess && <div style={{ fontSize: 11, color: "#4ade80", marginTop: 6 }}>✓ Username saved!</div>}
                  </div>
                )}
              </div>
            )}

            {/* Status card */}
            <div style={{ background: address ? (qualified ? "rgba(251,204,92,0.06)" : "rgba(86,164,203,0.04)") : "rgba(255,255,255,0.02)", border: `1px solid ${address ? (qualified ? "rgba(251,204,92,0.3)" : "rgba(86,164,203,0.2)") : "rgba(255,255,255,0.07)"}`, borderRadius: 8, padding: "16px 18px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#6b7280", textTransform: "uppercase", marginBottom: 10 }}>YOUR STATUS</div>
              {!address ? (
                <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6 }}>
                  Connect your wallet to see your ranking and compete for the prize pool.
                </div>
              ) : rank === null ? (
                <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6 }}>
                  You haven&apos;t played any ranked matches yet. Every win earns you points.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Rank</span>
                    <span style={{ fontSize: 22, fontWeight: 900, color: rank === 1 ? "#f59e0b" : rank <= 3 ? "#94a3b8" : "#b9e7f4", letterSpacing: -1 }}>#{rank}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Points</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#b9e7f4" }}>{points?.toLocaleString()}</span>
                  </div>
                  <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "4px 0" }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: rank === 1 ? "#f59e0b" : "#56a4cb", letterSpacing: 0.3 }}>
                    {rank === 1
                      ? "👑 YOU ARE LEADING — keep playing to hold your spot!"
                      : `${rank - 1} player${rank - 1 > 1 ? "s" : ""} ahead — play ranked to overtake them.`}
                  </div>
                </div>
              )}
            </div>

            {/* CTA buttons */}
            <button
              onClick={() => {
                resetMatch();
                setVsBot(false);
                setMatchMode("ranked");
                setWager(false, null, "cusd");
                router.push("/select-character");
              }}
              style={{ width: "100%", height: 52, background: "linear-gradient(135deg, #1a3a52, #0f2233)", border: "1.5px solid #56a4cb", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 15, letterSpacing: 2.5, color: "#b9e7f4", textTransform: "uppercase", clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)", boxShadow: "0 0 20px rgba(86,164,203,0.2)" }}>
              PLAY RANKED NOW ▸
            </button>
            <button
              onClick={() => router.push("/leaderboard")}
              style={{ width: "100%", height: 44, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13, letterSpacing: 2, color: "#6b7280", textTransform: "uppercase" }}>
              FULL LEADERBOARD
            </button>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes prizePulse {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.05); filter: brightness(1.2) drop-shadow(0 0 10px rgba(74,222,128,0.6)); }
        }
      `}</style>
    </div>
  );
}
