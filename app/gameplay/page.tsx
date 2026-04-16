"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useGameStore } from "../lib/gameStore";
import { Card, CardType } from "../lib/gameData";
import { SlotResult } from "../lib/combatEngine";
import { playSound, startBgMusic, stopBgMusic, setMuted, isMuted } from "../lib/soundManager";
import { formatUnits } from "viem";
import { PAYOUT_AMOUNT } from "../lib/cusd";

const BG_MAIN = "/new addition/gameplay777.webp";
const MENU_BG = "/new addition/gameplay landing page.webp";

const DESIGN_W = 1440;
const DESIGN_H = 823;

function getTypeColor(type: CardType): string {
  switch (type) {
    case "strike": return "#fbac4b";
    case "defense": return "#60a5ce";
    case "control": return "#a855f7";
  }
}

function getTypeIcon(type: CardType): string {
  switch (type) {
    case "strike": return "⚔️";
    case "defense": return "🛡️";
    case "control": return "🎭";
  }
}

function getTypeBg(type: CardType): string {
  switch (type) {
    case "strike": return "#421f1b";
    case "defense": return "#1e3a5f";
    case "control": return "#3b0764";
  }
}

function getVideoForCard(card: Card | null): string | null {
  if (!card) return null;
  // Specific cards
  if (card.id === "evasion") return "/action videos/Evasion.webm";
  if (card.id === "reversal_edge") return "/action videos/Reversal edge.webm";
  if (card.id === "finisher") return "/action videos/Kiara finishing.webm";

  // Generic types
  if (card.type === "control") return "/action videos/control.webm";
  if (card.type === "defense") return "/action videos/defense.webm";
  if (card.type === "strike") {
    // Pick one deterministically based on card ID
    const strikeVids = [
      "/action videos/strike kick.webm",
      "/action videos/top strike.webm",
      "/action videos/Whisk_2mjy0ejzkntmxctotaznijwlmfjm00snxumytgj.webm"
    ];
    const total = card.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return strikeVids[total % strikeVids.length];
  }
  return null;
}

// ── Clash Cinematic Keyframes ────────────────────────────────────────────────
const CLASH_STYLES = `
  @keyframes slideInLeft {
    0%   { transform: translateX(-520px) rotate(-8deg) scale(0.85); opacity: 0; }
    60%  { transform: translateX(0px) rotate(0deg) scale(1.05); opacity: 1; }
    100% { transform: translateX(0px) rotate(0deg) scale(1); opacity: 1; }
  }
  @keyframes slideInRight {
    0%   { transform: translateX(520px) rotate(8deg) scale(0.85); opacity: 0; }
    60%  { transform: translateX(0px) rotate(0deg) scale(1.05); opacity: 1; }
    100% { transform: translateX(0px) rotate(0deg) scale(1); opacity: 1; }
  }
  @keyframes shockwave {
    0%   { transform: scale(0); opacity: 1; }
    70%  { transform: scale(1); opacity: 0.6; }
    100% { transform: scale(1.3); opacity: 0; }
  }
  @keyframes shockwave2 {
    0%   { transform: scale(0); opacity: 0.7; }
    100% { transform: scale(1.6); opacity: 0; }
  }
  @keyframes resultSlam {
    0%   { transform: scale(2.5) translateY(-20px); opacity: 0; filter: blur(8px); }
    50%  { transform: scale(0.92) translateY(0px); opacity: 1; filter: blur(0px); }
    65%  { transform: scale(1.06); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes sparkFly1 { 0% { transform: translate(0,0) scale(1); opacity:1; } 100% { transform: translate(-90px,-110px) scale(0); opacity:0; } }
  @keyframes sparkFly2 { 0% { transform: translate(0,0) scale(1); opacity:1; } 100% { transform: translate(110px,-90px) scale(0); opacity:0; } }
  @keyframes sparkFly3 { 0% { transform: translate(0,0) scale(1); opacity:1; } 100% { transform: translate(-70px, 100px) scale(0); opacity:0; } }
  @keyframes sparkFly4 { 0% { transform: translate(0,0) scale(1); opacity:1; } 100% { transform: translate(80px, 120px) scale(0); opacity:0; } }
  @keyframes sparkFly5 { 0% { transform: translate(0,0) scale(1); opacity:1; } 100% { transform: translate(130px,-60px) scale(0); opacity:0; } }
  @keyframes sparkFly6 { 0% { transform: translate(0,0) scale(1); opacity:1; } 100% { transform: translate(-120px,70px) scale(0); opacity:0; } }
  @keyframes cinematicIn  { from { opacity: 0; } to { opacity: 1; } }
  @keyframes cinematicOut { from { opacity: 1; } to { opacity: 0; } }
  @keyframes descriptionFade { 0% { opacity:0; transform:translateY(12px); } 100% { opacity:1; transform:translateY(0); } }
  @keyframes effectBannerIn {
    0%   { transform: translateX(-50%) scaleX(0.4) scaleY(1.6); opacity: 0; filter: blur(12px); }
    50%  { transform: translateX(-50%) scaleX(1.08) scaleY(0.95); opacity: 1; filter: blur(0px); }
    65%  { transform: translateX(-50%) scaleX(0.97) scaleY(1.02); }
    100% { transform: translateX(-50%) scaleX(1) scaleY(1); opacity: 1; filter: blur(0px); }
  }
  @keyframes effectBannerOut {
    0%   { opacity: 1; transform: translateX(-50%) scale(1); }
    100% { opacity: 0; transform: translateX(-50%) scale(1.15); }
  }
  @keyframes cardShake {
    0%,100% { transform: translateX(0) rotate(0deg); }
    20% { transform: translateX(-6px) rotate(-2deg); }
    40% { transform: translateX(6px) rotate(2deg); }
    60% { transform: translateX(-4px) rotate(-1deg); }
    80% { transform: translateX(4px) rotate(1deg); }
  }
`;

interface ClashCinematicProps {
  result: SlotResult;
  opponentColor: string;
  fadeOut: boolean;
}

function getEffectLabel(effect: string): { label: string; color: string } {
  switch (effect) {
    case "evasion":   return { label: "EVASION!",   color: "#a855f7" };
    case "reversal":  return { label: "REVERSAL!",  color: "#06b6d4" };
    case "pressure":  return { label: "PRESSURE!",  color: "#c084fc" };
    case "mindgame":  return { label: "MIND GAME!", color: "#a855f7" };
    case "disrupt":   return { label: "DISRUPT!",   color: "#fbac4b" };
    case "guard":     return { label: "GUARD!",     color: "#60a5ce" };
    case "anticipation": return { label: "ANTICIPATE!", color: "#34d399" };
    case "finisher":  return { label: "FINISHER!",  color: "#f43f5e" };
    default:          return { label: effect.toUpperCase() + "!", color: "#fff" };
  }
}

