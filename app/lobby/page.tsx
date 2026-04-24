"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "../lib/gameStore";
import { WalletSection } from "../components/WalletSection";
import { WagerModal } from "../components/WagerModal";

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
  const { selectedCharacter, opponentCharacter, matchId, playerRole, wagerActive, wagerCurrency, setOpponentCharacterFromServer, setOpponentWagered } = useGameStore();
  const [p1Ready, setP1Ready] = useState(false);
  const [p2Ready, setP2Ready] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [opponentWaitMs, setOpponentWaitMs] = useState(0);
  const [netErrorCount, setNetErrorCount] = useState(0);
  const waitStartRef = useRef<number | null>(null);

  // Ranked match payment gate
  const [wagerRequired, setWagerRequired] = useState<boolean | null>(null);
  const [selfPaid, setSelfPaid] = useState(false);
  const [opponentPaid, setOpponentPaid] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [opponentAbandoned, setOpponentAbandoned] = useState(false);
  const [payWaitMs, setPayWaitMs] = useState(0);
  const payWaitStartRef = useRef<number | null>(null);

  const player = selectedCharacter;
  const opponent = opponentCharacter;

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
        const data = await res.json() as {
          opponentCharId: string | null;
          phase?: string;
          opponentWagered?: boolean;
          selfWagered?: boolean;
          wagerRequired?: boolean;
          abortedBy?: "host" | "joiner" | null;
        };
        setNetErrorCount(0);
        if (data.phase === "timed-out") {
          clearInterval(poll);
          clearInterval(waitTick);
          router.replace("/");
          return;
        }
        // Ranked payment gate
        if (data.wagerRequired != null) {
          setWagerRequired(data.wagerRequired);
          if (data.wagerRequired && !data.selfWagered) {
            setShowPayModal(true);
          }
          if (data.selfWagered) setSelfPaid(true);
        }
        // Fix 3: detect opponent abandoned after self paid
        if (data.abortedBy && data.abortedBy !== playerRole && selfPaid && wagerRequired) {
          setOpponentAbandoned(true);
          clearInterval(poll);
          clearInterval(waitTick);
          return;
        }
        if (data.opponentWagered) {
          setOpponentPaid(true);
          setOpponentWagered(true);
        }
        if (data.opponentCharId) {
          setOpponentCharacterFromServer(data.opponentCharId);
          // In ranked matches, p2 is only "ready" after they've paid too
          if (!data.wagerRequired || data.opponentWagered) {
            setP2Ready(true);
            clearInterval(poll);
            clearInterval(waitTick);
          }
        }
      } catch {
        setNetErrorCount((n) => n + 1);
      }
    }, 2000);

    return () => {
      clearInterval(poll);
      clearInterval(waitTick);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerRole, matchId]);

  // Solo / free match: auto-ready P1 after 3s.
  // Ranked match: P1 readies only after paying.
  useEffect(() => {
    if (wagerRequired === true) return; // ranked — wait for payment
    const t = setTimeout(() => setP1Ready(true), 3000);
    return () => clearTimeout(t);
  }, [wagerRequired]);

  // Ranked: once selfPaid, mark P1 ready
  useEffect(() => {
    if (selfPaid) setP1Ready(true);
  }, [selfPaid]);

  // Fix 4: track how long we've been waiting for opponent to pay
  useEffect(() => {
    if (!selfPaid || opponentPaid || !wagerRequired) return;
    payWaitStartRef.current = Date.now();
    const t = setInterval(() => {
      if (payWaitStartRef.current) setPayWaitMs(Date.now() - payWaitStartRef.current);
    }, 1000);
    return () => clearInterval(t);
  }, [selfPaid, opponentPaid, wagerRequired]);

  // Ranked: once both paid and opponentCharId already found, set P2 ready
  useEffect(() => {
    if (opponentPaid && opponentCharacter) setP2Ready(true);
  }, [opponentPaid, opponentCharacter]);

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
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#050505", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left" }}>

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
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#9ca3af", textTransform: "uppercase" }}>LOBBY</div>
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
          <div className="flex items-center gap-4">
            {wagerActive ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", letterSpacing: 1, textTransform: "uppercase" }}>⚡ WAGER ON — {wagerCurrency ?? "CELO"}</span>
              </div>
            ) : (
              <span style={{ fontSize: 11, color: "#475569", letterSpacing: 1, textTransform: "uppercase" }}>No Wager</span>
            )}
            <div className="flex items-center gap-2">
              <span className="material-icons" style={{ color: "#6b7280", fontSize: 14 }}>wifi</span>
              <span className="uppercase" style={{ fontSize: 12, letterSpacing: "1.2px", color: "#6b7280", fontWeight: 400 }}>Server: NAIJA O1</span>
            </div>
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
              <div className="relative flex-1 overflow-hidden" style={{
                maxWidth: 384, height: 504, borderRadius: 12,
                background: "#07050f",
                border: `2px solid ${player ? player.color + "60" : "rgba(86,164,203,0.4)"}`,
                boxShadow: player ? `0 0 40px ${player.color}30, inset 0 0 60px rgba(0,0,0,0.5)` : undefined,
              }}>
                {player && (
                  <img src={player.standingArt} alt={player.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{
                      objectPosition: "top center",
                      filter: p1Ready ? "none" : "grayscale(1)",
                      transition: "all 0.5s ease"
                    }} />
                )}
                <div className="absolute inset-x-0 bottom-0" style={{ height: 80, background: "linear-gradient(to top, #07050f 0%, transparent 100%)", pointerEvents: "none" }} />
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

          {/* Network error banner */}
          {netErrorCount >= 3 && !p2Ready && (
            <div style={{
              position: "absolute", bottom: 90, left: "50%", transform: "translateX(-50%)",
              display: "flex", alignItems: "center", gap: 10, padding: "10px 20px",
              background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.35)",
              borderRadius: 6, zIndex: 20,
            }}>
              <span className="material-icons" style={{ color: "#fbbf24", fontSize: 16 }}>wifi_off</span>
              <span style={{ fontSize: 12, color: "#fbbf24", fontWeight: 600, letterSpacing: 0.5 }}>
                Connection issues — retrying…
              </span>
            </div>
          )}

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
              <div className="relative flex-1 overflow-hidden" style={{
                maxWidth: 384, height: 504, borderRadius: 12,
                background: "#07050f",
                border: `2px solid ${opponent ? opponent.color + "60" : "rgba(249,6,168,0.4)"}`,
                boxShadow: opponent ? `0 0 40px ${opponent.color}30, inset 0 0 60px rgba(0,0,0,0.5)` : undefined,
              }}>
                {opponent && (
                  <img src={opponent.standingArt} alt={opponent.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{
                      objectPosition: "top center",
                      filter: p2Ready ? "none" : "grayscale(1)",
                      transition: "all 0.5s ease"
                    }} />
                )}
                <div className="absolute inset-x-0 bottom-0" style={{ height: 80, background: "linear-gradient(to top, #07050f 0%, transparent 100%)", pointerEvents: "none" }} />
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

      {/* Fix 3: Opponent abandoned after self paid */}
      {opponentAbandoned && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "rgba(15,10,5,0.97)", border: "1px solid rgba(248,113,113,0.4)",
            borderRadius: 12, padding: "40px 48px", maxWidth: 520, textAlign: "center",
            boxShadow: "0 0 40px rgba(248,113,113,0.15)",
          }}>
            <span className="material-icons" style={{ fontSize: 48, color: "#f87171", display: "block", marginBottom: 16 }}>person_off</span>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", marginBottom: 12 }}>Opponent Left</div>
            <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.6, marginBottom: 8 }}>
              Your opponent quit after the entry fee was collected.
              Your <strong style={{ color: "#fbbf24" }}>0.000007 CELO</strong> entry fee is held in the Arena contract.
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 28 }}>
              Contact <strong style={{ color: "#56a4cb" }}>@knockorder</strong> on Telegram for a refund.
            </div>
            <button
              onClick={() => router.replace("/")}
              className="ko-btn ko-btn-secondary"
              style={{ padding: "10px 32px", fontSize: 14, fontWeight: 700, letterSpacing: 1 }}
            >
              Leave Match
            </button>
          </div>
        </div>
      )}

      {/* Ranked match payment modal */}
      {showPayModal && !selfPaid && (
        <WagerModal
          mode="ranked"
          lockedAmount="0.000007"
          onConfirmed={() => {
            setSelfPaid(true);
            setShowPayModal(false);
          }}
          onSkip={() => {
            // Cancel → leave match
            if (matchId && playerRole) {
              void fetch(`/api/match/${matchId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "quit", role: playerRole }),
              });
            }
            router.replace("/");
          }}
        />
      )}

      {/* Waiting for opponent to pay banner (Fix 4: Leave Match after 90s) */}
      {wagerRequired && selfPaid && !opponentPaid && !opponentAbandoned && (
        <div style={{
          position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          padding: "14px 28px",
          background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)",
          borderRadius: 8, zIndex: 50, backdropFilter: "blur(8px)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="material-icons" style={{ color: "#f59e0b", fontSize: 18 }}>hourglass_empty</span>
            <span style={{ fontSize: 13, color: "#f59e0b", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
              Waiting for opponent to pay entry fee…
            </span>
          </div>
          {payWaitMs >= 90_000 && (
            <button
              onClick={() => {
                if (matchId && playerRole) {
                  void fetch(`/api/match/${matchId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "quit", role: playerRole }),
                  });
                }
                router.replace("/");
              }}
              className="ko-btn ko-btn-secondary"
              style={{ padding: "7px 24px", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}
            >
              Leave Match
            </button>
          )}
        </div>
      )}
    </div>
  );
}
