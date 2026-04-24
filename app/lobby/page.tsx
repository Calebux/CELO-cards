"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "../lib/gameStore";
import { WagerModal } from "../components/WagerModal";

const OPPONENT_WARN_MS  = 60_000;
const OPPONENT_ABORT_MS = 90_000;

export default function Lobby() {
  const router = useRouter();
  const {
    selectedCharacter, opponentCharacter, matchId, playerRole,
    wagerActive, wagerCurrency, opponentName,
    setOpponentCharacterFromServer, setOpponentWagered,
  } = useGameStore();

  const [p1Ready, setP1Ready] = useState(false);
  const [p2Ready, setP2Ready] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [opponentWaitMs, setOpponentWaitMs] = useState(0);
  const [netErrorCount, setNetErrorCount] = useState(0);
  const waitStartRef = useRef<number | null>(null);
  // For multiplayer: don't start the auto-ready timer until the first poll
  // comes back so wagerRequired is known — prevents a race on slow networks
  const [firstPollDone, setFirstPollDone] = useState(!playerRole || !matchId);

  // Ranked / wager payment gate
  const [wagerRequired, setWagerRequired] = useState<boolean | null>(null);
  // Host who already paid in create page starts as selfPaid
  const [selfPaid, setSelfPaid] = useState(() => !!(wagerActive && playerRole === "host"));
  const [opponentPaid, setOpponentPaid] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [opponentAbandoned, setOpponentAbandoned] = useState(false);
  const [payWaitMs, setPayWaitMs] = useState(0);
  const payWaitStartRef = useRef<number | null>(null);

  const player   = selectedCharacter;
  const opponent = opponentCharacter;

  // ── Poll for opponent character (multiplayer only) ──────────────────────
  useEffect(() => {
    if (!playerRole || !matchId) {
      // Solo: AI auto-readies after a short delay
      const t = setTimeout(() => setP2Ready(true), 1500 + Math.random() * 1000);
      return () => clearTimeout(t);
    }

    waitStartRef.current = Date.now();
    const waitTick = setInterval(() => {
      if (waitStartRef.current) setOpponentWaitMs(Date.now() - waitStartRef.current);
    }, 1000);

    const poll = setInterval(async () => {
      try {
        const res  = await fetch(`/api/match/${matchId}?role=${playerRole}`);
        const data = await res.json() as {
          opponentCharId:   string | null;
          phase?:           string;
          opponentWagered?: boolean;
          selfWagered?:     boolean;
          wagerRequired?:   boolean;
          abortedBy?:       "host" | "joiner" | null;
        };
        setNetErrorCount(0);
        setFirstPollDone(true);

        if (data.phase === "timed-out") {
          clearInterval(poll);
          clearInterval(waitTick);
          router.replace("/");
          return;
        }

        // Payment gate
        if (data.wagerRequired != null) {
          setWagerRequired(data.wagerRequired);
          if (data.wagerRequired && !data.selfWagered && !selfPaid) {
            setShowPayModal(true);
          }
          if (data.selfWagered) setSelfPaid(true);
        }

        // Opponent abandoned after self paid
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

  // Auto-ready P1 after 3s — but only AFTER the first poll confirms
  // wagerRequired status (prevents racing the poll on slow networks).
  // Solo matches skip polling so firstPollDone starts true for them.
  useEffect(() => {
    if (!firstPollDone) return;
    if (wagerRequired === true) return;
    const t = setTimeout(() => setP1Ready(true), 3000);
    return () => clearTimeout(t);
  }, [wagerRequired, firstPollDone]);

  // Ranked: once selfPaid, mark P1 ready
  useEffect(() => {
    if (selfPaid) setP1Ready(true);
  }, [selfPaid]);

  // Track how long we've been waiting for opponent to pay
  useEffect(() => {
    if (!selfPaid || opponentPaid || !wagerRequired) return;
    payWaitStartRef.current = Date.now();
    const t = setInterval(() => {
      if (payWaitStartRef.current) setPayWaitMs(Date.now() - payWaitStartRef.current);
    }, 1000);
    return () => clearInterval(t);
  }, [selfPaid, opponentPaid, wagerRequired]);

  // Once opponent paid and their character is already in store, set P2 ready
  useEffect(() => {
    if (opponentPaid && opponentCharacter) setP2Ready(true);
  }, [opponentPaid, opponentCharacter]);

  // Start countdown when both ready
  useEffect(() => {
    if (p1Ready && p2Ready && countdown === null) setCountdown(3);
  }, [p1Ready, p2Ready, countdown]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (countdown === 0) router.push("/loadout");
  }, [countdown, router]);

  // ── Status label text ───────────────────────────────────────────────────
  const statusLabel = !p1Ready
    ? wagerRequired ? "WAITING FOR PAYMENT…" : "GETTING READY…"
    : !p2Ready
      ? opponentWaitMs > OPPONENT_WARN_MS
        ? "OPPONENT NOT RESPONDING…"
        : "WAITING FOR OPPONENT…"
      : countdown !== null && countdown > 0
        ? `MATCH STARTS IN ${countdown}`
        : "LAUNCHING…";

  const p1Color = player?.color  ?? "#56a4cb";
  const p2Color = opponent?.color ?? "#f906a8";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "#050810",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-space-grotesk), sans-serif",
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes ml-fadein { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes ml-left   { from { opacity:0; transform:translateX(-80px) scale(0.9); } to { opacity:1; transform:translateX(0) scale(1); } }
        @keyframes ml-right  { from { opacity:0; transform:translateX(80px) scale(0.9); } to { opacity:1; transform:translateX(0) scale(1); } }
        @keyframes ml-pulse  { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
        @keyframes waitDot   { 0%,100% { opacity:0.2; transform:scale(0.8); } 50% { opacity:1; transform:scale(1.1); } }
        @keyframes ml-glow   { 0%,100% { opacity:0.6; } 50% { opacity:1; } }
      `}</style>

      {/* Subtle vignette */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)", pointerEvents: "none" }} />

      {/* Leave button — top left */}
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
        style={{
          position: "absolute", top: 20, left: 20,
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6, padding: "6px 14px", cursor: "pointer",
          fontSize: 11, color: "rgba(185,231,244,0.45)", fontFamily: "inherit",
          letterSpacing: 1.5, textTransform: "uppercase",
          transition: "all 0.2s",
        }}
      >
        ← LEAVE
      </button>

      {/* Match ID + wager badge — top center */}
      <div style={{
        position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 10,
        animation: "ml-fadein 0.5s ease forwards",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 14px",
          background: "rgba(86,164,203,0.07)", border: "1px solid rgba(86,164,203,0.2)",
          borderRadius: 20,
        }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 5px #4ade80", animation: "ml-glow 2s ease-in-out infinite" }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, color: "rgba(185,231,244,0.6)", textTransform: "uppercase" }}>
            {matchId ?? "AO-????-X"}
          </span>
        </div>
        {wagerActive && (
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 12px",
            background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)",
            borderRadius: 20,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", letterSpacing: 1, textTransform: "uppercase" }}>
              ⚡ {wagerCurrency?.toUpperCase() ?? "CELO"}
            </span>
          </div>
        )}
      </div>

      {/* ── Main centered content (raised 6px) ───────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: "translateY(-6px)" }}>

      {/* ── Fighter portraits ─────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        animation: "ml-fadein 0.4s ease forwards",
        marginBottom: 36,
      }}>

        {/* Player side */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
          animation: "ml-left 0.55s cubic-bezier(0.22,1,0.36,1) forwards",
          width: 200,
        }}>
          <div style={{
            width: 136, height: 180, borderRadius: 8, overflow: "hidden",
            border: `2px solid ${p1Ready ? p1Color : "rgba(86,164,203,0.3)"}`,
            boxShadow: p1Ready
              ? `0 0 32px ${p1Color}50, 0 0 60px ${p1Color}20`
              : "0 0 12px rgba(86,164,203,0.12)",
            transition: "all 0.5s ease",
            background: "#0a0510",
          }}>
            {player ? (
              <img
                src={player.standingArt}
                alt={player.name}
                style={{
                  width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center",
                  filter: p1Ready ? "none" : "grayscale(0.4) brightness(0.85)",
                  transition: "filter 0.5s ease",
                }}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 32, opacity: 0.3 }}>⚔️</span>
              </div>
            )}
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 14, fontWeight: 800, letterSpacing: 3,
              color: p1Ready ? p1Color : "#56a4cb",
              textTransform: "uppercase",
              textShadow: p1Ready ? `0 0 16px ${p1Color}80` : "none",
              transition: "all 0.5s",
              marginBottom: 4,
            }}>
              {player?.name ?? "YOU"}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: p1Ready ? "#4ade80" : "rgba(185,231,244,0.35)", textTransform: "uppercase", transition: "all 0.3s" }}>
              {p1Ready ? "✓ READY" : "YOU"}
            </div>
          </div>
        </div>

        {/* Center VS block */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          margin: "0 36px",
          animation: "ml-fadein 0.6s 0.15s ease both",
        }}>
          <div style={{ width: 1, height: 44, background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.12), transparent)" }} />

          <div style={{
            fontSize: countdown !== null && countdown > 0 ? 76 : 44,
            fontWeight: 900, letterSpacing: -2, color: "#fff",
            textShadow: "0 0 30px rgba(255,255,255,0.35)",
            padding: "10px 0", lineHeight: 1,
            transition: "font-size 0.3s ease",
          }}>
            {countdown !== null && countdown > 0 ? countdown : "VS"}
          </div>

          <div style={{ width: 1, height: 44, background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.12), transparent)" }} />
        </div>

        {/* Opponent side */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
          animation: "ml-right 0.55s cubic-bezier(0.22,1,0.36,1) forwards",
          width: 200,
        }}>
          <div style={{
            width: 136, height: 180, borderRadius: 8, overflow: "hidden",
            border: `2px solid ${p2Ready ? p2Color : "rgba(249,6,168,0.25)"}`,
            boxShadow: p2Ready
              ? `0 0 32px ${p2Color}50, 0 0 60px ${p2Color}20`
              : "0 0 12px rgba(249,6,168,0.08)",
            transition: "all 0.5s ease",
            background: "#0a0510",
          }}>
            {opponent ? (
              <img
                src={opponent.standingArt}
                alt={opponent.name}
                style={{
                  width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center",
                  filter: p2Ready ? "none" : "grayscale(0.4) brightness(0.85)",
                  transition: "filter 0.5s ease",
                }}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 5 }}>
                  {[0, 0.3, 0.6].map((delay, i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#f906a8", animation: `waitDot 1.2s ease-in-out ${delay}s infinite` }} />
                  ))}
                </div>
                <span style={{ fontSize: 9, color: "rgba(249,6,168,0.45)", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>WAITING</span>
              </div>
            )}
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 14, fontWeight: 800, letterSpacing: 3,
              color: p2Ready ? p2Color : opponent ? "rgba(249,6,168,0.7)" : "rgba(249,6,168,0.4)",
              textTransform: "uppercase",
              textShadow: p2Ready ? `0 0 16px ${p2Color}80` : "none",
              transition: "all 0.5s",
              marginBottom: 4,
            }}>
              {opponent?.name ?? (opponentName ? opponentName.toUpperCase() : "???")}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: p2Ready ? "#4ade80" : "rgba(185,231,244,0.3)", textTransform: "uppercase", transition: "all 0.3s" }}>
              {p2Ready ? "✓ READY" : "OPPONENT"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Status label ─────────────────────────────────────────────────── */}
      <p style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 4,
        color: opponentWaitMs > OPPONENT_WARN_MS && !p2Ready
          ? "rgba(249,115,22,0.7)"
          : "rgba(185,231,244,0.4)",
        textTransform: "uppercase",
        animation: "ml-pulse 1.6s ease-in-out infinite, ml-fadein 0.4s 0.3s ease both",
        opacity: 0, marginBottom: 14,
        transition: "color 0.4s",
      }}>
        {statusLabel}
      </p>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <div style={{
        width: 300, height: 2,
        background: "rgba(255,255,255,0.06)",
        borderRadius: 2, overflow: "hidden",
        animation: "ml-fadein 0.4s 0.4s ease both", opacity: 0,
      }}>
        <div style={{
          height: "100%", borderRadius: 2,
          background: `linear-gradient(90deg, ${p1Color}, ${p2Color})`,
          width: countdown !== null && countdown > 0
            ? `${((3 - countdown) / 3) * 100}%`
            : countdown === 0 ? "100%" : "0%",
          transition: "width 1s linear",
        }} />
      </div>

      </div>{/* end raised content wrapper */}

      {/* ── Network error ────────────────────────────────────────────────── */}
      {netErrorCount >= 3 && !p2Ready && (
        <div style={{
          position: "absolute", bottom: 50, left: "50%", transform: "translateX(-50%)",
          display: "flex", alignItems: "center", gap: 8, padding: "8px 18px",
          background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)",
          borderRadius: 6,
        }}>
          <span className="material-icons" style={{ color: "#fbbf24", fontSize: 14 }}>wifi_off</span>
          <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 600, letterSpacing: 0.5 }}>Connection issues — retrying…</span>
        </div>
      )}

      {/* ── Opponent timeout / leave ─────────────────────────────────────── */}
      {playerRole && !p2Ready && opponentWaitMs >= OPPONENT_WARN_MS && !opponentAbandoned && (
        <div style={{
          position: "absolute", bottom: opponentWaitMs >= OPPONENT_ABORT_MS ? 40 : 50,
          left: "50%", transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        }}>
          {opponentWaitMs >= OPPONENT_ABORT_MS && (
            <button
              onClick={() => {
                void fetch(`/api/match/${matchId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "quit", role: playerRole }),
                });
                router.replace("/");
              }}
              style={{
                padding: "8px 24px",
                background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)",
                borderRadius: 6, cursor: "pointer",
                fontSize: 12, fontWeight: 700, color: "#f87171",
                fontFamily: "inherit", letterSpacing: 1.5, textTransform: "uppercase",
              }}
            >
              Leave Match
            </button>
          )}
        </div>
      )}

      {/* ── Waiting for opponent to pay ──────────────────────────────────── */}
      {wagerRequired && selfPaid && !opponentPaid && !opponentAbandoned && (
        <div style={{
          position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          padding: "12px 24px",
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
          borderRadius: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="material-icons" style={{ color: "#f59e0b", fontSize: 16 }}>hourglass_empty</span>
            <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
              Waiting for opponent to pay…
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
              style={{
                padding: "6px 20px",
                background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)",
                borderRadius: 5, cursor: "pointer",
                fontSize: 11, fontWeight: 700, color: "#f87171",
                fontFamily: "inherit", letterSpacing: 1, textTransform: "uppercase",
              }}
            >
              Leave Match
            </button>
          )}
        </div>
      )}

      {/* ── Opponent abandoned after self paid ──────────────────────────── */}
      {opponentAbandoned && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "rgba(10,5,18,0.97)", border: "1px solid rgba(248,113,113,0.4)",
            borderRadius: 12, padding: "40px 48px", maxWidth: 480, textAlign: "center",
            boxShadow: "0 0 40px rgba(248,113,113,0.12)",
          }}>
            <span className="material-icons" style={{ fontSize: 44, color: "#f87171", display: "block", marginBottom: 14 }}>person_off</span>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9", marginBottom: 10 }}>Opponent Left</div>
            <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, marginBottom: 8 }}>
              Your opponent quit after the entry fee was collected. Your <strong style={{ color: "#fbbf24" }}>0.000007 CELO</strong> entry fee is held in the Arena contract.
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 24 }}>
              Contact <strong style={{ color: "#56a4cb" }}>@knockorder</strong> on Telegram for a refund.
            </div>
            <button
              onClick={() => router.replace("/")}
              style={{
                padding: "10px 32px",
                background: "rgba(86,164,203,0.1)", border: "1px solid rgba(86,164,203,0.4)",
                borderRadius: 6, cursor: "pointer",
                fontSize: 13, fontWeight: 700, color: "#b9e7f4",
                fontFamily: "inherit", letterSpacing: 1, textTransform: "uppercase",
              }}
            >
              Leave Match
            </button>
          </div>
        </div>
      )}

      {/* ── Ranked payment modal ─────────────────────────────────────────── */}
      {showPayModal && !selfPaid && (
        <WagerModal
          mode="ranked"
          lockedAmount="0.000007"
          onConfirmed={() => {
            setSelfPaid(true);
            setShowPayModal(false);
          }}
          onSkip={() => {
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
    </div>
  );
}