function ClashCinematic({ result, opponentColor, fadeOut }: ClashCinematicProps) {
  const winnerColor = result.winner === "player" ? "#06a8f9"
    : result.winner === "opponent" ? opponentColor
      : "#fbbf24";
  const resultLabel = result.winner === "player" ? "WIN" : result.winner === "opponent" ? "LOSE" : "DRAW";
  const sparkColors = result.winner === "player"
    ? ["#06a8f9", "#5abfe6", "#fff", "#06d4f9", "#3bf", "#aef"]
    : result.winner === "opponent"
      ? [opponentColor, "#f06", "#fff", "#f90", "#f6a", "#fcc"]
      : ["#fbbf24", "#fff", "#fde68a", "#fcd34d", "#fef", "#fff"];

  const winningCard = result.winner === "player" ? result.playerCard : result.winner === "opponent" ? result.opponentCard : null;
  const actionVideo = getVideoForCard(winningCard);

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: fadeOut ? "cinematicOut 0.4s ease forwards" : "cinematicIn 0.25s ease forwards",
    }}>
      {/* Action Video Background */}
      {actionVideo && (
        <video
          src={actionVideo}
          autoPlay
          muted
          playsInline
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
            opacity: 0.85,
          }}
        />
      )}

      {/* Dark vignette overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at center, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.8) 100%)",
      }} />

      {/* Center clash arena */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 60, zIndex: 1 }}>

        {/* Player card */}
        <div style={{
          width: 160, height: 224, borderRadius: 10, overflow: "hidden", position: "relative",
          border: `3px solid ${result.winner === "player" ? "#4ade80" : result.winner === "draw" ? "#fbbf24" : "#ef4444"}`,
          boxShadow: `0 0 40px ${result.winner === "player" ? "rgba(74,222,128,0.6)" : "rgba(239,68,68,0.4)"}, 0 20px 60px rgba(0,0,0,0.8)`,
          animation: "slideInLeft 0.55s cubic-bezier(0.22,1,0.36,1) forwards, cardShake 0.35s 0.55s ease",
          flexShrink: 0,
        }}>
          <img src={result.playerCard.image} alt={result.playerCard.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 10px 8px", background: "linear-gradient(transparent, rgba(0,0,0,0.9))" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: 1 }}>{result.playerCard.name}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#06a8f9" }}>+{result.playerKnock} KNC</div>
          </div>
        </div>

        {/* Center clash fx */}
        <div style={{ position: "relative", width: 120, height: 120, flexShrink: 0 }}>
          {/* Shockwave rings */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: `3px solid ${winnerColor}`,
            animation: "shockwave 0.7s 0.5s ease-out forwards",
          }} />
          <div style={{
            position: "absolute", inset: -20, borderRadius: "50%",
            border: `2px solid ${winnerColor}88`,
            animation: "shockwave2 0.9s 0.55s ease-out forwards",
          }} />
          {/* Sparks */}
          {sparkColors.map((c, idx) => (
            <div key={idx} style={{
              position: "absolute", top: "50%", left: "50%",
              width: idx % 2 === 0 ? 10 : 6, height: idx % 2 === 0 ? 10 : 6,
              borderRadius: "50%", backgroundColor: c,
              boxShadow: `0 0 8px ${c}`,
              animation: `sparkFly${idx + 1} 0.7s ${0.48 + idx * 0.03}s ease-out forwards`,
            }} />
          ))}
          {/* VS / result label */}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          }}>
            <div style={{
              fontSize: 36, fontWeight: 900, letterSpacing: -1,
              color: winnerColor,
              textShadow: `0 0 30px ${winnerColor}, 0 0 60px ${winnerColor}80`,
              animation: "resultSlam 0.45s 0.65s cubic-bezier(0.22,1,0.36,1) both",
            }}>{resultLabel}</div>
          </div>
        </div>

        {/* Opponent card */}
        <div style={{
          width: 160, height: 224, borderRadius: 10, overflow: "hidden", position: "relative",
          border: `3px solid ${result.winner === "opponent" ? "#4ade80" : result.winner === "draw" ? "#fbbf24" : "#ef4444"}`,
          boxShadow: `0 0 40px ${result.winner === "opponent" ? "rgba(74,222,128,0.6)" : "rgba(239,68,68,0.4)"}, 0 20px 60px rgba(0,0,0,0.8)`,
          animation: "slideInRight 0.55s cubic-bezier(0.22,1,0.36,1) forwards, cardShake 0.35s 0.55s ease",
          flexShrink: 0,
        }}>
          <img src={result.opponentCard.image} alt={result.opponentCard.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 10px 8px", background: "linear-gradient(transparent, rgba(0,0,0,0.9))" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: 1 }}>{result.opponentCard.name}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: opponentColor }}>+{result.opponentKnock} KNC</div>
          </div>
        </div>
      </div>

      {/* Effect callout banner */}
      {result.effect && (() => {
        const { label, color } = getEffectLabel(result.effect);
        return (
          <div style={{
            position: "absolute", top: 90, left: "50%",
            animation: fadeOut
              ? "effectBannerOut 0.3s ease forwards"
              : "effectBannerIn 0.5s 0.3s cubic-bezier(0.22,1,0.36,1) both",
            zIndex: 10,
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 28px",
            background: `linear-gradient(90deg, rgba(0,0,0,0) 0%, ${color}22 20%, ${color}33 50%, ${color}22 80%, rgba(0,0,0,0) 100%)`,
            borderTop: `1.5px solid ${color}80`,
            borderBottom: `1.5px solid ${color}80`,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
            <span style={{
              fontSize: 28, fontWeight: 900, letterSpacing: 6,
              color,
              textShadow: `0 0 20px ${color}, 0 0 40px ${color}80`,
              fontFamily: "inherit",
            }}>{label}</span>
            <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
          </div>
        );
      })()}

      {/* Description */}
      <div style={{
        position: "absolute", bottom: 220, left: "50%", transform: "translateX(-50%)",
        maxWidth: 560, textAlign: "center",
        fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.75)", lineHeight: 1.6,
        animation: "descriptionFade 0.4s 1s ease forwards", opacity: 0,
        padding: "16px 32px",
        backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 10,
        border: `1.5px solid ${winnerColor}50`,
        boxShadow: `0 0 24px ${winnerColor}20`,
      }}>
        <div style={{
          fontSize: 18, fontWeight: 800,
          color: "#fff",
          lineHeight: 1.5,
          letterSpacing: 0.3,
          textShadow: `0 0 10px ${winnerColor}80`,
        }}>{result.description}</div>
      </div>
    </div>
  );
}

