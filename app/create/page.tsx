"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "../lib/gameStore";
import { WalletSection } from "../components/WalletSection";
import { WagerModal } from "../components/WagerModal";
import { useAccount } from "wagmi";

type QueueState =
  | { status: "idle" }
  | { status: "searching"; queueId: string; elapsedMs: number }
  | { status: "found"; matchId: string; role: "host" | "joiner" };

const DESIGN_W = 1440;
const DESIGN_H = 823;

type MatchType = "wager" | "ranked" | "tourney" | "vshouse";

const MATCH_TYPES: {
  key: MatchType;
  icon: string;
  label: string;
  sub: string;
  desc: string;
  color: string;
  badge?: string;
}[] = [
  {
    key: "wager",
    icon: "toll",
    label: "WAGER",
    sub: "Stake",
    desc: "Both players stake tokens. Winner claims 90% of the combined pot.",
    color: "#fbbf24",
    badge: "NEW",
  },
  {
    key: "ranked",
    icon: "military_tech",
    label: "RANKED",
    sub: "Earn Points",
    desc: "Climb the leaderboard. Qualify for the weekly tournament.",
    color: "#f59e0b",
    badge: "POPULAR",
  },
  {
    key: "tourney",
    icon: "emoji_events",
    label: "TOURNEY",
    sub: "Bracketed",
    desc: "Tournament play. Only available to qualified top-16 players.",
    color: "#a855f7",
  },
  {
    key: "vshouse",
    icon: "smart_toy",
    label: "VS HOUSE",
    sub: "Play AI",
    desc: "Challenge the house AI. No wait time — jump straight in and sharpen your skills.",
    color: "#00C58E",
    badge: "INSTANT",
  },
];

