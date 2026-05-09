"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Card } from "../lib/gameData";
import type { CardPerformanceStats } from "../lib/cardProgress";
import { getCardMasteryPerkCopy, getCardMasterySnapshot, getNextUnlockCopy } from "../lib/cardMastery";
import { isMiniPay } from "../lib/minipay";
import { DESIGN_W, DESIGN_H } from "../lib/designConstants";

interface CardPreviewModalProps {
  card: Card;
  owned?: boolean;
  stats?: CardPerformanceStats | null;
  isAttuned?: boolean;
  canAttune?: boolean;
  onToggleAttunement?: (() => void) | null;
  onClose: () => void;
}

const TYPE_COPY: Record<Card["type"], { label: string; description: string }> = {
  strike: {
    label: "Strike",
    description: "Direct offense with clean knock pressure and finishing potential.",
  },
  defense: {
    label: "Defense",
    description: "Protective timing tools that absorb pressure and swing trades.",
  },
  control: {
    label: "Control",
    description: "Tempo disruption that manipulates the clash and breaks enemy rhythm.",
  },
};

function useViewportSize() {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const sync = () => {
      const vv = window.visualViewport;
      setViewport({
        width: vv?.width ?? window.innerWidth,
        height: vv?.height ?? window.innerHeight,
      });
    };

    sync();
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, []);

  return viewport;
}