export default function Gameplay() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const {
    selectedCharacter,
    opponentCharacter,
    currentOrder,
    opponentOrder,
    roundNumber,
    playerRoundsWon,
    opponentRoundsWon,
    finishRound,
    nextRound,
    resetMatch,
    currentRoundResult,
    matchPhase,
    playerPoints,
    pointsThisRound,
    precomputedRound,
    matchId,
    wagerActive,
    wagerCurrency,
    winStreak,
  } = useGameStore();
  const { address } = useAccount();

  // Payout state
  const [payoutState, setPayoutState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [payoutTxHash, setPayoutTxHash] = useState<string | null>(null);

  const playerCards = currentOrder.filter((c): c is Card => c !== null);
  const [revealedSlots, setRevealedSlots] = useState(0);
  const [slotResults, setSlotResults] = useState<SlotResult[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [totalPlayerKnock, setTotalPlayerKnock] = useState(0);
  const [totalOpponentKnock, setTotalOpponentKnock] = useState(0);
  const [flashEffect, setFlashEffect] = useState<"player" | "opponent" | "draw" | null>(null);
  const [clashAnim, setClashAnim] = useState<{ result: SlotResult; fadeOut: boolean } | null>(null);
  const [muted, setMutedState] = useState(false);

  // Start background music on mount
  useEffect(() => {
    startBgMusic();
    return () => stopBgMusic();
  }, []);

  useEffect(() => {
    if (!selectedCharacter || !opponentCharacter) {
      console.warn("Gameplay rendered without player/opponent state. Redirecting...");
      const t = setTimeout(() => router.push("/select-character"), 1500);
      return () => clearTimeout(t);
    }
  }, [selectedCharacter, opponentCharacter, router]);

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

  const revealNextSlot = useCallback(() => {
    if (revealedSlots >= 5 || isAnimating) return;
    setIsAnimating(true);

    const idx = revealedSlots;
    const pCard = playerCards[idx];
    const oCard = opponentOrder[idx];
    if (!pCard || !oCard) return;

    const result = precomputedRound?.[idx];
    if (!result) return;

    // Play clash sound + show cinematic
    playSound("clash");
    setClashAnim({ result, fadeOut: false });

    // After 3.5s start fade-out
    setTimeout(() => setClashAnim({ result, fadeOut: true }), 3500);

    // After cinematic fully done, commit result to state (4 seconds)
    setTimeout(() => {
      setClashAnim(null);
      setSlotResults((prev) => [...prev, result]);
      setFlashEffect(result.winner);
      setTimeout(() => setFlashEffect(null), 500);
      setTotalPlayerKnock((p) => p + result.playerKnock);
      setTotalOpponentKnock((p) => p + result.opponentKnock);
      setRevealedSlots(idx + 1);
      setTimeout(() => setIsAnimating(false), 300);
    }, 3900);
  }, [revealedSlots, isAnimating, playerCards, opponentOrder, precomputedRound]);

  // Auto-reveal all slots with delay
  const autoReveal = useCallback(() => {
    let delay = 0;
    for (let i = revealedSlots; i < 5; i++) {
      setTimeout(() => {
        const pCard = playerCards[i];
        const oCard = opponentOrder[i];
        if (!pCard || !oCard) return;

        playSound("clash");
        const result = precomputedRound?.[i];
        if (!result) return;

        setClashAnim({ result, fadeOut: false });
        setTimeout(() => setClashAnim({ result, fadeOut: true }), 3500);

        setTimeout(() => {
          setClashAnim(null);
          setSlotResults((prev) => [...prev, result]);
          setFlashEffect(result.winner);
          setTimeout(() => setFlashEffect(null), 400);
          setTotalPlayerKnock((p) => p + result.playerKnock);
          setTotalOpponentKnock((p) => p + result.opponentKnock);
          setRevealedSlots(i + 1);
        }, 3900);
      }, delay);
      delay += 4100;
    }
    setTimeout(() => {
      finishRound();
      setShowResult(true);
      playSound("roundEnd");
    }, delay + 500);
  }, [revealedSlots, playerCards, opponentOrder, finishRound, precomputedRound]);

  // Show round result after all slots revealed
  useEffect(() => {
    if (revealedSlots === 5 && !showResult && slotResults.length === 5) {
      setTimeout(() => {
        finishRound();
        setShowResult(true);
      }, 1000);
    }
  }, [revealedSlots, showResult, slotResults, finishRound]);

  const handleNextRound = () => {
    playSound("click");
    setRevealedSlots(0);
    setSlotResults([]);
    setShowResult(false);
    setTotalPlayerKnock(0);
    setTotalOpponentKnock(0);
    nextRound();
    router.push("/loadout");
  };

  const handleClaimPayout = async () => {
    if (!address || !matchId || payoutState !== "idle") return;
    setPayoutState("loading");
    try {
      const res = await fetch("/api/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner: address, matchId, currency: wagerCurrency }),
      });
      const data = await res.json() as { txHash?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Payout failed");
      setPayoutTxHash(data.txHash ?? null);
      setPayoutState("done");
    } catch (e) {
      console.error(e);
      setPayoutState("error");
    }
  };

  // Record match result on leaderboard (fire-and-forget)
  useEffect(() => {
    if (matchPhase !== "match-end" || !address) return;
    const won = playerRoundsWon > opponentRoundsWon;
    void fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerAddress: address, won, pointsEarned: pointsThisRound, wagered: wagerActive }),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchPhase]);

  const handleBackToMenu = () => {
    playSound(isMatchEnd ? "gameOver" : "click");
    resetMatch();
    stopBgMusic();
    router.push("/");
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  const player = selectedCharacter;
  const opponent = opponentCharacter;

  // Calculate HP bars based on knock
  const maxHP = 40;
  const playerHP = Math.max(0, maxHP - totalOpponentKnock);
  const opponentHP = Math.max(0, maxHP - totalPlayerKnock);

  // When round ends, drain the loser's HP to 0
  const roundWinner = currentRoundResult?.roundWinner;
  const displayPlayerHP = showResult && roundWinner === "opponent" ? 0 : playerHP;
  const displayOpponentHP = showResult && roundWinner === "player" ? 0 : opponentHP;

  const isMatchEnd = matchPhase === "match-end";
  const payoutTokenSymbol = wagerCurrency === "celo" ? "CELO" : "cUSD";
  const payoutAmountDisplay = `${formatUnits(PAYOUT_AMOUNT, 18)} ${payoutTokenSymbol}`;

  if (!selectedCharacter || !opponentCharacter) {
    return (
      <div style={{ width: "100vw", height: "100vh", backgroundColor: "#050505", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
        <p>Redirecting to character select...</p>
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      {/* Inject clash animation keyframes */}
      <style dangerouslySetInnerHTML={{ __html: CLASH_STYLES }} />
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, transformOrigin: "top left", position: "relative" }}>

        {/* Background */}
        <img src={BG_MAIN} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />


        {/* Flash Effect */}
        {flashEffect && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 50, pointerEvents: "none",
            backgroundColor: flashEffect === "player" ? "rgba(6,168,249,0.15)" : flashEffect === "opponent" ? "rgba(249,6,168,0.15)" : "rgba(255,255,255,0.08)",
            transition: "opacity 0.3s ease",
          }} />
        )}

        {/* ── HUD ──────────────────────────────────────────── */}
        <div style={{ position: "absolute", top: 16, left: 32, right: 32, display: "flex", alignItems: "flex-start", gap: 12, zIndex: 10 }}>

          {/* P1 block */}
          <div style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", border: "1px solid rgba(6,168,249,0.15)", borderRadius: 4, padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px", color: "white", textTransform: "uppercase", textShadow: "0 0 12px rgba(6,168,249,0.6)" }}>{player?.name || "PLAYER"}</span>
              <span style={{ fontSize: 10, letterSpacing: "1px", fontWeight: 500, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{player?.className}</span>
            </div>
            <div style={{ position: "relative", height: 16, backgroundColor: "rgba(0,0,0,0.7)", border: "1px solid rgba(6,168,249,0.2)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, width: `${(displayPlayerHP / maxHP) * 100}%`, background: "linear-gradient(90deg, #034e75 0%, #06a8f9 60%, #06d4f9 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)", transition: "width 0.8s ease" }} />
              <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(90deg, transparent 0px, transparent 28px, rgba(0,0,0,0.15) 28px, rgba(0,0,0,0.15) 30px)" }} />
            </div>
            <div style={{ display: "flex", gap: 5, marginTop: 7 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: i < playerRoundsWon ? "#06a8f9" : "transparent", border: "1.5px solid rgba(6,168,249,0.6)", boxShadow: i < playerRoundsWon ? "0 0 8px #06a8f9" : "none" }} />
              ))}
            </div>
          </div>

          {/* Centre: Round + Timer */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 120, paddingTop: 2 }}>
            <div style={{ backgroundColor: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3, padding: "2px 14px 4px", marginBottom: 4, backdropFilter: "blur(4px)" }}>
              <span style={{ fontSize: 9, letterSpacing: "3px", fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", display: "block", textAlign: "center" }}>ROUND</span>
              <span style={{ fontSize: 36, lineHeight: "34px", fontWeight: 700, letterSpacing: "-2px", color: "white", display: "block", textAlign: "center" }}>{roundNumber}</span>
            </div>
            <div style={{ backgroundColor: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 3, padding: "4px 18px", backdropFilter: "blur(4px)" }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "2px", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", textAlign: "center", display: "block" }}>
                SLOT {Math.min(revealedSlots + 1, 5)} / 5
              </span>
            </div>
          </div>

          {/* P2 block */}
          <div style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", border: `1px solid ${opponent?.color || "#f906a8"}15`, borderRadius: 4, padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, letterSpacing: "1px", fontWeight: 500, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{opponent?.className}</span>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px", color: "white", textTransform: "uppercase", textShadow: `0 0 12px ${opponent?.color || "#f906a8"}99` }}>{opponent?.name || "OPPONENT"}</span>
            </div>
            <div style={{ position: "relative", height: 16, backgroundColor: "rgba(0,0,0,0.7)", border: `1px solid ${opponent?.color || "#f906a8"}33`, borderRadius: 2, overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, width: `${(displayOpponentHP / maxHP) * 100}%`, background: `linear-gradient(270deg, ${opponent?.color || "#f906a8"}88 0%, ${opponent?.color || "#f906a8"} 60%, ${opponent?.color || "#f906d4"} 100%)`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)", transition: "width 0.8s ease" }} />
              <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(90deg, transparent 0px, transparent 28px, rgba(0,0,0,0.15) 28px, rgba(0,0,0,0.15) 30px)" }} />
            </div>
            <div style={{ display: "flex", gap: 5, marginTop: 7, justifyContent: "flex-end" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: i < opponentRoundsWon ? (opponent?.color || "#f906a8") : "transparent", border: `1.5px solid ${opponent?.color || "#f906a8"}99`, boxShadow: i < opponentRoundsWon ? `0 0 8px ${opponent?.color}` : "none" }} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Total Points Panel ───────────────────────────── */}
        <div style={{ position: "absolute", top: 96, left: 32, zIndex: 10, backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 4, padding: "8px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <span className="material-icons" style={{ color: "#fbbf24", fontSize: 22, textShadow: "0 0 10px rgba(251,191,36,0.6)" }}>stars</span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 9, letterSpacing: 1, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", fontWeight: 700 }}>Total Score</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: "#fbbf24", fontVariantNumeric: "tabular-nums", lineHeight: 1, textShadow: "0 0 12px rgba(251,191,36,0.4)" }}>
              {playerPoints.toLocaleString()}
            </span>
          </div>
        </div>

        {/* ── Combat Resolution Area ────────────────────────── */}
        <div style={{ position: "absolute", top: 120, left: 0, right: 0, bottom: 270, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, zIndex: 5 }}>

          {/* Knock Totals */}
          <div style={{ display: "flex", gap: 60, alignItems: "center", marginBottom: 8 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "#06a8f9" }}>YOUR KNOCK</div>
              <div style={{ fontSize: 48, fontWeight: 700, color: "white", textShadow: "0 0 20px rgba(6,168,249,0.5)", fontVariantNumeric: "tabular-nums" }}>{totalPlayerKnock}</div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.2)" }}>—</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: opponent?.color || "#f906a8" }}>OPP KNOCK</div>
              <div style={{ fontSize: 48, fontWeight: 700, color: "white", textShadow: `0 0 20px ${opponent?.color || "#f906a8"}80`, fontVariantNumeric: "tabular-nums" }}>{totalOpponentKnock}</div>
            </div>
          </div>

          {/* Current Slot Display */}
          {slotResults.length > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 40,
              backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "20px 40px",
            }}>
              {/* Last revealed slot result */}
              {(() => {
                const last = slotResults[slotResults.length - 1];
                return (
                  <>
                    {/* Player card */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 110, height: 153, borderRadius: 6, position: "relative", overflow: "hidden", border: `2px solid ${last.winner === "player" ? "#4ade80" : last.winner === "draw" ? "yellow" : "#ef4444"}`, boxShadow: last.winner === "player" ? "0 0 20px rgba(74,222,128,0.4)" : "none" }}>
                        <img src={last.playerCard.image} alt={last.playerCard.name} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover" }} />
                        {last.winner === "player" && <div style={{ position: "absolute", inset: 0, border: "3px solid #4ade80", borderRadius: 4, pointerEvents: "none" }} />}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "white" }}>{last.playerCard.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#06a8f9" }}>+{last.playerKnock} KNC</span>
                    </div>

                    {/* VS */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>VS</span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, padding: "4px 10px", borderRadius: 4,
                        backgroundColor: last.winner === "player" ? "rgba(6,168,249,0.2)" : last.winner === "opponent" ? "rgba(249,6,168,0.2)" : "rgba(255,255,0,0.2)",
                        color: last.winner === "player" ? "#06a8f9" : last.winner === "opponent" ? (opponent?.color || "#f906a8") : "#fbbf24",
                      }}>
                        {last.winner === "player" ? "WIN" : last.winner === "opponent" ? "LOSE" : "DRAW"}
                      </span>
                    </div>

                    {/* Opponent card */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 110, height: 153, borderRadius: 6, position: "relative", overflow: "hidden", border: `2px solid ${last.winner === "opponent" ? "#4ade80" : last.winner === "draw" ? "yellow" : "#ef4444"}`, boxShadow: last.winner === "opponent" ? "0 0 20px rgba(74,222,128,0.4)" : "none" }}>
                        <img src={last.opponentCard.image} alt={last.opponentCard.name} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover" }} />
                        {last.winner === "opponent" && <div style={{ position: "absolute", inset: 0, border: "3px solid #4ade80", borderRadius: 4, pointerEvents: "none" }} />}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "white" }}>{last.opponentCard.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: opponent?.color || "#f906a8" }}>+{last.opponentKnock} KNC</span>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Combat message callout */}
          {slotResults.length > 0 && (() => {
            const last = slotResults[slotResults.length - 1];
            const msgColor = last.winner === "player" ? "#06a8f9" : last.winner === "opponent" ? (opponent?.color || "#f906a8") : "#fbbf24";
            return (
              <div key={slotResults.length} style={{
                maxWidth: 620,
                textAlign: "center",
                padding: "14px 28px",
                borderRadius: 8,
                backgroundColor: `${msgColor}12`,
                border: `1.5px solid ${msgColor}50`,
                boxShadow: `0 0 20px ${msgColor}20`,
                animation: "descriptionFade 0.5s ease forwards",
              }}>
                <div style={{
                  fontSize: 18, fontWeight: 800,
                  color: "#fff",
                  letterSpacing: 0.5,
                  lineHeight: 1.5,
                  textShadow: `0 0 12px ${msgColor}80`,
                }}>
                  {last.description}
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Slot Timeline — raised, loadout-style panel ────── */}

        {/* Panel — matches loadout bottom deck panel exactly */}
        <div style={{
          position: "absolute",
          left: 100, top: 565,
          width: 1240, height: 215,
          backgroundColor: "rgba(15, 25, 40, 0.92)",
          border: "2px solid rgba(90, 191, 230, 0.4)",
          borderRadius: 10,
          backdropFilter: "blur(16px)",
          boxShadow: "0 4px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(90,191,230,0.2)",
          display: "flex", flexDirection: "column", alignItems: "center",
          zIndex: 10,
        }}>

          {/* Badge label — identical to loadout "DECK LOADOUT" badge */}
          <div style={{
            position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
            backgroundColor: "#0f1a2e",
            border: "2px solid #5abfe6",
            borderRadius: 6,
            padding: "4px 24px",
            boxShadow: "0 0 12px rgba(90, 191, 230, 0.5)",
          }}>
            <span style={{
              fontSize: 14, fontWeight: 800, textTransform: "uppercase",
              letterSpacing: 3, color: "#5abfe6",
              textShadow: "0 0 8px rgba(90,191,230,0.6)",
            }}>SLOT TIMELINE</span>
          </div>

          {/* Slot cards row */}
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginTop: 28 }}>
            {[0, 1, 2, 3, 4].map((i) => {
              const revealed = i < revealedSlots;
              const pCard = playerCards[i];
              const oCard = opponentOrder[i];
              const result = slotResults[i];
              const isActive = i === revealedSlots && !showResult;

              const slotBorderColor = revealed
                ? (result?.winner === "player" ? "#4ade80" : result?.winner === "opponent" ? "#ef4444" : "#fbbf24")
                : "rgba(90,191,230,0.2)";

              return (
                <div key={i} style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                  opacity: revealed ? 1 : isActive ? 0.85 : 0.3,
                  transform: isActive ? "scale(1.1)" : "scale(1)",
                  transition: "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                }}>
                  {/* Slot label */}
                  <span style={{
                    fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2,
                    color: revealed
                      ? (result?.winner === "player" ? "#06a8f9" : result?.winner === "opponent" ? (opponent?.color || "#f906a8") : "#fbbf24")
                      : "rgba(90,191,230,0.5)",
                    textShadow: revealed ? "0 0 8px currentColor" : "none",
                  }}>
                    SLOT {i + 1}
                  </span>

                  {/* Card pair */}
                  <div style={{ display: "flex", gap: 3 }}>
                    {/* Player mini card */}
                    <div style={{
                      width: 56, height: 76, borderRadius: 5, position: "relative", overflow: "hidden",
                      backgroundColor: "rgba(0,0,0,0.4)",
                      border: `2px solid ${revealed && result ? slotBorderColor : "rgba(90,191,230,0.15)"}`,
                      boxShadow: revealed && result
                        ? `0 0 10px ${slotBorderColor}40, inset 0 0 6px rgba(90,191,230,0.1)`
                        : "inset 0 0 8px rgba(0,0,0,0.4)",
                      transition: "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                    }}>
                      {revealed && pCard ? (
                        <img src={pCard.image} alt={pCard.name} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span className="material-icons" style={{ fontSize: 14, color: "rgba(90,191,230,0.15)" }}>help_outline</span>
                        </div>
                      )}
                    </div>
                    {/* Opponent mini card */}
                    <div style={{
                      width: 56, height: 76, borderRadius: 5, position: "relative", overflow: "hidden",
                      backgroundColor: "rgba(0,0,0,0.4)",
                      border: `2px solid ${revealed && result ? slotBorderColor : "rgba(90,191,230,0.15)"}`,
                      boxShadow: revealed && result
                        ? `0 0 10px ${slotBorderColor}40, inset 0 0 6px rgba(90,191,230,0.1)`
                        : "inset 0 0 8px rgba(0,0,0,0.4)",
                      transition: "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                    }}>
                      {revealed && oCard ? (
                        <img src={oCard.image} alt={oCard.name} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span className="material-icons" style={{ fontSize: 14, color: "rgba(90,191,230,0.15)" }}>help_outline</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Result badge */}
                  {revealed && result ? (
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4,
                      backgroundColor: result.winner === "player" ? "rgba(6,168,249,0.2)" : result.winner === "opponent" ? "rgba(249,6,168,0.2)" : "rgba(255,215,0,0.15)",
                      border: `1px solid ${result.winner === "player" ? "rgba(6,168,249,0.4)" : result.winner === "opponent" ? "rgba(249,6,168,0.4)" : "rgba(255,215,0,0.3)"}`,
                      color: result.winner === "player" ? "#06a8f9" : result.winner === "opponent" ? (opponent?.color || "#f906a8") : "#fbbf24",
                      textTransform: "uppercase", letterSpacing: 1,
                    }}>
                      {result.winner === "player" ? `+${result.playerKnock}` : result.winner === "opponent" ? `-${result.opponentKnock}` : "DRAW"}
                    </span>
                  ) : (
                    <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(90,191,230,0.2)", letterSpacing: 1 }}>—</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action buttons — styled like loadout Lock Sequence */}
          <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
            {!showResult && revealedSlots < 5 && (
              <>
                <button
                  onClick={!isAnimating ? revealNextSlot : undefined}
                  className="ko-btn ko-btn-primary"
                  style={{
                    padding: "9px 28px",
                    cursor: isAnimating ? "wait" : "pointer",
                    opacity: isAnimating ? 0.5 : 1,
                  }}
                >
                  <span className="ko-btn-text" style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 3, color: "#fff" }}>REVEAL SLOT</span>
                  <span className="material-icons ko-btn-icon" style={{ fontSize: 16, color: "#fff" }}>play_arrow</span>
                </button>
                <button
                  onClick={autoReveal}
                  className="ko-btn ko-btn-secondary"
                  style={{ padding: "9px 24px" }}
                >
                  <span className="ko-btn-text" style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "rgba(255,255,255,0.9)" }}>AUTO REVEAL</span>
                  <span className="material-icons ko-btn-icon" style={{ fontSize: 15, color: "rgba(255,255,255,0.9)" }}>double_arrow</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Round Result Screen ──────────────────────────────────────────────── */}
        {showResult && currentRoundResult && !isMatchEnd && (() => {
          const won = roundWinner === "player";
          const accentColor = won ? "#06a8f9" : roundWinner === "opponent" ? (opponent?.color || "#f906a8") : "#fbbf24";
          const accentGlow  = won ? "rgba(6,168,249,0.5)" : roundWinner === "opponent" ? `${opponent?.color || "#f906a8"}80` : "rgba(251,191,36,0.4)";
          return (
            <div style={{ position: "absolute", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "absolute", inset: 0, backgroundColor: "#050510", zIndex: -1 }} />
              <img src={BG_MAIN} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.18, zIndex: -1, pointerEvents: "none" }} />

              <div style={{ position: "relative", width: 540 }}>
                {/* Corner accents */}
                {[
                  { top: -12, left: -12, borderLeft: `1.5px solid ${accentColor}`, borderTop: `1.5px solid ${accentColor}` },
                  { top: -12, right: -12, borderRight: `1.5px solid ${accentColor}`, borderTop: `1.5px solid ${accentColor}` },
                  { bottom: -12, left: -12, borderLeft: `1.5px solid ${accentColor}`, borderBottom: `1.5px solid ${accentColor}` },
                  { bottom: -12, right: -12, borderRight: `1.5px solid ${accentColor}`, borderBottom: `1.5px solid ${accentColor}` },
                ].map((s, i) => (
                  <div key={i} style={{ position: "absolute", width: 36, height: 36, ...s }} />
                ))}

                {/* Glass panel */}
                <div style={{
                  backgroundColor: "rgba(15, 23, 42, 0.4)",
                  border: `2.4px solid ${accentColor}`,
                  borderRadius: 6,
                  backdropFilter: "blur(4.5px)",
                  padding: "48px 48px 40px",
                  position: "relative",
                  overflow: "hidden",
                  boxShadow: `0 0 40px ${accentGlow}`,
                }}>
                  {/* Scanline */}
                  <div style={{ position: "absolute", top: -2, left: -2, right: -2, height: 1.5, backgroundColor: accentColor }} />

                  {/* Heading */}
                  <div style={{ textAlign: "center", marginBottom: 32 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 4, color: "#6b7280", textTransform: "uppercase", marginBottom: 10 }}>
                      Round {roundNumber}
                    </p>
                    <h2 style={{ fontSize: 56, fontWeight: 800, color: accentColor, textTransform: "uppercase", letterSpacing: -1, margin: 0, lineHeight: "56px", textShadow: `0 0 30px ${accentGlow}` }}>
                      {won ? "VICTORY" : roundWinner === "opponent" ? "DEFEAT" : "DRAW"}
                    </h2>
                    <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 10 }}>
                      {won ? "You won this round" : roundWinner === "opponent" ? `${opponent?.name ?? "Opponent"} wins this round` : "This round is a draw"}
                    </p>
                  </div>

                  {/* Knock scores */}
                  <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                    <div style={{ flex: 1, backgroundColor: "rgba(17,10,24,0.5)", border: "1px solid #334155", borderRadius: 8, padding: "16px", textAlign: "center" }}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#6b7280", marginBottom: 6 }}>Your Knock</p>
                      <p style={{ fontSize: 36, fontWeight: 800, color: "white", margin: 0, lineHeight: 1 }}>{currentRoundResult.totalPlayerKnock}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28 }}>
                      <span style={{ fontSize: 18, color: "#334155", fontWeight: 700 }}>—</span>
                    </div>
                    <div style={{ flex: 1, backgroundColor: "rgba(17,10,24,0.5)", border: "1px solid #334155", borderRadius: 8, padding: "16px", textAlign: "center" }}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#6b7280", marginBottom: 6 }}>Opp Knock</p>
                      <p style={{ fontSize: 36, fontWeight: 800, color: "white", margin: 0, lineHeight: 1 }}>{currentRoundResult.totalOpponentKnock}</p>
                    </div>
                  </div>

                  {/* Points + rounds tracker */}
                  <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
                    <div style={{ flex: 1, backgroundColor: "rgba(17,10,24,0.5)", border: "1px solid #334155", borderRadius: 8, padding: "14px", textAlign: "center" }}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#6b7280", marginBottom: 4 }}>Your Rounds</p>
                      <p style={{ fontSize: 24, fontWeight: 800, color: "#06a8f9", margin: 0 }}>{playerRoundsWon} / 3</p>
                    </div>
                    <div style={{ flex: 1, backgroundColor: "rgba(17,10,24,0.5)", border: "1px solid #334155", borderRadius: 8, padding: "14px", textAlign: "center" }}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#6b7280", marginBottom: 4 }}>Opp Rounds</p>
                      <p style={{ fontSize: 24, fontWeight: 800, color: opponent?.color || "#f906a8", margin: 0 }}>{opponentRoundsWon} / 3</p>
                    </div>
                    {pointsThisRound > 0 && (
                      <div style={{ flex: 1, backgroundColor: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 8, padding: "14px", textAlign: "center" }}>
                        <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#fbbf24", marginBottom: 4 }}>Points</p>
                        <p style={{ fontSize: 24, fontWeight: 800, color: "#fbbf24", margin: 0 }}>+{pointsThisRound}</p>
                      </div>
                    )}
                  </div>

                  {/* Next round button */}
                  <button onClick={handleNextRound} className="ko-btn ko-btn-primary" style={{ width: "100%", padding: "15px 0" }}>
                    <span className="material-icons ko-btn-icon" style={{ fontSize: 18 }}>arrow_forward</span>
                    <span className="ko-btn-text" style={{ fontSize: 15, fontWeight: 700, textTransform: "uppercase", letterSpacing: 6, color: "#fff" }}>
                      Next Round
                    </span>
                    <span className="material-icons ko-btn-icon" style={{ fontSize: 18 }}>arrow_forward_ios</span>
                  </button>

                  {/* Divider + quit */}
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 20 }}>
                    <div style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
                    <button
                      onClick={handleBackToMenu}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit" }}
                    >
                      Quit Match
                    </button>
                    <div style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Match End Screen ─────────────────────────────────────────────────── */}
        {showResult && currentRoundResult && isMatchEnd && (() => {
          const won = roundWinner === "player";
          const accentColor = won ? "#06a8f9" : (opponent?.color || "#f906a8");
          const accentGlow  = won ? "rgba(6,168,249,0.5)" : `${opponent?.color || "#f906a8"}80`;
          const winnerChar = won ? selectedCharacter : opponent;
          const finisherVideo = winnerChar?.finisherVideo ?? "/new-assets/action-solo-burst.webm";
          return (
            <div style={{ position: "absolute", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* Background */}
              <div style={{ position: "absolute", inset: 0, backgroundColor: "#050510", zIndex: -1 }} />
              {/* Winner finisher video */}
              <video key={finisherVideo} autoPlay loop muted playsInline
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.28, zIndex: -1, pointerEvents: "none" }}>
                <source src={finisherVideo} type="video/webm" />
              </video>

              {/* Centered layout — matches join page exactly */}
              <div style={{ position: "relative", width: 540 }}>

                {/* Corner accents */}
                {[
                  { top: -12, left: -12, borderLeft: `1.5px solid ${accentColor}`, borderTop: `1.5px solid ${accentColor}` },
                  { top: -12, right: -12, borderRight: `1.5px solid ${accentColor}`, borderTop: `1.5px solid ${accentColor}` },
                  { bottom: -12, left: -12, borderLeft: `1.5px solid ${accentColor}`, borderBottom: `1.5px solid ${accentColor}` },
                  { bottom: -12, right: -12, borderRight: `1.5px solid ${accentColor}`, borderBottom: `1.5px solid ${accentColor}` },
                ].map((s, i) => (
                  <div key={i} style={{ position: "absolute", width: 36, height: 36, ...s }} />
                ))}

                {/* Glass panel */}
                <div style={{
                  backgroundColor: "rgba(15, 23, 42, 0.4)",
                  border: `2.4px solid ${accentColor}`,
                  borderRadius: 6,
                  backdropFilter: "blur(4.5px)",
                  padding: "48px 48px 40px",
                  position: "relative",
                  overflow: "hidden",
                  boxShadow: `0 0 40px ${accentGlow}`,
                }}>
                  {/* Scanline */}
                  <div style={{ position: "absolute", top: -2, left: -2, right: -2, height: 1.5, backgroundColor: accentColor }} />

                  {/* Heading */}
                  <div style={{ textAlign: "center", marginBottom: 32 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 4, color: "#6b7280", textTransform: "uppercase", marginBottom: 10 }}>
                      Match Complete
                    </p>
                    <h2 style={{ fontSize: 56, fontWeight: 800, color: accentColor, textTransform: "uppercase", letterSpacing: -1, margin: 0, lineHeight: "56px", textShadow: `0 0 30px ${accentGlow}` }}>
                      {won ? "VICTORY" : roundWinner === "opponent" ? "DEFEAT" : "DRAW"}
                    </h2>
                    <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 10 }}>
                      {won
                        ? `You defeated ${opponent?.name ?? "your opponent"}`
                        : `${opponent?.name ?? "Opponent"} wins this match`}
                    </p>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                    {/* Rounds */}
                    <div style={{ flex: 1, backgroundColor: "rgba(17,10,24,0.5)", border: "1px solid #334155", borderRadius: 8, padding: "16px", textAlign: "center" }}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#6b7280", marginBottom: 6 }}>Your Rounds</p>
                      <p style={{ fontSize: 32, fontWeight: 800, color: "#06a8f9", margin: 0, lineHeight: 1 }}>{playerRoundsWon}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28 }}>
                      <span style={{ fontSize: 18, color: "#334155", fontWeight: 700 }}>—</span>
                    </div>
                    <div style={{ flex: 1, backgroundColor: "rgba(17,10,24,0.5)", border: "1px solid #334155", borderRadius: 8, padding: "16px", textAlign: "center" }}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#6b7280", marginBottom: 6 }}>Opp Rounds</p>
                      <p style={{ fontSize: 32, fontWeight: 800, color: opponent?.color || "#f906a8", margin: 0, lineHeight: 1 }}>{opponentRoundsWon}</p>
                    </div>
                  </div>

                  {/* Total knock */}
                  <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                    <div style={{ flex: 1, backgroundColor: "rgba(17,10,24,0.5)", border: "1px solid #334155", borderRadius: 8, padding: "14px", textAlign: "center" }}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#6b7280", marginBottom: 4 }}>Your Knock</p>
                      <p style={{ fontSize: 26, fontWeight: 800, color: "white", margin: 0 }}>{currentRoundResult.totalPlayerKnock}</p>
                    </div>
                    <div style={{ flex: 1, backgroundColor: "rgba(17,10,24,0.5)", border: "1px solid #334155", borderRadius: 8, padding: "14px", textAlign: "center" }}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#6b7280", marginBottom: 4 }}>Opp Knock</p>
                      <p style={{ fontSize: 26, fontWeight: 800, color: "white", margin: 0 }}>{currentRoundResult.totalOpponentKnock}</p>
                    </div>
                    {pointsThisRound > 0 && (
                      <div style={{ flex: 1, backgroundColor: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 8, padding: "14px", textAlign: "center" }}>
                        <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#fbbf24", marginBottom: 4 }}>Points</p>
                        <p style={{ fontSize: 26, fontWeight: 800, color: "#fbbf24", margin: 0 }}>+{pointsThisRound}</p>
                      </div>
                    )}
                  </div>

                  {/* Total points */}
                  <div style={{ backgroundColor: "rgba(17,10,24,0.5)", border: `1px solid ${accentColor}40`, borderRadius: 8, padding: "14px", textAlign: "center", marginBottom: 28 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "#6b7280", marginBottom: 4 }}>Total Points</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: accentColor, margin: 0, textShadow: `0 0 12px ${accentGlow}` }}>{playerPoints} PTS</p>
                  </div>

                  {/* Wager payout — only shown when player wagered and won */}
                  {wagerActive && won && (
                    <div style={{ marginBottom: 20 }}>
                      {payoutState === "idle" && (
                        <button
                          onClick={() => void handleClaimPayout()}
                          style={{
                            width: "100%", padding: "14px 0",
                            background: "linear-gradient(135deg, rgba(74,222,128,0.15), rgba(74,222,128,0.05))",
                            border: "1.5px solid #4ade80",
                            borderRadius: 6, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                            fontFamily: "inherit",
                          }}
                        >
                          <span className="material-icons" style={{ fontSize: 20, color: "#4ade80" }}>payments</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#4ade80", textTransform: "uppercase", letterSpacing: 3 }}>
                            Claim {payoutAmountDisplay}
                          </span>
                        </button>
                      )}
                      {payoutState === "loading" && (
                        <div style={{ textAlign: "center", padding: "14px 0" }}>
                          <span style={{ fontSize: 13, color: "#b9e7f4", letterSpacing: 1 }}>Sending payout…</span>
                        </div>
                      )}
                      {payoutState === "done" && (
                        <div style={{ textAlign: "center", padding: "14px 0" }}>
                          <span style={{ fontSize: 13, color: "#4ade80", letterSpacing: 0.5 }}>
                            ✓ {payoutAmountDisplay} sent!{" "}
                            {payoutTxHash && (
                              <span style={{ fontSize: 11, color: "#6b7280", wordBreak: "break-all" }}>
                                tx: {payoutTxHash.slice(0, 14)}…
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                      {payoutState === "error" && (
                        <div style={{ textAlign: "center", padding: "14px 0" }}>
                          <span style={{ fontSize: 12, color: "#f87171" }}>Payout failed — contact support with match ID: {matchId}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Win streak banner */}
                  {won && winStreak >= 2 && (
                    <div style={{ marginBottom: 16, padding: "10px 16px", borderRadius: 6, background: winStreak >= 5 ? "rgba(251,191,36,0.12)" : "rgba(234,88,12,0.1)", border: `1px solid ${winStreak >= 5 ? "rgba(251,191,36,0.4)" : "rgba(234,88,12,0.4)"}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18 }}>🔥</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: winStreak >= 5 ? "#fbbf24" : "#fb923c", letterSpacing: 1, textTransform: "uppercase" }}>
                          {winStreak} WIN STREAK
                        </span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: winStreak >= 5 ? "#fbbf24" : "#fb923c", letterSpacing: 0.5 }}>
                        {winStreak >= 5 ? "2× BONUS" : "1.5× BONUS"} ACTIVE
                      </span>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 0 }}>
                    {/* Play Again — primary */}
                    <button
                      onClick={() => { resetMatch(); router.push("/select-character"); }}
                      style={{ flex: 2, height: 52, background: "linear-gradient(135deg, #1a3a52, #0f2233)", border: "1.5px solid #56a4cb", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 14, letterSpacing: 2, color: "#b9e7f4", textTransform: "uppercase", clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%)", boxShadow: "0 0 18px rgba(86,164,203,0.2)" }}
                    >
                      ⚔ PLAY AGAIN
                    </button>
                    {/* Return to Menu — secondary */}
                    <button onClick={handleBackToMenu} style={{ flex: 1, height: 52, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12, letterSpacing: 1.5, color: "#6b7280", textTransform: "uppercase" }}>
                      MENU
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
        {/* ── Clash Cinematic Overlay ── */}
        {clashAnim && (
          <ClashCinematic
            result={clashAnim.result}
            opponentColor={opponent?.color || "#f906a8"}
            fadeOut={clashAnim.fadeOut}
          />
        )}

        {/* ── Floating Mute Toggle ── */}
        <div
          onClick={toggleMute}
          title={muted ? "Unmute" : "Mute"}
          style={{
            position: "absolute", bottom: 240, right: 24,
            width: 48, height: 48, borderRadius: "50%",
            backgroundColor: muted ? "rgba(239,68,68,0.15)" : "rgba(15,25,40,0.9)",
            border: muted ? "2px solid rgba(239,68,68,0.6)" : "2px solid #5abfe6",
            boxShadow: muted
              ? "0 0 16px rgba(239,68,68,0.4)"
              : "0 0 16px rgba(90,191,230,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", zIndex: 50,
            backdropFilter: "blur(8px)",
            transition: "all 0.2s ease",
          }}
        >
          <span className="material-icons" style={{
            fontSize: 22,
            color: muted ? "rgba(239,68,68,0.9)" : "#5abfe6",
          }}>
            {muted ? "volume_off" : "volume_up"}
          </span>
        </div>

      </div>
    </div>
  );
}
