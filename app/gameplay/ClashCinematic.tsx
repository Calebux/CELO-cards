"use client";

import { Card, CardType } from "../lib/gameData";
import { SlotResult } from "../lib/combatEngine";

export function getTypeColor(type: CardType): string {
  switch (type) {
    case "strike": return "#fbac4b";
    case "defense": return "#60a5ce";
    case "control": return "#a855f7";
  }
}

export function getTypeIcon(type: CardType): string {
  switch (type) {
    case "strike": return "⚔️";
    case "defense": return "🛡️";
    case "control": return "🎭";
  }
}

export function getTypeBg(type: CardType): string {
  switch (type) {
    case "strike": return "#421f1b";
    case "defense": return "#1e3a5f";
    case "control": return "#3b0764";
  }
}

export function getVideoForCard(card: Card | null): string | null {
  if (!card) return null;
  if (card.id === "evasion") return "/action videos/Evasion.webm";
  if (card.id === "reversal_edge") return "/action videos/Reversal edge.webm";
  if (card.id === "finisher") return "/action videos/Kiara finishing.webm";
  if (card.type === "control") return "/action videos/control.webm";
  if (card.type === "defense") return "/action videos/defense.webm";
  if (card.type === "strike") {
    const strikeVids = [
      "/action videos/strike kick.webm",
      "/action videos/top strike.webm",
      "/action videos/Whisk_2mjy0ejzkntmxctotaznijwlmfjm00snxumytgj.webm"
    ];
    const total = card.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return strikeVids[total % strikeVids.length];
  }
  return null;
}

export const CLASH_STYLES = `
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
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
  @keyframes cinematicIn  { from { opacity: 0; } to { opacity: 1; } }
  @keyframes cinematicOut { from { opacity: 1; } to { opacity: 0; } }
  @keyframes descriptionFade { 0% { opacity:0; } 100% { opacity:1; } }
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
  @keyframes critPop {
    from { transform: translateX(-50%) scale(0.5); opacity: 0; }
    to   { transform: translateX(-50%) scale(1);   opacity: 1; }
  }
`;

function getEffectLabel(effect: string): { label: string; color: string } {
  switch (effect) {
    case "evasion":      return { label: "EVASION!",    color: "#a855f7" };
    case "reversal":     return { label: "REVERSAL!",   color: "#06b6d4" };
    case "pressure":     return { label: "PRESSURE!",   color: "#c084fc" };
    case "mindgame":     return { label: "MIND GAME!",  color: "#a855f7" };
    case "disrupt":      return { label: "DISRUPT!",    color: "#fbac4b" };
    case "guard":        return { label: "GUARD!",      color: "#60a5ce" };
    case "anticipation": return { label: "ANTICIPATE!", color: "#34d399" };
    case "finisher":     return { label: "FINISHER!",   color: "#f43f5e" };
    default:             return { label: effect.toUpperCase() + "!", color: "#fff" };
  }
}

interface ClashCinematicProps {
  result: SlotResult;
  opponentColor: string;
  fadeOut: boolean;
  arenaBackground?: string;
}

export function ClashCinematic({ result, opponentColor, fadeOut, arenaBackground }: ClashCinematicProps) {
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
      {arenaBackground && (
        <img src={arenaBackground} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      {actionVideo && (
        <video src={actionVideo} autoPlay muted playsInline
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }}
        />
      )}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.8) 100%)" }} />

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
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `3px solid ${winnerColor}`, animation: "shockwave 0.7s 0.5s ease-out forwards" }} />
          <div style={{ position: "absolute", inset: -20, borderRadius: "50%", border: `2px solid ${winnerColor}88`, animation: "shockwave2 0.9s 0.55s ease-out forwards" }} />
          {sparkColors.map((c, idx) => (
            <div key={idx} style={{
              position: "absolute", top: "50%", left: "50%",
              width: idx % 2 === 0 ? 10 : 6, height: idx % 2 === 0 ? 10 : 6,
              borderRadius: "50%", backgroundColor: c, boxShadow: `0 0 8px ${c}`,
              animation: `sparkFly${idx + 1} 0.7s ${0.48 + idx * 0.03}s ease-out forwards`,
            }} />
          ))}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <div style={{
              fontSize: 36, fontWeight: 900, letterSpacing: -1, color: winnerColor,
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
            animation: fadeOut ? "effectBannerOut 0.3s ease forwards" : "effectBannerIn 0.5s 0.3s cubic-bezier(0.22,1,0.36,1) both",
            zIndex: 10, display: "flex", alignItems: "center", gap: 10, padding: "8px 28px",
            background: `linear-gradient(90deg, rgba(0,0,0,0) 0%, ${color}22 20%, ${color}33 50%, ${color}22 80%, rgba(0,0,0,0) 100%)`,
            borderTop: `1.5px solid ${color}80`, borderBottom: `1.5px solid ${color}80`,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
            <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: 6, color, textShadow: `0 0 20px ${color}, 0 0 40px ${color}80`, fontFamily: "inherit" }}>{label}</span>
            <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
          </div>
        );
      })()}

      {/* Description */}
      <div style={{
        position: "absolute", bottom: 220, left: "50%", transform: "translateX(-50%)",
        maxWidth: 560, textAlign: "center", fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.75)", lineHeight: 1.6,
        animation: "descriptionFade 0.4s 1s ease forwards", opacity: 0,
        padding: "16px 32px", backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 10,
        border: `1.5px solid ${winnerColor}50`, boxShadow: `0 0 24px ${winnerColor}20`,
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1.5, letterSpacing: 0.3, textShadow: `0 0 10px ${winnerColor}80` }}>
          {result.description}
        </div>
      </div>
    </div>
  );
}
