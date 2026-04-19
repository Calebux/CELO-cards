"use client";

import { useEffect, useRef } from "react";

interface Character {
  name: string;
  standingArt: string;
  color: string;
  bgColor?: string;
}

interface ShareCardProps {
  won: boolean;
  playerChar: Character;
  opponentChar: Character;
  playerRounds: number;
  opponentRounds: number;
  onClose: () => void;
}

const CARD_W = 400;
const CARD_H = 560;

export function ShareCard({ won, playerChar, opponentChar, playerRounds, opponentRounds, onClose }: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const accentColor = won ? "#4ade80" : "#f87171";
    const bgColor = playerChar.bgColor ?? "#0f172a";

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // Draw character portrait
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Portrait — top 65% of card
      ctx.drawImage(img, 0, 0, CARD_W, Math.round(CARD_H * 0.65));

      // Gradient overlay over portrait bottom
      const grad = ctx.createLinearGradient(0, CARD_H * 0.38, 0, CARD_H * 0.68);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, bgColor);
      ctx.fillStyle = grad;
      ctx.fillRect(0, CARD_H * 0.38, CARD_W, CARD_H * 0.3);

      // Bottom info section background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, CARD_H * 0.65, CARD_W, CARD_H * 0.35);

      // "ACTION ORDER" label top-left
      ctx.fillStyle = "#56a4cb";
      ctx.font = "bold 11px sans-serif";
      ctx.letterSpacing = "3px";
      ctx.fillText("ACTION ORDER", 18, 28);

      // Border
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, CARD_W - 4, CARD_H - 4);

      // Top scanline
      ctx.fillStyle = accentColor;
      ctx.fillRect(0, 0, CARD_W, 3);

      // VICTORY / DEFEAT
      ctx.fillStyle = accentColor;
      ctx.font = `bold 52px sans-serif`;
      ctx.letterSpacing = "-1px";
      ctx.textAlign = "center";
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 20;
      ctx.fillText(won ? "VICTORY" : "DEFEAT", CARD_W / 2, CARD_H * 0.73);
      ctx.shadowBlur = 0;

      // Score
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 28px sans-serif";
      ctx.letterSpacing = "0px";
      ctx.fillText(`${playerRounds} – ${opponentRounds}`, CARD_W / 2, CARD_H * 0.81);

      // "vs <opponent>" label
      ctx.fillStyle = "#94a3b8";
      ctx.font = "13px sans-serif";
      ctx.fillText(`vs ${opponentChar.name}`, CARD_W / 2, CARD_H * 0.88);

      // "as <player char>"
      ctx.fillStyle = playerChar.color;
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(playerChar.name, CARD_W / 2, CARD_H * 0.93);

      // Celo branding bottom-right
      ctx.textAlign = "right";
      ctx.fillStyle = "#475569";
      ctx.font = "10px sans-serif";
      ctx.fillText("on @Celo #ActionOrder", CARD_W - 14, CARD_H - 14);

      ctx.textAlign = "left"; // reset
    };
    img.onerror = () => {
      // Still draw text even if image fails
      ctx.fillStyle = accentColor;
      ctx.font = "bold 52px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(won ? "VICTORY" : "DEFEAT", CARD_W / 2, CARD_H * 0.5);
      ctx.textAlign = "left";
    };
    img.src = playerChar.standingArt;
  }, [won, playerChar, opponentChar, playerRounds, opponentRounds]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `action-order-${won ? "victory" : "defeat"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const handleShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) { handleDownload(); return; }
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], `action-order-${won ? "victory" : "defeat"}.png`, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `${won ? "VICTORY" : "DEFEAT"} on Action Order`,
              text: `${playerRounds}–${opponentRounds} as ${playerChar.name} vs ${opponentChar.name} on @Celo #ActionOrder`,
            });
            return;
          } catch {
            // fall through to download
          }
        }
      }
      handleDownload();
    }, "image/png");
  };

  const handleXShare = () => {
    const emoji = won ? "🏆" : "⚔️";
    const score = `${playerRounds}-${opponentRounds}`;
    const tweet = `${emoji} Just ${won ? "won" : "lost"} ${score} as ${playerChar.name} vs ${opponentChar.name} on Action Order!\n\nOn-chain card game on @Celo 🎮\n#ActionOrder #Celo`;
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(tweet)}`, "_blank", "noopener");
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(5, 5, 16, 0.9)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
          padding: 24,
        }}
      >
        <canvas
          ref={canvasRef}
          width={CARD_W}
          height={CARD_H}
          style={{
            borderRadius: 12,
            boxShadow: `0 0 40px ${won ? "rgba(74,222,128,0.4)" : "rgba(248,113,113,0.4)"}`,
            maxWidth: "80vw",
            maxHeight: "60vh",
            objectFit: "contain",
          }}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => void handleShare()}
            style={{
              padding: "11px 24px", borderRadius: 6, cursor: "pointer",
              background: "rgba(86,164,203,0.15)", border: "1.5px solid #56a4cb",
              color: "#b9e7f4", fontSize: 13, fontWeight: 700,
              letterSpacing: 2, textTransform: "uppercase", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <span className="material-icons" style={{ fontSize: 16 }}>share</span>
            SHARE
          </button>
          <button
            onClick={handleDownload}
            style={{
              padding: "11px 24px", borderRadius: 6, cursor: "pointer",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)",
              color: "#94a3b8", fontSize: 13, fontWeight: 700,
              letterSpacing: 2, textTransform: "uppercase", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <span className="material-icons" style={{ fontSize: 16 }}>download</span>
            SAVE
          </button>
          <button
            onClick={handleXShare}
            style={{
              width: 46, height: 46, borderRadius: 6, cursor: "pointer",
              background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)",
              color: "#e2e8f0", fontSize: 17, fontWeight: 900,
              fontFamily: "serif", display: "flex", alignItems: "center", justifyContent: "center",
            }}
            title="Share on X"
          >
            𝕏
          </button>
          <button
            onClick={onClose}
            style={{
              width: 46, height: 46, borderRadius: 6, cursor: "pointer",
              background: "none", border: "1px solid rgba(255,255,255,0.08)",
              color: "#6b7280", fontSize: 11, fontWeight: 700,
              letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit",
            }}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
