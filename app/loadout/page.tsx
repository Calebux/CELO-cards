"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "../lib/gameStore";
import { CARDS, Card, CardType } from "../lib/gameData";

// ── Assets ─────────────────────────────────────────────────────────────────
const BG_MAIN = "/new addition/loadout 001.webp";

const DESIGN_W = 1440;
const DESIGN_H = 823;

const TABS: { label: string; filter: CardType | "all" }[] = [
  { label: "ALL CARDS", filter: "all" },
  { label: "STRIKE", filter: "strike" },
  { label: "DEFENSE", filter: "defense" },
  { label: "CONTROL", filter: "control" },
];

// Type accent colours
const TYPE_COLORS: Record<string, string> = {
  all: "#5abfe6",
  strike: "#f97316",
  defense: "#3b82f6",
  control: "#a855f7",
};

// Special cards shown separately below
const SPECIAL_STRIKE_ID = "phantom_break";
const SPECIAL_DEFENSE_ID = "reversal_edge";

function CardTooltip({ card }: { card: Card }) {
  const typeColors: Record<string, string> = { strike: "#f97316", defense: "#3b82f6", control: "#a855f7" };
  const col = typeColors[card.type] ?? "#5abfe6";
  return (
    <div style={{
      position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
      width: 200, zIndex: 100, pointerEvents: "none",
      backgroundColor: "rgba(8, 12, 24, 0.97)",
      border: `1.5px solid ${col}60`,
      borderRadius: 8,
      padding: "12px 14px",
      boxShadow: `0 0 20px ${col}30, 0 8px 32px rgba(0,0,0,0.8)`,
    }}>
      {/* Scanline */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, backgroundColor: col, borderRadius: "8px 8px 0 0" }} />
      <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{card.name}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: col, backgroundColor: `${col}20`, padding: "2px 6px", borderRadius: 3, textTransform: "uppercase" }}>{card.type}</span>
        <span style={{ fontSize: 9, color: "#94a3b8", padding: "2px 6px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 3 }}>⚡{card.energyCost}</span>
      </div>
      <p style={{ fontSize: 11, color: "#94a3b8", lineHeight: "15px", margin: 0, marginBottom: 10 }}>{card.effect}</p>
      <div style={{ display: "flex", gap: 12, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 8 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9" }}>{card.knock}</div>
          <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Knock</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9" }}>{card.priority}</div>
          <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Priority</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9" }}>{card.energyCost}</div>
          <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Energy</div>
        </div>
      </div>
    </div>
  );
}

export default function Loadout() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(0);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

  const {
    selectedCharacter,
    currentOrder,
    addCardToSlot,
    removeCardFromSlot,
    lockOrder,
    maxEnergy,
    matchId,
    playerRole,
    roundNumber,
    setPrecomputedFromServer,
  } = useGameStore();
  const [lockError, setLockError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  const currentFilter = TABS[activeTab].filter;
  const accentColor = TYPE_COLORS[currentFilter];

  const usedEnergy = currentOrder.reduce((s, c) => s + (c?.energyCost ?? 0), 0);
  const remainingEnergy = maxEnergy - usedEnergy;

  // Separate regular cards from special cards per tab
  const getCardsForTab = () => {
    let cards = currentFilter === "all" ? CARDS : CARDS.filter((c) => c.type === currentFilter);

    if (currentFilter === "strike") {
      return { regular: cards.filter((c) => c.id !== SPECIAL_STRIKE_ID), special: cards.find((c) => c.id === SPECIAL_STRIKE_ID) || null };
    }
    if (currentFilter === "defense") {
      return { regular: cards.filter((c) => c.id !== SPECIAL_DEFENSE_ID), special: cards.find((c) => c.id === SPECIAL_DEFENSE_ID) || null };
    }
    return { regular: cards, special: null };
  };

  const { regular: regularCards, special: specialCard } = getCardsForTab();
  const filledSlots = currentOrder.filter((s) => s !== null).length;
  const isOrderComplete = filledSlots === 5;

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

  // Multiplayer polling ref — cleaned up on unmount
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleLockOrder = useCallback(async () => {
    if (!isOrderComplete) return;
    setLockError(null);

    // Solo path — unchanged
    if (!playerRole || !matchId) {
      lockOrder();
      router.push("/gameplay");
      return;
    }

    // Multiplayer path
    const cardIds = currentOrder
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .map((c) => c.id);

    try {
      await fetch(`/api/match/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: playerRole, cardIds, round: roundNumber }),
      });
    } catch {
      setLockError("Network error — try again.");
      return;
    }

    setWaiting(true);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/match/${matchId}?role=${playerRole}`);
        const data = await res.json() as { phase: string; slots: unknown };
        if (data.phase === "resolved" && data.slots) {
          if (pollRef.current) clearInterval(pollRef.current);
          setPrecomputedFromServer(data.slots as Parameters<typeof setPrecomputedFromServer>[0]);
          router.push("/gameplay");
        }
      } catch {
        // ignore transient network errors
      }
    }, 2000);
  }, [isOrderComplete, playerRole, matchId, currentOrder, roundNumber, lockOrder, setPrecomputedFromServer, router]);

  const isCardInOrder = (card: Card) => currentOrder.some((s) => s?.id === card.id);

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, transformOrigin: "top left", position: "relative" }}>

        {/* Background */}
        <img src={BG_MAIN} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />

        {/* Logo */}
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: -3, width: 200, height: 114, zIndex: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 22, lineHeight: "1.1", letterSpacing: "-0.5px", color: "#b9e7f4", textAlign: "center", textShadow: "0 0 20px rgba(185,231,244,0.4)", textTransform: "uppercase" }}>ACTION<br/>ORDER</div>
        </div>

        {/* Left character panel — shows selected character's standing art */}
        <div style={{
          position: "absolute", left: 109, top: 120, width: 326, height: 636,
          overflow: "hidden", pointerEvents: "none",
          borderRadius: 6,
          border: `1.5px solid ${selectedCharacter?.color || "#5abfe6"}40`,
          boxShadow: `0 0 28px ${selectedCharacter?.color || "#5abfe6"}18`,
        }}>
          {selectedCharacter && (
            <>
              <img
                src={selectedCharacter.standingArt}
                alt={selectedCharacter.name}
                style={{
                  position: "absolute", width: "100%", height: "100%",
                  objectFit: "cover", objectPosition: "top center",
                }}
              />
              {/* Bottom gradient so name reads cleanly */}
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(to top, rgba(5,5,5,0.92) 0%, rgba(5,5,5,0.2) 40%, transparent 65%)",
              }} />
              {/* Character label */}
              <div style={{ position: "absolute", bottom: 20, left: 18, right: 18 }}>
                <span style={{
                  display: "block", fontSize: 9, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: 2.5,
                  color: selectedCharacter.color, marginBottom: 4,
                }}>
                  {selectedCharacter.className}
                </span>
                <div style={{
                  fontSize: 28, fontWeight: 800, color: "#fff",
                  letterSpacing: -1, lineHeight: 1,
                  textShadow: `0 0 20px ${selectedCharacter.color}70`,
                }}>
                  {selectedCharacter.name}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ═══════════════ NEW Card Selection Panel ═══════════════ */}
        <div style={{
          position: "absolute",
          left: 480, top: 60,
          width: 920, height: 535,
          display: "flex", flexDirection: "column",
        }}>

          {/* ── Tabs ── */}
          <div style={{ display: "flex", gap: 4, marginBottom: 0, position: "relative", zIndex: 5 }}>
            {TABS.map((tab, i) => {
              const isActive = i === activeTab;
              const tabColor = TYPE_COLORS[tab.filter];
              return (
                <button
                  key={tab.label}
                  onClick={() => setActiveTab(i)}
                  style={{
                    flex: 1, padding: "14px 0",
                    backgroundColor: isActive ? "rgba(15, 22, 36, 0.95)" : "rgba(15, 22, 36, 0.5)",
                    border: "none",
                    borderTop: isActive ? `3px solid ${tabColor}` : "3px solid transparent",
                    borderLeft: "1px solid rgba(90,191,230,0.15)",
                    borderRight: "1px solid rgba(90,191,230,0.15)",
                    borderBottom: isActive ? "none" : "1px solid rgba(90,191,230,0.2)",
                    borderRadius: "8px 8px 0 0",
                    cursor: "pointer",
                    position: "relative",
                    transition: "all 0.2s ease",
                    overflow: "hidden",
                  }}
                >
                  {/* Active glow */}
                  {isActive && (
                    <div style={{
                      position: "absolute", top: 0, left: "10%", right: "10%", height: 20,
                      background: `radial-gradient(ellipse at top, ${tabColor}30, transparent)`,
                      pointerEvents: "none",
                    }} />
                  )}
                  <span style={{
                    fontSize: isActive ? 20 : 16,
                    fontWeight: 800,
                    letterSpacing: isActive ? 3 : 2,
                    color: isActive ? "#fff" : "rgba(255,255,255,0.35)",
                    textTransform: "uppercase",
                    textShadow: isActive ? `0 0 16px ${tabColor}` : "none",
                    position: "relative",
                    fontFamily: "inherit",
                  }}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Card Area ── */}
          <div style={{
            flex: 1,
            backgroundColor: "rgba(10, 16, 28, 0.88)",
            border: "1px solid rgba(90,191,230,0.2)",
            borderTop: "none",
            borderRadius: "0 0 10px 10px",
            backdropFilter: "blur(12px)",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Subtle inner glow along top */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 1,
              background: `linear-gradient(90deg, transparent, ${accentColor}40, transparent)`,
            }} />

            {/* Scrollable card grid */}
            <div style={{
              position: "absolute", inset: 0,
              padding: "20px 24px",
              overflowY: "auto",
              display: "flex", flexDirection: "column", gap: 14,
            }}>
              {/* Regular cards */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                {regularCards.map((card) => {
                  const inOrder = isCardInOrder(card);
                  const tooExpensive = !inOrder && card.energyCost > remainingEnergy;
                  const disabled = inOrder || tooExpensive;
                  const isHovered = hoveredCardId === card.id;
                  return (
                    <div
                      key={card.id}
                      onClick={() => !disabled && addCardToSlot(card)}
                      onMouseEnter={() => setHoveredCardId(card.id)}
                      onMouseLeave={() => setHoveredCardId(null)}
                      style={{
                        width: 152, height: 210,
                        position: "relative", flexShrink: 0,
                        overflow: "visible", borderRadius: 8,
                        cursor: disabled ? "default" : "pointer",
                        opacity: inOrder ? 0.35 : tooExpensive ? 0.45 : 1,
                        border: inOrder
                          ? "2px solid rgba(74,222,128,0.5)"
                          : tooExpensive
                          ? "2px solid rgba(239,68,68,0.3)"
                          : `2px solid ${isHovered ? card.color : card.color + "30"}`,
                        boxShadow: isHovered
                          ? `0 0 20px ${card.color}50, 0 8px 32px rgba(0,0,0,0.7)`
                          : inOrder
                          ? "0 0 12px rgba(74,222,128,0.2)"
                          : `0 4px 16px rgba(0,0,0,0.5), 0 0 0 1px ${card.color}15`,
                        transition: "all 0.18s ease",
                        filter: tooExpensive ? "grayscale(0.6)" : "none",
                        transform: isHovered && !disabled ? "translateY(-4px)" : "none",
                        zIndex: isHovered ? 50 : "auto",
                      }}
                    >
                      {isHovered && !disabled && <CardTooltip card={card} />}
                      <img src={card.image} alt={card.name} style={{
                        position: "absolute", width: "100%", height: "100%", objectFit: "cover",
                      }} />
                      {/* Hover shine overlay */}
                      <div style={{
                        position: "absolute", inset: 0,
                        background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 50%)",
                        pointerEvents: "none",
                      }} />
                      {inOrder && (
                        <div style={{
                          position: "absolute", inset: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          backgroundColor: "rgba(0,0,0,0.55)",
                        }}>
                          <span className="material-icons" style={{ fontSize: 34, color: "#4ade80" }}>check_circle</span>
                        </div>
                      )}
                      {/* Energy cost */}
                      <div style={{
                        position: "absolute", top: 7, left: 7,
                        width: 28, height: 28, borderRadius: "50%",
                        backgroundColor: "rgba(0,0,0,0.75)",
                        border: `2px solid ${card.color}80`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: `0 0 8px ${card.color}30`,
                      }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{card.energyCost}</span>
                      </div>
                      {/* Type indicator */}
                      <div style={{
                        position: "absolute", top: 7, right: 7,
                        padding: "2px 6px", borderRadius: 4,
                        backgroundColor: `${card.color}25`,
                        border: `1px solid ${card.color}40`,
                      }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: card.color, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          {card.type}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Special card (Phantom Break / Reversal Edge) */}
              {specialCard && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
                    Special Card
                  </div>
                  {(() => {
                    const spInOrder = isCardInOrder(specialCard);
                    const spTooExp = !spInOrder && specialCard.energyCost > remainingEnergy;
                    const spDisabled = spInOrder || spTooExp;
                    const spHovered = hoveredCardId === specialCard.id;
                    return (
                  <div
                    onClick={() => !spDisabled && addCardToSlot(specialCard)}
                    onMouseEnter={() => setHoveredCardId(specialCard.id)}
                    onMouseLeave={() => setHoveredCardId(null)}
                    style={{
                      width: 170, height: 235,
                      position: "relative", overflow: "visible",
                      borderRadius: 10,
                      cursor: spDisabled ? "default" : "pointer",
                      opacity: spInOrder ? 0.35 : spTooExp ? 0.45 : 1,
                      border: `3px solid ${specialCard.color}`,
                      boxShadow: spHovered
                        ? `0 0 40px ${specialCard.color}80, 0 12px 40px rgba(0,0,0,0.8)`
                        : `0 0 24px ${specialCard.color}50, 0 8px 32px rgba(0,0,0,0.6)`,
                      transition: "all 0.18s ease",
                      filter: spTooExp ? "grayscale(0.6)" : "none",
                      transform: spHovered && !spDisabled ? "translateY(-4px)" : "none",
                      zIndex: spHovered ? 50 : "auto",
                    }}
                  >
                    {spHovered && !spDisabled && <CardTooltip card={specialCard} />}
                    <img src={specialCard.image} alt={specialCard.name} style={{
                      position: "absolute", width: "100%", height: "100%", objectFit: "cover",
                    }} />
                    {isCardInOrder(specialCard) && (
                      <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        backgroundColor: "rgba(0,0,0,0.55)",
                      }}>
                        <span className="material-icons" style={{ fontSize: 38, color: "#4ade80" }}>check_circle</span>
                      </div>
                    )}
                    {/* Cost */}
                    <div style={{
                      position: "absolute", top: 9, left: 9,
                      width: 32, height: 32, borderRadius: "50%",
                      backgroundColor: "rgba(0,0,0,0.75)",
                      border: `2px solid ${specialCard.color}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: `0 0 10px ${specialCard.color}40`,
                    }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{specialCard.energyCost}</span>
                    </div>
                    {/* Name bar */}
                    <div style={{
                      position: "absolute", bottom: 0, left: 0, right: 0,
                      padding: "10px 12px",
                      background: `linear-gradient(transparent, ${specialCard.color}DD)`,
                    }}>
                      <span style={{
                        fontSize: 15, fontWeight: 800, color: "#fff",
                        textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                      }}>
                        {specialCard.name}
                      </span>
                    </div>
                  </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cover the old baked-in deck loadout from BG_MAIN */}
        <div style={{
          position: "absolute",
          left: 200, top: 600,
          width: 1100, height: 230,
          backgroundColor: "#0b0f1a",
          zIndex: 9,
        }} />

        {/* ═══════════════ Bottom Deck Loadout ═══════════════ */}
        <div style={{
          position: "absolute",
          left: 250, top: 605,
          width: 1000, height: 220,
          backgroundColor: "rgba(15, 25, 40, 0.95)",
          border: "2px solid rgba(90, 191, 230, 0.4)",
          borderRadius: 10,
          backdropFilter: "blur(16px)",
          boxShadow: "0 -4px 30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(90,191,230,0.2)",
          display: "flex", flexDirection: "column", alignItems: "center",
          zIndex: 10,
        }}>
          {/* Deck Loadout label */}
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
            }}>DECK LOADOUT</span>
          </div>

          {/* Energy bar */}
          <div style={{ position: "absolute", top: 14, right: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#5abfe6", textTransform: "uppercase", letterSpacing: 1 }}>
              ⚡ {usedEnergy} / {maxEnergy}
            </span>
            <div style={{ width: 120, height: 8, borderRadius: 4, backgroundColor: "rgba(0,0,0,0.5)", border: "1px solid rgba(90,191,230,0.3)", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.min(100, (usedEnergy / maxEnergy) * 100)}%`,
                backgroundColor: usedEnergy >= maxEnergy ? "#ef4444" : "#5abfe6",
                borderRadius: 4,
                transition: "width 0.3s ease, background-color 0.2s",
                boxShadow: `0 0 8px ${usedEnergy >= maxEnergy ? "#ef4444" : "#5abfe6"}80`,
              }} />
            </div>
          </div>

          {/* Slots */}
          <div style={{ display: "flex", gap: 14, marginTop: 28 }}>
            {[0, 1, 2, 3, 4].map((i) => {
              const card = currentOrder[i];
              return (
                <div
                  key={i}
                  onClick={() => card && removeCardFromSlot(i)}
                  style={{
                    width: 108, height: 140,
                    borderRadius: 6,
                    cursor: card ? "pointer" : "default",
                    position: "relative", overflow: "hidden",
                    backgroundColor: card ? "transparent" : "rgba(0, 0, 0, 0.4)",
                    border: card ? "2px solid #5abfe6" : "2px solid rgba(90, 191, 230, 0.2)",
                    boxShadow: card
                      ? "0 0 16px rgba(90,191,230,0.4), inset 0 0 8px rgba(90,191,230,0.2)"
                      : "inset 0 0 10px rgba(0,0,0,0.5)",
                    transition: "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                    transform: card ? "scale(1.03)" : "scale(1)",
                  }}
                >
                  {card ? (
                    <>
                      <img src={card.image} alt={card.name} style={{
                        position: "absolute", width: "100%", height: "100%", objectFit: "cover",
                      }} />
                      <div style={{
                        position: "absolute", top: 4, right: 4,
                        width: 20, height: 20, borderRadius: "50%",
                        backgroundColor: "rgba(239,68,68,0.85)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 0 6px rgba(239,68,68,0.5)",
                      }}>
                        <span className="material-icons" style={{ fontSize: 13, color: "#fff" }}>close</span>
                      </div>
                    </>
                  ) : (
                    <div style={{
                      position: "absolute", inset: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span className="material-icons" style={{ fontSize: 28, color: "rgba(90,191,230,0.15)" }}>add</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Lock Sequence button — appears when order is complete */}
        {isOrderComplete && !waiting && (
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 16, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => void handleLockOrder()}
              className="ko-btn ko-btn-primary"
              style={{ padding: "12px 40px" }}
            >
              <span className="ko-btn-text" style={{
                fontSize: 18, fontWeight: 800, textTransform: "uppercase",
                letterSpacing: 3, color: "#fff",
              }}>LOCK SEQUENCE</span>
              <span className="material-icons ko-btn-icon" style={{ fontSize: 22, color: "#fff" }}>double_arrow</span>
            </button>
            {lockError && <span style={{ fontSize: 12, color: "#f87171" }}>{lockError}</span>}
          </div>
        )}

        {/* Waiting overlay — multiplayer only */}
        {waiting && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 50,
            backgroundColor: "rgba(0,0,0,0.75)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 20,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              border: "4px solid rgba(90,191,230,0.3)",
              borderTopColor: "#5abfe6",
              animation: "spin 0.9s linear infinite",
            }} />
            <span style={{ fontSize: 20, fontWeight: 700, color: "#5abfe6", textTransform: "uppercase", letterSpacing: 3 }}>
              Waiting for opponent...
            </span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="ko-btn ko-btn-secondary"
          style={{
            position: "absolute", left: 32, top: 32,
            padding: "8px 16px", zIndex: 20,
          }}
        >
          <span className="material-icons ko-btn-icon" style={{ fontSize: 16, color: "rgba(255,255,255,0.9)" }}>arrow_back_ios</span>
          <span className="ko-btn-text" style={{ fontSize: 13, letterSpacing: 1.5, fontWeight: 700, color: "rgba(255,255,255,0.9)", textTransform: "uppercase" }}>Back</span>
        </button>

      </div>
    </div>
  );
}