export default function CreateMatch() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [matchType, setMatchType] = useState<MatchType>("wager");
  const [showWager, setShowWager] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [queueState, setQueueState] = useState<QueueState>({ status: "idle" });
  const queuePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();
  const resetMatch = useGameStore((s) => s.resetMatch);
  const setPlayerRole = useGameStore((s) => s.setPlayerRole);
  const setMatchId = useGameStore((s) => s.setMatchId);
  const setWager = useGameStore((s) => s.setWager);
  const setVsBot = useGameStore((s) => s.setVsBot);
  const aiDifficulty = useGameStore((s) => s.aiDifficulty);
  const setAiDifficulty = useGameStore((s) => s.setAiDifficulty);
  const { address } = useAccount();

  useEffect(() => {
    const fetchOnline = () => {
      fetch("/api/online").then((r) => r.json()).then((d: { online: number }) => setOnlineCount(d.online)).catch(() => {});
    };
    fetchOnline();
    const id = setInterval(fetchOnline, 15_000);
    return () => clearInterval(id);
  }, []);

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

  // Tick elapsed time while searching
  useEffect(() => {
    if (queueState.status !== "searching") return;
    const id = setInterval(() => {
      setQueueState((prev) =>
        prev.status === "searching"
          ? { ...prev, elapsedMs: prev.elapsedMs + 1000 }
          : prev
      );
    }, 1000);
    return () => clearInterval(id);
  }, [queueState.status]);

  const cancelQueue = useCallback(async () => {
    if (queueState.status !== "searching") return;
    if (queuePollRef.current) clearInterval(queuePollRef.current);
    await fetch(`/api/queue?id=${queueState.queueId}`, { method: "DELETE" }).catch(() => {});
    setQueueState({ status: "idle" });
  }, [queueState]);

  const handleFindMatch = async () => {
    if (!address) return;
    resetMatch();
    setVsBot(false);
    setPlayerRole("host");
    setWager(false, null);

    const res = await fetch("/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const data = await res.json() as { matched: boolean; matchId?: string; role?: "host" | "joiner"; queueId?: string };

    if (data.matched && data.matchId && data.role) {
      // Immediate match found
      setMatchId(data.matchId);
      setPlayerRole(data.role);
      setQueueState({ status: "found", matchId: data.matchId, role: data.role });
      setTimeout(() => router.push("/select-character"), 800);
      return;
    }

    if (!data.queueId) return;
    setQueueState({ status: "searching", queueId: data.queueId, elapsedMs: 0 });

    // Poll every 2s for a match
    queuePollRef.current = setInterval(async () => {
      try {
        const pollRes = await fetch(`/api/queue?id=${data.queueId}`);
        const pollData = await pollRes.json() as { matched: boolean; matchId?: string; role?: "host" | "joiner"; expired?: boolean };

        if (pollData.expired) {
          clearInterval(queuePollRef.current!);
          setQueueState({ status: "idle" });
          return;
        }

        if (pollData.matched && pollData.matchId && pollData.role) {
          clearInterval(queuePollRef.current!);
          setMatchId(pollData.matchId);
          setPlayerRole(pollData.role);
          setQueueState({ status: "found", matchId: pollData.matchId, role: pollData.role });
          setTimeout(() => router.push("/select-character"), 800);
        }
      } catch {
        // ignore transient errors
      }
    }, 2000);
  };

  const handleCreateMatch = () => {
    if (!address) return;
    resetMatch();
    if (matchType === "vshouse") {
      setVsBot(true);
      setPlayerRole(null);
      router.push("/select-character");
      return;
    }
    setVsBot(false);
    setPlayerRole("host");
    if (matchType === "wager") {
      setShowWager(true); // wager match — prompt for token stake
    } else {
      setWager(false, null);
      router.push("/ready");
    }
  };

  const selected = MATCH_TYPES.find((m) => m.key === matchType)!;

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#050505", fontFamily: "var(--font-space-grotesk), sans-serif" }}>

      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left" }}>

        {/* Background */}
        <img src="/new addition/gameplay landing page.webp" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.35, pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(5,5,5,0.85) 0%, rgba(5,8,18,0.75) 50%, rgba(5,5,5,0.85) 100%)", pointerEvents: "none" }} />

        {/* ── Top Bar ──────────────────────────────────────────────────── */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
            <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase" }}>ACTION ORDER</span>
          </button>

          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, padding: "5px 16px", border: "1px solid rgba(86,164,203,0.2)", borderRadius: 4, background: "rgba(86,164,203,0.06)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#9ca3af", textTransform: "uppercase" }}>CREATE MATCH</span>
          </div>

          <WalletSection />
        </div>

        {/* ── Main Layout ───────────────────────────────────────────────── */}
        <div style={{ position: "absolute", top: 68, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>

          {/* Panel */}
          <div style={{ position: "relative", width: 560 }}>

            {/* Corner accents */}
            {[
              { top: -12, left: -12, borderLeft: "1.5px solid #56a4cb", borderTop: "1.5px solid #56a4cb" },
              { top: -12, right: -12, borderRight: "1.5px solid #56a4cb", borderTop: "1.5px solid #56a4cb" },
              { bottom: -12, left: -12, borderLeft: "1.5px solid #56a4cb", borderBottom: "1.5px solid #56a4cb" },
              { bottom: -12, right: -12, borderRight: "1.5px solid #56a4cb", borderBottom: "1.5px solid #56a4cb" },
            ].map((s, i) => (
              <div key={i} style={{ position: "absolute", width: 36, height: 36, ...s }} />
            ))}

            {/* Glass panel */}
            <div style={{ background: "rgba(10,15,28,0.85)", border: "1.5px solid rgba(86,164,203,0.35)", borderRadius: 8, backdropFilter: "blur(12px)", overflow: "hidden", boxShadow: "0 0 40px rgba(86,164,203,0.1)" }}>

              {/* Scanline */}
              <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #56a4cb, transparent)" }} />

              <div style={{ padding: "36px 40px 40px" }}>

                {/* Heading */}
                <div style={{ textAlign: "center", marginBottom: 32 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 4, color: "#56a4cb", textTransform: "uppercase", marginBottom: 8 }}>MATCH SETUP</div>
                  <h2 style={{ fontSize: 30, fontWeight: 900, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: -1, margin: 0, lineHeight: 1 }}>
                    SELECT MATCH TYPE
                  </h2>
                </div>

                {/* Match type cards */}
                <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                  {MATCH_TYPES.map((mt) => {
                    const active = matchType === mt.key;
                    return (
                      <div key={mt.key} style={{ flex: 1, position: "relative" }}>
                        {mt.badge && (
                          <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: mt.color, borderRadius: 3, padding: "2px 8px", zIndex: 2 }}>
                            <span style={{ fontSize: 7.5, fontWeight: 800, color: "#000", letterSpacing: 1, textTransform: "uppercase" }}>{mt.badge}</span>
                          </div>
                        )}
                        <button
                          onClick={() => setMatchType(mt.key)}
                          style={{
                            width: "100%", padding: "20px 12px 16px",
                            background: active ? `${mt.color}1e` : "rgba(255,255,255,0.03)",
                            border: active ? `1.5px solid ${mt.color}` : "1.5px solid rgba(255,255,255,0.08)",
                            borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                            textAlign: "center",
                            transition: "all 0.18s ease",
                            boxShadow: active ? `0 0 20px ${mt.color}25` : "none",
                          }}
                        >
                          <span className="material-icons" style={{ fontSize: 28, color: active ? mt.color : "#6b7280", display: "block", marginBottom: 8 }}>{mt.icon}</span>
                          <div style={{ fontSize: 13, fontWeight: 800, color: active ? "#f1f5f9" : "#9ca3af", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>{mt.label}</div>
                          <div style={{ fontSize: 9, color: active ? mt.color : "#6b7280", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>{mt.sub}</div>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Description of selected type */}
                <div style={{ marginBottom: matchType === "vshouse" ? 16 : 28, padding: "12px 16px", background: `rgba(${selected.color === "#56a4cb" ? "86,164,203" : selected.color === "#f59e0b" ? "245,158,11" : "168,85,247"},0.06)`, border: `1px solid ${selected.color}30`, borderRadius: 6 }}>
                  <p style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>{selected.desc}</p>
                </div>

                {/* Difficulty selector — VS House only */}
                {matchType === "vshouse" && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: "#6b7280", textTransform: "uppercase", marginBottom: 10 }}>AI Difficulty</div>
                    <div style={{ display: "flex", gap: 10 }}>
                      {([
                        { level: 0 as const, label: "EASY",   sub: "Random orders",     color: "#4ade80" },
                        { level: 1 as const, label: "NORMAL", sub: "Adaptive AI",        color: "#f59e0b" },
                        { level: 2 as const, label: "HARD",   sub: "Counter-picks you",  color: "#f87171" },
                      ] as const).map(({ level, label, sub, color }) => {
                        const active = aiDifficulty === level;
                        return (
                          <button
                            key={level}
                            onClick={() => setAiDifficulty(level)}
                            style={{
                              flex: 1, padding: "10px 8px",
                              background: active ? `${color}18` : "rgba(255,255,255,0.03)",
                              border: `1.5px solid ${active ? color : "rgba(255,255,255,0.08)"}`,
                              borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                              transition: "all 0.15s",
                              boxShadow: active ? `0 0 12px ${color}25` : "none",
                            }}
                          >
                            <div style={{ fontSize: 11, fontWeight: 800, color: active ? color : "#6b7280", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                            <div style={{ fontSize: 9, color: active ? `${color}cc` : "#475569", letterSpacing: 0.3 }}>{sub}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Searching state */}
                {queueState.status === "searching" && (
                  <div style={{ marginBottom: 12, padding: "16px 20px", background: "rgba(86,164,203,0.06)", border: "1.5px solid rgba(86,164,203,0.35)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#56a4cb", boxShadow: "0 0 6px #56a4cb", animation: "pulse 1s ease-in-out infinite" }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#b9e7f4", letterSpacing: 2, textTransform: "uppercase" }}>Finding Opponent…</span>
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>
                        {Math.floor(queueState.elapsedMs / 60000)}:{String(Math.floor((queueState.elapsedMs % 60000) / 1000)).padStart(2, "0")}
                      </span>
                    </div>
                    <button
                      onClick={() => void cancelQueue()}
                      style={{ width: "100%", height: 36, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 5, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: "#f87171", letterSpacing: 2, textTransform: "uppercase" }}
                    >
                      CANCEL
                    </button>
                  </div>
                )}

                {/* Found state */}
                {queueState.status === "found" && (
                  <div style={{ marginBottom: 12, padding: "16px 20px", background: "rgba(74,222,128,0.08)", border: "1.5px solid rgba(74,222,128,0.4)", borderRadius: 8, textAlign: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#4ade80", letterSpacing: 2, textTransform: "uppercase" }}>✓ Opponent Found — Entering Match</span>
                  </div>
                )}

                {/* Create/Find Match button */}
                {queueState.status === "idle" && (
                  !address ? (
                    <button
                      disabled
                      style={{
                        width: "100%", height: 56,
                        background: "rgba(255,255,255,0.03)",
                        border: "1.5px solid rgba(255,255,255,0.1)",
                        borderRadius: 6,
                        cursor: "not-allowed",
                        fontFamily: "inherit",
                        fontWeight: 900, fontSize: 16, letterSpacing: 3,
                        color: "#475569",
                        textTransform: "uppercase",
                        clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                        opacity: 0.6,
                      }}
                    >
                      <span className="material-icons" style={{ fontSize: 20, color: "#475569" }}>lock</span>
                      CONNECT WALLET TO PLAY
                    </button>
                  ) : matchType === "ranked" ? (
                    <div style={{ display: "flex", gap: 12 }}>
                      <button
                        onClick={() => void handleFindMatch()}
                        style={{
                          flex: 1, height: 56,
                          background: "linear-gradient(135deg, #1a3a52, #0f2233)",
                          border: `1.5px solid ${selected.color}`,
                          borderRadius: 6,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontWeight: 900, fontSize: 16, letterSpacing: 1.5,
                          color: "#b9e7f4",
                          textTransform: "uppercase",
                          clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
                          boxShadow: `0 0 24px ${selected.color}30`,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                          transition: "all 0.2s ease"
                        }}
                      >
                        <span className="material-icons" style={{ fontSize: 20, color: selected.color }}>manage_search</span>
                        FIND PLAYER
                      </button>
                      
                      <button
                        onClick={handleCreateMatch}
                        style={{
                          flex: 1, height: 56,
                          background: "rgba(255,255,255,0.03)",
                          border: `1.5px solid rgba(86,164,203,0.4)`,
                          borderRadius: 6,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontWeight: 900, fontSize: 16, letterSpacing: 1.5,
                          color: "#56a4cb",
                          textTransform: "uppercase",
                          clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                          transition: "all 0.2s ease"
                        }}
                      >
                        <span className="material-icons" style={{ fontSize: 20, color: "#56a4cb" }}>group</span>
                        WITH FRIEND
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleCreateMatch}
                      style={{
                        width: "100%", height: 56,
                        background: "linear-gradient(135deg, #1a3a52, #0f2233)",
                        border: `1.5px solid ${selected.color}`,
                        borderRadius: 6,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontWeight: 900, fontSize: 16, letterSpacing: 3,
                        color: "#b9e7f4",
                        textTransform: "uppercase",
                        clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
                        boxShadow: `0 0 24px ${selected.color}30`,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                        transition: "all 0.2s ease"
                      }}
                    >
                      <span className="material-icons" style={{ fontSize: 20, color: selected.color }}>radar</span>
                      CREATE MATCH
                      <span className="material-icons" style={{ fontSize: 20, color: selected.color }}>arrow_forward_ios</span>
                    </button>
                  )
                )}

                <p style={{ fontSize: 10, color: address ? "#475569" : "#56a4cb", textAlign: "center", marginTop: 15, letterSpacing: 1, textTransform: "uppercase" }}>
                  {address
                    ? matchType === "ranked"
                      ? "Find a random player or invite a friend via Match ID"
                      : "Secure connection via Celo network"
                    : "Use the Connect button in the top right ↗"}
                </p>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <div style={{ flex: 1, textAlign: "center", padding: "10px 0", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(86,164,203,0.15)", borderRadius: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 3 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 5px #4ade80", animation: "pulse 2s ease-in-out infinite" }} />
                  <div style={{ fontSize: 8.5, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Playing Now</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#4ade80", letterSpacing: -0.5 }}>
                  {onlineCount !== null ? onlineCount.toLocaleString() : "—"}
                </div>
              </div>
              <div style={{ flex: 1, textAlign: "center", padding: "10px 0", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(86,164,203,0.15)", borderRadius: 6 }}>
                <div style={{ fontSize: 8.5, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>House Bots</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#b9e7f4", letterSpacing: -0.5 }}>Always On</div>
              </div>
              <div style={{ flex: 1, textAlign: "center", padding: "10px 0", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(86,164,203,0.15)", borderRadius: 6 }}>
                <div style={{ fontSize: 8.5, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>VS House</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#00C58E", letterSpacing: -0.5 }}>Instant</div>
              </div>
            </div>
            <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
          </div>
        </div>

      </div>

      {showWager && (
        <WagerModal
          onConfirmed={() => { setShowWager(false); router.push("/ready"); }}
          onSkip={() => { setWager(false, null); setShowWager(false); router.push("/ready"); }}
        />
      )}
    </div>
  );
}
