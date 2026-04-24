"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGameStore } from "../lib/gameStore";
import { WalletSection } from "../components/WalletSection";
import { useAccount } from "wagmi";

const BG_IMAGE = "/new addition/gameplay landing page.webp";

const DESIGN_W = 1440;
const DESIGN_H = 823;

type LiveMatch = { id: string; hostName: string | null; createdAt: number; hasWager: boolean };

function JoinMatchContent() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const resetMatch = useGameStore((s) => s.resetMatch);
  const setMatchId = useGameStore((s) => s.setMatchId);
  const setPlayerRole = useGameStore((s) => s.setPlayerRole);

  const { address } = useAccount();
  const searchParams = useSearchParams();
  const [code, setCode] = useState(() => searchParams.get("id") ?? "");
  const [error, setError] = useState("");
  const [joining] = useState(false);
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);
  const [loadingLive, setLoadingLive] = useState(true);

  // Fetch live matches and refresh every 5s
  useEffect(() => {
    const fetchLive = () => {
      fetch("/api/matches/live")
        .then(r => r.json())
        .then((d: { matches: LiveMatch[] }) => setLiveMatches(d.matches ?? []))
        .catch(() => {})
        .finally(() => setLoadingLive(false));
    };
    fetchLive();
    const id = setInterval(fetchLive, 5000);
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

  const handleJoin = async () => {
    if (!address) return;
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Paste a match link or code first.");
      return;
    }

    let matchCode = trimmed;
    try {
      const url = new URL(trimmed);
      const id = url.searchParams.get("id");
      if (id) matchCode = id;
    } catch {
      // not a URL — treat as bare code
    }

    if (!matchCode) {
      setError("Invalid match link.");
      return;
    }

    resetMatch();
    setMatchId(matchCode);
    setPlayerRole("joiner");
    // Payment happens in the lobby after both players have found each other
    router.push("/select-character");
  };

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left" }}>

        {/* Background */}
        <img src={BG_IMAGE} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />

        {/* ── Top Bar ── */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
            <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase", fontFamily: "var(--font-space-grotesk), sans-serif" }}>ACTION ORDER</span>
          </button>
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#9ca3af", textTransform: "uppercase" }}>JOIN MATCH</div>
          <WalletSection />
        </div>

        {/* Live matches sidebar */}
        <div style={{
          position: "absolute", right: 64, top: 84, bottom: 20,
          width: 320,
          display: "flex", flexDirection: "column",
          background: "linear-gradient(135deg, rgba(15,12,5,0.94), rgba(40,28,5,0.9))",
          border: "1px solid rgba(251,204,92,0.25)",
          borderRadius: 10,
          padding: "16px 14px",
          backdropFilter: "blur(14px)",
          boxShadow: "0 0 40px rgba(0,0,0,0.6)",
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "#fbbf24", textTransform: "uppercase", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80", animation: "pulse 2s infinite" }} />
            OPEN MATCHES
          </div>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {loadingLive ? (
              [...Array(3)].map((_, i) => (
                <div key={i} style={{ height: 60, borderRadius: 8, background: "rgba(251,204,92,0.04)", border: "1px solid rgba(251,204,92,0.12)", animation: "pulse 1.5s infinite" }} />
              ))
            ) : liveMatches.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center", color: "#6b5d2f", fontSize: 12, border: "1px dashed rgba(251,204,92,0.15)", borderRadius: 8 }}>
                No open matches right now.<br />Be the first to create one!
              </div>
            ) : liveMatches.map((m) => (
              <button
                key={m.id}
                onClick={() => { setCode(m.id); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px",
                  background: code === m.id ? "rgba(251,204,92,0.1)" : "rgba(251,204,92,0.04)",
                  border: `1px solid ${code === m.id ? "rgba(251,204,92,0.7)" : "rgba(251,204,92,0.2)"}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  transition: "all 0.15s",
                  boxShadow: code === m.id ? "0 0 14px rgba(251,204,92,0.2)" : "none",
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, rgba(251,204,92,0.25), rgba(251,204,92,0.08))", border: "1px solid rgba(251,204,92,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 16 }}>⚔️</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.hostName ?? "Anonymous"}
                  </div>
                  <div style={{ fontSize: 10, color: "#a08040", marginTop: 2, letterSpacing: 0.5 }}>
                    {m.id} {m.hasWager && <span style={{ color: "#fbbf24", marginLeft: 4 }}>⚡ Ranked</span>}
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#fbbf24", letterSpacing: 1.5, textTransform: "uppercase", flexShrink: 0 }}>JOIN →</span>
              </button>
            ))}
          </div>
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
        </div>

        {/* Central panel */}
        <div style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%, -44%)",
          width: 504,
        }}>
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
            backgroundColor: "rgba(15, 23, 42, 0.4)",
            border: "2.4px solid #b9e7f4", borderRadius: 6,
            backdropFilter: "blur(4.5px)", padding: "48px 48px 40px",
            position: "relative", overflow: "hidden",
            boxShadow: "0 0 20px rgba(185, 231, 244, 0.25)",
          }}>
            {/* Scanline */}
            <div style={{ position: "absolute", top: -2, left: -2, right: -2, height: 1.5, backgroundColor: "#56a4cb" }} />

            {/* Heading */}
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <h2 style={{ fontSize: 30, fontWeight: 700, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: -0.75, margin: 0, lineHeight: "36px" }}>
                Join Match
              </h2>
              <p style={{ fontSize: 14, color: "#94a3b8", margin: "8px 0 0", lineHeight: "20px" }}>
                Paste the match link or code sent by your opponent
              </p>
            </div>

            {/* Input */}
            <div style={{ position: "relative", marginBottom: 12 }}>
              <div style={{
                backgroundColor: "rgba(17, 10, 24, 0.5)",
                border: `1px solid ${error ? "#ef4444" : "#334155"}`,
                borderRadius: 8, padding: "16px 20px",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <span className="material-icons" style={{ color: "#56a4cb", fontSize: 18 }}>link</span>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && void handleJoin()}
                  placeholder="https://…/join?id=AO-XXXX  or  AO-XXXX"
                  style={{
                    background: "none", border: "none", outline: "none",
                    color: "#fff", fontSize: 13, width: "100%",
                    fontFamily: "inherit", letterSpacing: 0.5,
                  }}
                />
              </div>
              {error && (
                <p style={{ fontSize: 11, color: "#ef4444", marginTop: 6, letterSpacing: 0.5 }}>{error}</p>
              )}
            </div>

            {/* Info hint */}
            <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 28, letterSpacing: 0.3 }}>
              Your opponent shares this from the Ready screen after creating a match.
            </p>

            {/* Join button */}
            <button
              onClick={() => void handleJoin()}
              disabled={joining || !address}
              className="ko-btn ko-btn-primary"
              style={{ width: "100%", padding: "15px 0", opacity: address ? 1 : 0.55, cursor: address ? "pointer" : "not-allowed" }}
            >
              <span className="material-icons ko-btn-icon" style={{ fontSize: 18 }}>{address ? "sports_kabaddi" : "lock"}</span>
              <span className="ko-btn-text" style={{ fontSize: 15, fontWeight: 700, textTransform: "uppercase", letterSpacing: 6, color: "#fff" }}>
                {address ? "Enter Arena" : "Connect Wallet"}
              </span>
              {address && <span className="material-icons ko-btn-icon" style={{ fontSize: 18 }}>arrow_forward_ios</span>}
            </button>
            {!address && (
              <p style={{ fontSize: 10, color: "#56a4cb", textAlign: "center", marginTop: 8, letterSpacing: 1, textTransform: "uppercase" }}>
                Use the Connect button in the top right ↗
              </p>
            )}

            {/* Divider + back */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 28 }}>
              <div style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
              <button
                onClick={() => router.push("/")}
                className="ko-btn ko-btn-secondary"
                style={{ padding: "8px 16px" }}
              >
                <span className="material-icons ko-btn-icon" style={{ fontSize: 16, color: "rgba(255,255,255,0.9)" }}>arrow_back_ios</span>
                <span className="ko-btn-text" style={{ fontSize: 13, letterSpacing: 1.5, fontWeight: 700, color: "rgba(255,255,255,0.9)", textTransform: "uppercase" }}>Back</span>
              </button>
              <div style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
            </div>
          </div>

          {/* Footer status */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: "#475569", letterSpacing: 1.5, textTransform: "uppercase" }}>ACTION ORDER — CELO MAINNET</span>
          </div>
        </div>

      </div>

    </div>
  );
}


export default function JoinMatch() {
  return (
    <Suspense>
      <JoinMatchContent />
    </Suspense>
  );
}
