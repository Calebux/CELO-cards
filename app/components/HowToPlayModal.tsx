"use client";

import { useState } from "react";
import { DESIGN_W, DESIGN_H } from "../lib/designConstants";

const FULL_STEPS = [
  {
    icon: "🎫",
    title: "Buy a Season Pass for Ranked",
    body: "A Season Pass unlocks ranked access so you can play competitive matches without stopping to pay the match fee every time. Once active, you stay eligible for ranked rewards and tournaments during the pass period.",
    color: "#fbbf24",
  },
  {
    icon: "⚔️",
    title: "Play 1V1 Battles",
    body: "Action Order is a 1v1 game. Every match is you versus one opponent in direct tactical combat across 5 card slots.",
    color: "#56a4cb",
  },
  {
    icon: "🔗",
    title: "Create or Join a Game",
    body: "Tap Create Match to host, then share your Match ID or link. To join, open Join Match and paste the Match ID or link, then lock in your fighter and order.",
    color: "#22d3ee",
  },
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
    icon: "⭐",
    title: "Attune 2 Cards",
    body: "In Loadout, Black Market, or your Profile, attune up to 2 owned cards. The first attuned card revealed in a match gets a one-time +1 Priority Surge, so attunement lets you specialize without overpowering the whole deck.",
    color: "#f59e0b",
  },
  {
    icon: "⚡",
    title: "Cards Resolve by Priority",
    body: "Each slot's cards clash simultaneously. The card with higher Priority wins the slot and deals Knock damage. Ties go to the higher Knock value. Win more slots to win the round.",
    color: "#a855f7",
  },
  {
    icon: "🏆",
    title: "Win 3 Rounds to Win the Match",
    body: "A match is first to 3 rounds. Win 3 rounds and you win the match. Each round you get a fresh deck to build a new order — adapt to your opponent's patterns.",
    color: "#4ade80",
  },
  {
    icon: "📈",
    title: "Grow Card Mastery",
    body: "Owned cards track performance like times played, clash wins, total knock, match wins, and best knock. That live performance drives mastery tiers, so the better you use a card, the stronger its identity becomes in your collection.",
    color: "#38bdf8",
  },
  {
    icon: "🔥",
    title: "Watch for Forge Ready",
    body: "Normal cards now surface their mastery progress in Loadout and the Black Market Forge section. When a card reaches Tier 5, 25 uses, 12 clash wins, and 100 total knock, it lights up as Forge Ready for ascension.",
    color: "#fbbf24",
  },
  {
    icon: "📈",
    title: "Earn Points & Climb the Leaderboard",
    body: "Ranked wins earn Points. Win streaks multiply your earnings (3+ wins = 1.5×, 5+ = 2×). Top players qualify for the weekly Tournament.",
    color: "#fbbf24",
  },
];

const QUICK_START_STEPS = [
  {
    icon: "🎫",
    title: "Buy A Season Pass",
    body: "Ranked play runs through the Season Pass. Once active, you can keep playing ranked matches without stopping to pay each time.",
    color: "#fbbf24",
  },
  {
    icon: "🎮",
    title: "Choose Your Fighter",
    body: "Start by picking 1 of 5 fighters. Each one changes your play style through different stats, passives, and a one-time ultimate.",
    color: "#56a4cb",
  },
  {
    icon: "🃏",
    title: "Build 5 Cards",
    body: "Pick 5 cards and place them into slots 1–5 while staying inside your energy cap. Your order matters as much as the cards themselves.",
    color: "#f97316",
  },
  {
    icon: "⚡",
    title: "Priority Wins The Slot",
    body: "Each slot resolves at the same time. The card with higher Priority wins the clash and deals Knock damage. Win more slots to win the round.",
    color: "#a855f7",
  },
  {
    icon: "🏆",
    title: "Win 3 Rounds",
    body: "Matches are first to 3 rounds. Adapt your order, read your opponent, and take the match before they do.",
    color: "#4ade80",
  },
] as const;

interface Props {
  onClose: () => void;
  isMiniPay: boolean;
  variant?: "quickstart" | "full";
}

