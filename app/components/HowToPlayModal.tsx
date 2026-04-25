"use client";

import { useState } from "react";

const STEPS = [
  {
    icon: "🎮",
    title: "Choose Your Fighter",
    body: "Pick one of 5 unique characters — each has different Knock, Priority, and Drain stats, plus a Passive ability and a one-time Ultimate move. Your character shapes your play style.",
    color: "#56a4cb",
  },
  {
    icon: "🃏",
    title: "Build Your Order",
    body: "Select 5 cards from your deck and arrange them into slots 1–5. You have an Energy budget — each card costs Energy. Choose Strike, Defense, or Control cards to build your strategy.",
    color: "#f97316",
  },
  {
    icon: "🎫",
    title: "Buy a Season Pass for Ranked",
    body: "A Season Pass unlocks ranked access so you can play competitive matches without stopping to pay the match fee every time. Once active, you stay eligible for ranked rewards and tournaments during the pass period.",
    color: "#fbbf24",
  },
  {
    icon: "⚡",
    title: "Cards Resolve by Priority",
    body: "Each slot's cards clash simultaneously. The card with higher Priority wins the slot and deals Knock damage. Ties go to the higher Knock value. Win more slots to win the round.",
    color: "#a855f7",
  },
  {
    icon: "🏆",
    title: "Win 2 Rounds to Win the Match",
    body: "A match is best-of-3 rounds. Win 2 rounds and you win the match. Each round you get a fresh deck to build a new order — adapt to your opponent's patterns.",
    color: "#4ade80",
  },
  {
    icon: "📈",
    title: "Earn Points & Climb the Leaderboard",
    body: "Ranked wins earn Points. Win streaks multiply your earnings (3+ wins = 1.5×, 5+ = 2×). Complete daily Challenges for bonus Points and G$ rewards. Top players qualify for the weekly Tournament.",
    color: "#fbbf24",
  },
];

interface Props {
  onClose: () => void;
}

export function HowToPlayModal({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520, position: "relative",
          background: "rgba(10,15,28,0.97)",
          border: `2px solid ${current.color}50`,
          borderRadius: 12,
          padding: "40px 44px 36px",
          boxShadow: `0 0 40px ${current.color}20, 0 20px 60px rgba(0,0,0,0.8)`,
          fontFamily: "var(--font-space-grotesk), sans-serif",
          transition: "border-color 0.3s",
        }}
      >
        {/* Scanline */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: current.color, borderRadius: "12px 12px 0 0", transition: "background 0.3s" }} />

        {/* Close */}
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 14, right: 16, background: "none", border: "none", cursor: "pointer", color: "#475569", fontSize: 18, lineHeight: 1 }}
        >✕</button>

        {/* Header */}
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: "#475569", textTransform: "uppercase", marginBottom: 24 }}>
          HOW TO PLAY — {step + 1} / {STEPS.length}
        </div>

        {/* Step icon + title */}
        <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 16 }}>{current.icon}</div>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: "#f1f5f9", letterSpacing: -0.5, margin: "0 0 12px", textTransform: "uppercase" }}>
          {current.title}
        </h2>
        <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.75, margin: 0, minHeight: 80 }}>
          {current.body}
        </p>

        {/* Step dots */}
        <div style={{ display: "flex", gap: 6, marginTop: 28, marginBottom: 24 }}>
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              style={{
                width: i === step ? 24 : 8, height: 8, borderRadius: 4,
                background: i === step ? current.color : i < step ? `${current.color}50` : "rgba(255,255,255,0.1)",
                border: "none", cursor: "pointer", padding: 0,
                transition: "all 0.25s",
              }}
            />
          ))}
        </div>

        {/* Nav buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              style={{ flex: 1, height: 46, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13, letterSpacing: 1.5, color: "#9ca3af", textTransform: "uppercase" }}
            >
              ← BACK
            </button>
          )}
          <button
            onClick={() => step < STEPS.length - 1 ? setStep(step + 1) : onClose()}
            style={{
              flex: 2, height: 46,
              background: `linear-gradient(135deg, ${current.color}25, ${current.color}10)`,
              border: `1.5px solid ${current.color}`,
              borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
              fontWeight: 900, fontSize: 13, letterSpacing: 2,
              color: current.color, textTransform: "uppercase",
              transition: "all 0.2s",
            }}
          >
            {step < STEPS.length - 1 ? "NEXT →" : "GOT IT — LET'S PLAY"}
          </button>
        </div>
      </div>
    </div>
  );
}
