"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "../lib/gameStore";
import { WalletSection } from "../components/WalletSection";

const OPPONENT_WARN_MS  = 60_000;  // show warning after 60s
const OPPONENT_ABORT_MS = 90_000;  // allow exit after 90s

const DESIGN_W = 1440;
const DESIGN_H = 823;

// Pair-specific lobby backgrounds — keyed by sorted "id1-id2"
const PAIR_BG: Record<string, string> = {
  "kenji-riven": "/new-assets/two-fighters-vs.png",
  "kenji-elara": "/new-assets/lobby-clash.webm",
  "elara-zane":  "/new-assets/lobby-vs-scene.webm",
};

function getPairBg(id1: string, id2: string): string {
  const key = [id1, id2].sort().join("-");
  return PAIR_BG[key] ?? "/new-assets/lobby-vs-scene.webm";
}

export default function Lobby() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { selectedCharacter, opponentCharacter, matchId, playerRole, setOpponentCharacterFromServer } = useGameStore();
  const [p1Ready, setP1Ready] = useState(false);
  const [p2Ready, setP2Ready] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [opponentWaitMs, setOpponentWaitMs] = useState(0);
  const waitStartRef = useRef<number | null>(null);

  const player = selectedCharacter;
  const opponent = opponentCharacter;

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

  // Poll for opponent character (multiplayer only)
  useEffect(() => {
    if (!playerRole || !matchId) {
      // Solo: AI auto-readies after a short delay
      const t = setTimeout(() => setP2Ready(true), 1500 + Math.random() * 1000);
      return () => clearTimeout(t);
    }

    // Track how long we've been waiting for opponent
    waitStartRef.current = Date.now();
    const waitTick = setInterval(() => {
      if (waitStartRef.current) {
        setOpponentWaitMs(Date.now() - waitStartRef.current);
      }
    }, 1000);

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/match/${matchId}?role=${playerRole}`);
        const data = await res.json() as { opponentCharId: string | null; phase?: string };
        if (data.phase === "timed-out") {
          clearInterval(poll);
          clearInterval(waitTick);
          router.replace("/");
          return;
        }
        if (data.opponentCharId) {
          setOpponentCharacterFromServer(data.opponentCharId);
          setP2Ready(true);
          clearInterval(poll);
          clearInterval(waitTick);
        }
      } catch {
        // ignore transient errors
      }
    }, 2000);

    return () => {
      clearInterval(poll);
      clearInterval(waitTick);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerRole, matchId]);

  // Solo: auto-ready P1 after 3s; On-chain: P1 auto-readies (they committed by creating)
  useEffect(() => {
    const t = setTimeout(() => setP1Ready(true), 3000);
    return () => clearTimeout(t);
  }, []);

  // Countdown after both ready
  useEffect(() => {
    if (p1Ready && p2Ready && countdown === null) {
      setCountdown(3);
    }
  }, [p1Ready, p2Ready, countdown]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (countdown === 0) {
      router.push("/loadout");
    }
  }, [countdown, router]);

  const handleReady = () => {
    setP1Ready(true);
  };

  const statusText = !p1Ready
    ? "WAITING_FOR_PLAYERS..."
    : !p2Ready
      ? "OPPONENT_CONNECTING..."
      : countdown !== null && countdown > 0
        ? `MATCH_STARTS_IN_${countdown}...`
        : "LAUNCHING...";

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#050505", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, transformOrigin: "top left", position: "relative" }}>

        {/* Background — pair-specific when both fighters are known */}
        <div className="absolute inset-0">
          {(() => {
            const bg = (player && opponent)
              ? getPairBg(player.id, opponent.id)
              : "/new-assets/lobby-vs-scene.webm";
            return bg.endsWith(".webm") ? (
              <video key={bg} autoPlay loop muted playsInline className="w-full h-full object-cover pointer-events-none">
                <source src={bg} type="video/webm" />
              </video>
            ) : (
              <img key={bg} src={bg} alt="" className="w-full h-full object-cover pointer-events-none" />
            );
          })()}
          <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.88)" }} />
        </div>

        {/* ── Top Bar ── */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
            <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase", fontFamily: "var(--font-space-grotesk), sans-serif" }}>ACTION ORDER</span>
          </button>
          <WalletSection />
        </div>

        {/* Match ID / status bar */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-between border-b"
          style={{ top: 68, width: 1146, padding: "18px 32px", backdropFilter: "blur(2px)", backgroundColor: "rgba(5,5,5,0.5)", borderColor: "rgba(255,255,255,0.05)" }}>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-[#56a4cb]" style={{ width: 8, height: 8 }} />
            <span style={{ fontSize: 14, letterSpacing: "1.4px", color: "#9ca3af", fontWeight: 500 }}>
              MATCH ID: <span style={{ color: "white" }}>{matchId ?? "AO-????-X"}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-icons" style={{ color: "#6b7280", fontSize: 14 }}>wifi</span>
            <span className="uppercase" style={{ fontSize: 12, letterSpacing: "1.2px", color: "#6b7280", fontWeight: 400 }}>Server: NAIJA O1</span>
          </div>
          <div className="flex items-center gap-4">
            <span style={{ fontSize: 14, letterSpacing: "1.4px", color: "#56a4cb", fontWeight: 500 }}>{statusText}</span>
            <div className={`rounded-full bg-[#56a4cb] ${p1Ready && p2Ready ? "animate-ping" : ""}`} style={{ width: 8, height: 8 }} />
          </div>
        </div>

        {/* Main Split Layout */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-start"
          style={{ top: 130, width: 960, height: 570, paddingTop: 60, paddingBottom: 30 }}>

          {/* Vertical Divider */}
          <div className="absolute top-0 bottom-0" style={{ left: "calc(50% - 0.375px)", width: "0.75px", background: "linear-gradient(to bottom, transparent, rgba(185,231,244,0.3) 20%, rgba(185,231,244,0.3) 80%, transparent)" }} />

          {/* Player 1 — Left */}
          <div className="flex-1 relative h-full">
            <div className="absolute flex items-center" style={{ inset: "-60px 36px 80px 36px", paddingLeft: 30 }}>
              <div className="relative flex-1 overflow-hidden" style={{ maxWidth: 384, height: 504, borderRadius: 12 }}>
                {player && (
                  <img src={player.standingArt} alt={player.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{
                      objectPosition: "top center",
                      filter: p1Ready ? "none" : "grayscale(1)",
                      transition: "all 0.5s ease"
                    }} />
                )}
              </div>
              {player && (
                <div className="absolute" style={{ left: 30, top: 30 }}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="rounded-sm px-1.5 py-0.5 bg-[#56a4cb]">
                      <span className="font-bold uppercase text-black" style={{ fontSize: 9 }}>P1</span>
                    </div>
                    <div className="rounded-sm px-1.5 py-0.5 border" style={{ borderColor: "rgba(6,168,249,0.3)" }}>
                      <span className="font-bold uppercase text-[#56a4cb]" style={{ fontSize: "7.5px", letterSpacing: "0.375px" }}>[{player.className}]</span>
                    </div>
                  </div>
                  <div className="font-bold uppercase text-white" style={{ fontSize: 45, lineHeight: "45px", letterSpacing: "-2.25px", textShadow: "0px 0px 7.5px rgba(6,168,249,0.5)", marginTop: 4 }}>
                    <div>{player.name}</div>
                  </div>
                  <div className="font-light uppercase" style={{ fontSize: 18, letterSpacing: "1.8px", color: "#6b7280", marginTop: 6 }}>
                    {player.className}
                  </div>
                </div>
              )}
            </div>
            {/* Ready Button P1 */}
            <div className="absolute flex items-center justify-center cursor-pointer"
              style={{ left: "50%", transform: "translateX(-50%)", top: 445, width: 300, opacity: p1Ready ? 0.5 : 1, pointerEvents: p1Ready ? "none" : "auto" }}>
              <button className="ko-btn ko-btn-primary w-full h-[54px]" onClick={handleReady}>
                <span className="ko-btn-text font-bold uppercase text-white" style={{ fontSize: 20, letterSpacing: "2px" }}>
                  {p1Ready ? "LOCKED IN" : "READY"}
                </span>
                <span className="material-icons ko-btn-icon text-white" style={{ fontSize: 24 }}>{p1Ready ? "check" : "arrow_forward_ios"}</span>
              </button>
            </div>
          </div>

          {/* Center VS */}
          <div className="absolute flex items-center justify-center"
            style={{ left: "50%", transform: "translateX(-50%)", top: "39.72%", bottom: "37.59%", width: 161 }}>
            <span className="font-bold select-none"
              style={{
                fontSize: countdown !== null && countdown > 0 ? 180 : 144,
                lineHeight: "144px",
                letterSpacing: "-7.2px",
                backgroundImage: "linear-gradient(to bottom, white 0%, #9ca3af 50%, #1f2937 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                filter: "drop-shadow(0px 18.75px 18.75px rgba(0,0,0,0.15))",
                transition: "all 0.3s ease",
              }}>
              {countdown !== null && countdown > 0 ? countdown : "VS"}
            </span>
          </div>

          {/* Opponent timeout warning (multiplayer only) */}
        {playerRole && !p2Ready && opponentWaitMs >= OPPONENT_WARN_MS && (
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-3"
            style={{ bottom: 24, zIndex: 20 }}>
            <span style={{ fontSize: 13, letterSpacing: "1px", color: "#f97316", fontWeight: 600, textTransform: "uppercase" }}>
              Opponent not responding…
            </span>
            {opponentWaitMs >= OPPONENT_ABORT_MS && (
              <button
                onClick={() => router.replace("/")}
                className="ko-btn ko-btn-secondary"
                style={{ padding: "8px 24px", fontSize: 13, letterSpacing: "1.2px", fontWeight: 700, textTransform: "uppercase" }}>
                Leave Match
              </button>
            )}
          </div>
        )}

        {/* Player 2 — Right */}
          <div className="flex-1 relative h-full">
            <div className="absolute flex items-center justify-end" style={{ inset: "-60px 36px 80px 36px", paddingRight: 30 }}>
              <div className="relative flex-1 overflow-hidden" style={{ maxWidth: 384, height: 504, borderRadius: 12 }}>
                {opponent && (
                  <img src={opponent.standingArt} alt={opponent.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{
                      objectPosition: "top center",
                      filter: p2Ready ? "none" : "grayscale(1)",
                      transition: "all 0.5s ease"
                    }} />
                )}
              </div>
              {opponent && (
                <div className="absolute flex flex-col items-end" style={{ right: 6, top: 30 }}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="rounded-sm px-1.5 py-0.5 border" style={{ borderColor: "rgba(249,6,168,0.3)" }}>
                      <span className="font-bold uppercase text-right" style={{ fontSize: "7.5px", letterSpacing: "0.375px", color: opponent.color }}>[{opponent.className}]</span>
                    </div>
                    <div className="rounded-sm px-1.5 py-0.5" style={{ backgroundColor: opponent.color }}>
                      <span className="font-bold uppercase text-black" style={{ fontSize: 9 }}>P2</span>
                    </div>
                  </div>
                  <div className="font-bold uppercase text-white text-right" style={{ fontSize: 45, lineHeight: "45px", letterSpacing: "-2.25px", textShadow: `0px 0px 7.5px ${opponent.color}80`, marginTop: 4 }}>
                    <div>{opponent.name}</div>
                  </div>
                  <div className="font-light uppercase text-right" style={{ fontSize: 18, letterSpacing: "1.8px", color: "#6b7280", marginTop: 6 }}>
                    {opponent.className}
                  </div>
                </div>
              )}
            </div>
            {/* Ready Button P2 — auto-clicks */}
            <div className="absolute flex items-center justify-center"
              style={{ left: "50%", transform: "translateX(-50%)", top: 445, width: 300, opacity: p2Ready ? 0.5 : 1 }}>
              <button className="ko-btn ko-btn-primary w-full h-[54px]">
                <span className="ko-btn-text font-bold uppercase text-white" style={{ fontSize: 20, letterSpacing: "2px" }}>
                  {p2Ready ? "LOCKED IN" : "WAITING..."}
                </span>
                <span className="material-icons ko-btn-icon text-white" style={{ fontSize: 24 }}>{p2Ready ? "check" : "hourglass_empty"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