export function HowToPlayModal({ onClose, isMiniPay, variant = "full" }: Props) {
  const [step, setStep] = useState(0);
  const steps = variant === "quickstart" ? QUICK_START_STEPS : FULL_STEPS;
  const current = steps[step];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(8px)",
        overflow: "hidden",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          position: "absolute",
          top: 0,
          left: 0,
          transformOrigin: "top left",
          transform: "var(--ao-tr)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: isMiniPay ? 620 : 520, position: "relative",
            background: "rgba(10,15,28,0.97)",
            border: `2px solid ${current.color}50`,
            borderRadius: 12,
            padding: isMiniPay ? "48px 52px 44px" : "40px 44px 36px",
            boxShadow: `0 0 40px ${current.color}20, 0 20px 60px rgba(0,0,0,0.8)`,
            fontFamily: "var(--font-space-grotesk), sans-serif",
            transition: "border-color 0.3s",
          }}
        >
          {/* Scanline */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: current.color, borderRadius: "12px 12px 0 0", transition: "background 0.3s" }} />

          {/* Close */}
          <button
            aria-label="Close how to play"
            onClick={onClose}
            style={{ position: "absolute", top: 14, right: 16, background: "none", border: "none", cursor: "pointer", color: "#475569", fontSize: isMiniPay ? 26 : 18, lineHeight: 1, padding: isMiniPay ? 12 : 0 }}
          >✕</button>

          {/* Header */}
          <div style={{ fontSize: isMiniPay ? 11 : 9, fontWeight: 700, letterSpacing: 3, color: "#475569", textTransform: "uppercase", marginBottom: isMiniPay ? 28 : 24 }}>
            {variant === "quickstart" ? "QUICK START" : "HOW TO PLAY"} — {step + 1} / {steps.length}
          </div>

          {/* Step icon + title */}
          <div style={{ fontSize: isMiniPay ? 56 : 48, lineHeight: 1, marginBottom: 16 }}>{current.icon}</div>
          <h2 style={{ fontSize: isMiniPay ? 28 : 24, fontWeight: 900, color: "#f1f5f9", letterSpacing: -0.5, margin: "0 0 12px", textTransform: "uppercase" }}>
            {current.title}
          </h2>
          <p style={{ fontSize: isMiniPay ? 17 : 14, color: "#94a3b8", lineHeight: 1.75, margin: 0, minHeight: isMiniPay ? 108 : 80 }}>
            {current.body}
          </p>

          {/* Step dots */}
          <div style={{ display: "flex", gap: isMiniPay ? 8 : 6, marginTop: isMiniPay ? 34 : 28, marginBottom: isMiniPay ? 28 : 24 }}>
            {steps.map((s, i) => (
              <button
                key={i}
                aria-label={`Go to step ${i + 1}: ${s.title}`}
                onClick={() => setStep(i)}
                style={{
                  width: 44,
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: i === step ? (isMiniPay ? 30 : 24) : (isMiniPay ? 10 : 8),
                    height: isMiniPay ? 10 : 8,
                    borderRadius: 4,
                    background: i === step ? current.color : i < step ? `${current.color}50` : "rgba(255,255,255,0.1)",
                    transition: "all 0.25s",
                  }}
                />
              </button>
            ))}
          </div>

          {/* Nav buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                style={{ flex: 1, height: isMiniPay ? 58 : 46, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: isMiniPay ? 15 : 13, letterSpacing: 1.5, color: "#9ca3af", textTransform: "uppercase" }}
              >
                ← BACK
              </button>
            )}
            <button
              onClick={() => step < steps.length - 1 ? setStep(step + 1) : onClose()}
              style={{
                flex: 2, height: isMiniPay ? 58 : 46,
                background: `linear-gradient(135deg, ${current.color}25, ${current.color}10)`,
                border: `1.5px solid ${current.color}`,
                borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                fontWeight: 900, fontSize: isMiniPay ? 15 : 13, letterSpacing: 2,
                color: current.color, textTransform: "uppercase",
                transition: "all 0.2s",
              }}
            >
              {step < steps.length - 1 ? "NEXT →" : variant === "quickstart" ? "START PLAYING" : "GOT IT — LET'S PLAY"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