function CardPreviewContent({
  card,
  owned,
  stats,
  isAttuned,
  canAttune,
  onToggleAttunement,
  onClose,
  compact,
}: CardPreviewModalProps & { compact: boolean }) {
  const typeMeta = TYPE_COPY[card.type];
  const usageStats = stats ?? {
    timesPlayed: 0,
    clashWins: 0,
    totalKnock: 0,
    matchWins: 0,
    bestKnock: 0,
  };
  const clashWinRate = usageStats.timesPlayed > 0 ? Math.round((usageStats.clashWins / usageStats.timesPlayed) * 100) : 0;
  const mastery = getCardMasterySnapshot(usageStats);
  const statusAccent = isAttuned || mastery.tier > 0 ? "#fbbf24" : owned ? card.color : "#94a3b8";
  const statusLabel = isAttuned ? "ATTUNED" : mastery.tier > 0 ? `T${mastery.tier}` : owned ? "OWNED" : "BLACK MARKET";

  return (
    <>
      <style>{`
        @keyframes cardPreviewFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cardPreviewPanelIn {
          from { opacity: 0; transform: translateY(32px) scale(0.88); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cardPreviewPassFlip {
          0% { transform: perspective(700px) rotateY(0deg) rotate(-4deg); }
          50% { transform: perspective(700px) rotateY(90deg) rotate(-2deg); }
          100% { transform: perspective(700px) rotateY(0deg) rotate(-4deg); }
        }
        @keyframes cardPreviewPassGlow {
          0%, 100% { box-shadow: 0 24px 60px rgba(0,0,0,0.5), 0 0 26px ${card.color}2f; }
          50% { box-shadow: 0 28px 70px rgba(0,0,0,0.58), 0 0 40px ${card.color}70, 0 0 70px ${card.color}26; }
        }
        @keyframes cardPreviewFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        style={{
          position: "relative",
          height: "100%",
          borderRadius: compact ? 20 : 22,
          overflow: "hidden",
          border: `1.5px solid ${card.color}70`,
          background: "linear-gradient(135deg, rgba(15,23,42,0.98), rgba(2,6,23,0.95))",
          boxShadow: `0 36px 120px rgba(0,0,0,0.55), 0 0 48px ${card.color}22`,
          animation: "cardPreviewPanelIn 0.42s ease forwards",
          display: "grid",
          gridTemplateColumns: compact ? "300px minmax(0, 1fr)" : "320px minmax(0, 1fr)",
        }}
      >
        <div
          style={{
            position: "relative",
            minHeight: 0,
            padding: compact ? 18 : 24,
            background: `radial-gradient(circle at 20% 20%, ${card.color}2c 0%, transparent 42%), linear-gradient(180deg, ${card.bgColor}, rgba(2,6,23,0.98))`,
            borderRight: `1px solid ${card.color}30`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <button
            onClick={onClose}
            aria-label="Close card preview"
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              width: compact ? 42 : 40,
              height: compact ? 42 : 40,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(2,6,23,0.7)",
              color: "#e2e8f0",
              fontSize: compact ? 24 : 22,
              cursor: "pointer",
              zIndex: 2,
            }}
          >
            ×
          </button>

          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: compact ? 250 : 280,
              aspectRatio: "170 / 236",
              margin: compact ? "22px auto 0" : "26px auto 0",
              borderRadius: 22,
              overflow: "hidden",
              border: `2px solid ${card.color}`,
              boxShadow: `0 24px 60px rgba(0,0,0,0.5), 0 0 26px ${card.color}2f`,
              transform: "rotate(-4deg)",
              animation: "cardPreviewPanelIn 0.4s ease forwards, cardPreviewPassFlip 0.7s ease 0.08s, cardPreviewPassGlow 2s ease 0.8s infinite",
              flexShrink: 0,
            }}
          >
            <img
              src={card.image}
              alt={card.name}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to top, rgba(2,6,23,1) 0%, rgba(2,6,23,0.38) 44%, transparent 100%)",
              }}
            />

            <div
              style={{
                position: "absolute",
                top: 16,
                left: 16,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                animation: "cardPreviewFadeUp 0.45s ease 0.68s both",
              }}
            >
              <div
                style={{
                  minWidth: 54,
                  padding: "8px 12px",
                  borderRadius: 999,
                  background: "rgba(2,6,23,0.78)",
                  border: `1px solid ${card.color}`,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#94a3b8", textTransform: "uppercase" }}>Knock</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: card.color }}>{card.knock}</div>
              </div>
              <div
                style={{
                  minWidth: 54,
                  padding: "8px 12px",
                  borderRadius: 999,
                  background: "rgba(2,6,23,0.78)",
                  border: "1px solid rgba(148,163,184,0.45)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#94a3b8", textTransform: "uppercase" }}>Prio</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#e2e8f0" }}>{card.priority}</div>
              </div>
            </div>

            <div
              style={{
                position: "absolute",
                left: 18,
                right: 18,
                bottom: 18,
                textAlign: "center",
                animation: "cardPreviewFadeUp 0.42s ease 0.74s both",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2.2, color: card.color, textTransform: "uppercase" }}>
                {typeMeta.label}
              </div>
              <div style={{ marginTop: 6, fontSize: compact ? 20 : 22, fontWeight: 900, letterSpacing: -0.8, color: "#fff", textTransform: "uppercase" }}>
                {card.name}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 18,
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 10,
              animation: "cardPreviewFadeUp 0.42s ease 0.82s both",
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: `1px solid ${statusAccent}55`,
                background: isAttuned ? "rgba(251,191,36,0.18)" : mastery.tier > 0 ? "rgba(251,191,36,0.12)" : `${card.color}14`,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 1.2,
                color: statusAccent,
                textTransform: "uppercase",
              }}
            >
              {statusLabel}
            </div>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid rgba(148,163,184,0.22)",
                background: "rgba(255,255,255,0.04)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.2,
                color: "#cbd5e1",
                textTransform: "uppercase",
              }}
            >
              {card.energyCost} Energy Cost
            </div>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid rgba(148,163,184,0.22)",
                background: "rgba(255,255,255,0.04)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.2,
                color: "#cbd5e1",
                textTransform: "uppercase",
              }}
            >
              {mastery.xp} Mastery XP
            </div>
          </div>
        </div>

        <div
          style={{
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: compact ? "18px 18px 12px 16px" : "28px 28px 14px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2.6, color: card.color, textTransform: "uppercase", animation: "cardPreviewFadeUp 0.38s ease 0.56s both" }}>
                Mastery Breakdown
              </div>
              <h2
                style={{
                  margin: "8px 0 0",
                  fontSize: compact ? 30 : 36,
                  lineHeight: 1,
                  fontWeight: 900,
                  letterSpacing: -1.5,
                  color: "#fff",
                  textTransform: "uppercase",
                  animation: "cardPreviewFadeUp 0.42s ease 0.62s both",
                }}
              >
                {card.name}
              </h2>
            </div>

            <div
              style={{
                borderRadius: 18,
                border: "1px solid rgba(251,191,36,0.26)",
                background: "linear-gradient(135deg, rgba(251,191,36,0.14), rgba(15,23,42,0.9))",
                padding: compact ? "14px 14px 12px" : "16px 16px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                animation: "cardPreviewFadeUp 0.42s ease 0.78s both",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: "#fbbf24", textTransform: "uppercase" }}>
                    Mastery Tier
                  </div>
                  <div style={{ marginTop: 6, fontSize: compact ? 24 : 28, fontWeight: 900, color: "#fff", letterSpacing: -0.8 }}>
                    {mastery.tier > 0 ? `Tier ${mastery.tier}` : "Unranked"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#94a3b8", textTransform: "uppercase" }}>
                    Progress
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 800, color: "#e2e8f0", letterSpacing: 0.4 }}>
                    {mastery.nextTierXp == null ? `${mastery.xp} XP` : `${mastery.xp} / ${mastery.nextTierXp} XP`}
                  </div>
                </div>
              </div>

              <div
                style={{
                  height: 10,
                  borderRadius: 999,
                  background: "rgba(15,23,42,0.8)",
                  border: "1px solid rgba(148,163,184,0.18)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${mastery.progressToNext * 100}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, rgba(251,191,36,0.72), rgba(251,191,36,1))",
                    boxShadow: "0 0 16px rgba(251,191,36,0.45)",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                <div
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(148,163,184,0.16)",
                    background: "rgba(2,6,23,0.46)",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.8, color: "#fbbf24", textTransform: "uppercase" }}>
                    Active Perk
                  </div>
                  <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, color: "#f8fafc" }}>
                    {isAttuned ? getCardMasteryPerkCopy() : "Attune this card to activate its live combat perk."}
                  </div>
                </div>

                <div
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(148,163,184,0.16)",
                    background: "rgba(2,6,23,0.46)",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.8, color: "#94a3b8", textTransform: "uppercase" }}>
                    Next Unlock
                  </div>
                  <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, color: "#e2e8f0" }}>
                    {mastery.nextTier ? `T${mastery.nextTier}` : "MAX"}: {getNextUnlockCopy(mastery.nextTier)}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
                animation: "cardPreviewFadeUp 0.42s ease 0.86s both",
              }}
            >
              {[
                { label: "Knock", value: card.knock, color: card.color },
                { label: "Priority", value: card.priority, color: "#e2e8f0" },
                { label: "Energy", value: card.energyCost, color: "#fbbf24" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(148,163,184,0.16)",
                    background: "rgba(15,23,42,0.78)",
                    padding: compact ? "14px 12px 12px" : "14px 14px 12px",
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.8, color: "#64748b", textTransform: "uppercase" }}>
                    {stat.label}
                  </div>
                  <div style={{ marginTop: 8, fontSize: compact ? 22 : 24, fontWeight: 900, color: stat.color }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
                animation: "cardPreviewFadeUp 0.42s ease 0.94s both",
              }}
            >
              {[
                { label: "Times Played", value: usageStats.timesPlayed, color: "#e2e8f0" },
                { label: "Clash Wins", value: usageStats.clashWins, color: card.color },
                { label: "Knock Dealt", value: usageStats.totalKnock, color: "#f97316" },
                { label: "Win Rate", value: usageStats.timesPlayed > 0 ? `${clashWinRate}%` : "—", color: "#56a4cb" },
                { label: "Match Wins", value: usageStats.matchWins, color: "#fbbf24" },
                { label: "Best Knock", value: usageStats.bestKnock, color: "#fb7185" },
              ].map((entry) => (
                <div
                  key={entry.label}
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(148,163,184,0.16)",
                    background: "rgba(255,255,255,0.03)",
                    padding: compact ? "12px 12px 10px" : "14px 14px 12px",
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.7, color: "#64748b", textTransform: "uppercase" }}>
                    {entry.label}
                  </div>
                  <div style={{ marginTop: 8, fontSize: compact ? 18 : 20, fontWeight: 900, color: entry.color }}>
                    {entry.value}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                borderRadius: 16,
                border: `1px solid ${card.color}2e`,
                background: `${card.color}0f`,
                padding: compact ? 16 : 16,
                animation: "cardPreviewFadeUp 0.42s ease 1.02s both",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: card.color, textTransform: "uppercase" }}>
                Power
              </div>
              <p style={{ margin: "10px 0 0", fontSize: compact ? 14 : 15, lineHeight: 1.6, color: "#e2e8f0" }}>
                {card.effect}
              </p>
            </div>

            <div
              style={{
                borderRadius: 16,
                border: "1px solid rgba(148,163,184,0.18)",
                background: "rgba(15,23,42,0.58)",
                padding: compact ? 16 : 16,
                animation: "cardPreviewFadeUp 0.42s ease 1.1s both",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: "#94a3b8", textTransform: "uppercase" }}>
                Combat Role
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: "#cbd5e1" }}>
                {typeMeta.description}
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
                animation: "cardPreviewFadeUp 0.42s ease 1.18s both",
              }}
            >
              <div
                style={{
                  borderRadius: 14,
                  border: "1px solid rgba(148,163,184,0.16)",
                  background: "rgba(255,255,255,0.03)",
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.8, color: "#64748b", textTransform: "uppercase" }}>
                  Tempo Read
                </div>
                <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, color: "#e2e8f0" }}>
                  {card.priority >= 6
                    ? "High priority tool. Best used to seize initiative before slower heavy hits connect."
                    : card.priority >= 4
                      ? "Balanced timing card. Reliable in mid-speed exchanges and flexible round planning."
                      : "Slow but dangerous. Use when you can read the opponent or force a commitment first."}
                </div>
              </div>

              <div
                style={{
                  borderRadius: 14,
                  border: "1px solid rgba(148,163,184,0.16)",
                  background: "rgba(255,255,255,0.03)",
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.8, color: "#64748b", textTransform: "uppercase" }}>
                  Threat Level
                </div>
                <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, color: "#e2e8f0" }}>
                  {card.knock >= 8
                    ? "Fight-ending pressure. If it lands clean, the round can swing immediately."
                    : card.knock >= 5
                      ? "Strong damage pressure. Good for establishing control without overcommitting."
                      : "Lower raw damage, but useful when paired with timing advantage or setup cards."}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: compact ? "12px 18px 18px 16px" : "14px 28px 22px 18px",
              borderTop: "1px solid rgba(148,163,184,0.14)",
              background: "linear-gradient(180deg, rgba(2,6,23,0), rgba(2,6,23,0.92) 25%)",
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              animation: "cardPreviewFadeUp 0.42s ease 1.26s both",
            }}
          >
            {onToggleAttunement && (
              <button
                onClick={onToggleAttunement}
                disabled={!isAttuned && canAttune === false}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: compact ? "15px 16px" : "14px 22px",
                  borderRadius: 12,
                  border: `1px solid ${isAttuned ? "rgba(251,191,36,0.55)" : "rgba(148,163,184,0.28)"}`,
                  background: isAttuned
                    ? "linear-gradient(135deg, rgba(251,191,36,0.22), rgba(255,255,255,0.06))"
                    : "linear-gradient(135deg, rgba(148,163,184,0.12), rgba(255,255,255,0.04))",
                  color: isAttuned ? "#fbbf24" : "#e2e8f0",
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: 1.8,
                  textTransform: "uppercase",
                  cursor: !isAttuned && canAttune === false ? "not-allowed" : "pointer",
                  opacity: !isAttuned && canAttune === false ? 0.55 : 1,
                  fontFamily: "inherit",
                }}
              >
                {isAttuned ? "Unattune Card" : canAttune === false ? "Attunement Full" : "Attune Card"}
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                flex: 1,
                minWidth: 0,
                padding: compact ? "15px 16px" : "14px 22px",
                borderRadius: 12,
                border: `1px solid ${card.color}55`,
                background: `linear-gradient(135deg, ${card.color}22, rgba(255,255,255,0.06))`,
                color: "#fff",
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: 1.8,
                textTransform: "uppercase",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function CardPreviewModal(props: CardPreviewModalProps) {
  const isMp = isMiniPay();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const viewport = useViewportSize();

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!isMp) return;
    const el = wrapRef.current;
    if (!el || !viewport.width || !viewport.height) return;

    const vw = viewport.width;
    const vh = viewport.height;
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
  }, [isMp, viewport.height, viewport.width]);

  if (!mounted) return null;

  const overlay = isMp ? (
    <div
      onClick={props.onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(2, 6, 23, 0.82)",
        backdropFilter: "blur(14px)",
        overflow: "hidden",
      }}
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
          onClick={(event) => event.stopPropagation()}
          style={{
            width: 980,
            height: 560,
          }}
        >
          <CardPreviewContent {...props} compact />
        </div>
      </div>
    </div>
  ) : (
    <div
      onClick={props.onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(2, 6, 23, 0.72)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(940px, calc(100vw - 48px))",
          height: "min(620px, calc(100vh - 48px))",
        }}
      >
        <CardPreviewContent {...props} compact={false} />
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
