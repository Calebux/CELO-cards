"use client";

import { useEffect, useRef, useState } from "react";
import { isMiniPay } from "../lib/minipay";
import { DESIGN_W, DESIGN_H } from "../lib/designConstants";

const STEPS = [
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
    icon: "🎫",
    title: "Buy a Season Pass for Ranked",
    body: "A Season Pass unlocks ranked access so you can play competitive matches without stopping to pay the match fee every time. Once active, you stay eligible for ranked rewards and tournaments during the pass period.",
    color: "#fbbf24",
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
    body: "Normal cards now surface their mastery progress in Loadout and the Black Market Forge section. When a card reaches Tier 5, 25 uses, 12 clash wins, and 100 total knock, it lights up as Forge Ready for future paid ascension.",
    color: "#fbbf24",
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
  const isMp = isMiniPay();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const scale = () => {
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
      el.style.transform = transform;
    };
    scale();
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, []);

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
        ref={wrapRef}
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          position: "absolute",
          top: 0,
          left: 0,
          transformOrigin: "top left",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: isMp ? 620 : 520, position: "relative",
            background: "rgba(10,15,28,0.97)",
            border: `2px solid ${current.color}50`,
            borderRadius: 12,
            padding: isMp ? "48px 52px 44px" : "40px 44px 36px",
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
            style={{ position: "absolute", top: 14, right: 16, background: "none", border: "none", cursor: "pointer", color: "#475569", fontSize: isMp ? 26 : 18, lineHeight: 1, padding: isMp ? 12 : 0 }}
          >✕</button>

          {/* Header */}
          <div style={{ fontSize: isMp ? 11 : 9, fontWeight: 700, letterSpacing: 3, color: "#475569", textTransform: "uppercase", marginBottom: isMp ? 28 : 24 }}>
            HOW TO PLAY — {step + 1} / {STEPS.length}
          </div>

          {/* Step icon + title */}
          <div style={{ fontSize: isMp ? 56 : 48, lineHeight: 1, marginBottom: 16 }}>{current.icon}</div>
          <h2 style={{ fontSize: isMp ? 28 : 24, fontWeight: 900, color: "#f1f5f9", letterSpacing: -0.5, margin: "0 0 12px", textTransform: "uppercase" }}>
            {current.title}
          </h2>
          <p style={{ fontSize: isMp ? 17 : 14, color: "#94a3b8", lineHeight: 1.75, margin: 0, minHeight: isMp ? 108 : 80 }}>
            {current.body}
          </p>

          {/* Step dots */}
          <div style={{ display: "flex", gap: isMp ? 8 : 6, marginTop: isMp ? 34 : 28, marginBottom: isMp ? 28 : 24 }}>
            {STEPS.map((s, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                style={{
                  width: i === step ? (isMp ? 30 : 24) : (isMp ? 10 : 8), height: isMp ? 10 : 8, borderRadius: 4,
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
                style={{ flex: 1, height: isMp ? 58 : 46, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: isMp ? 15 : 13, letterSpacing: 1.5, color: "#9ca3af", textTransform: "uppercase" }}
              >
                ← BACK
              </button>
            )}
            <button
              onClick={() => step < STEPS.length - 1 ? setStep(step + 1) : onClose()}
              style={{
                flex: 2, height: isMp ? 58 : 46,
                background: `linear-gradient(135deg, ${current.color}25, ${current.color}10)`,
                border: `1.5px solid ${current.color}`,
                borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                fontWeight: 900, fontSize: isMp ? 15 : 13, letterSpacing: 2,
                color: current.color, textTransform: "uppercase",
                transition: "all 0.2s",
              }}
            >
              {step < STEPS.length - 1 ? "NEXT →" : "GOT IT — LET'S PLAY"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
