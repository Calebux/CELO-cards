"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "../lib/gameStore";
import { CARDS, Card, CardType, CHARACTERS } from "../lib/gameData";
import { WalletSection } from "../components/WalletSection";

// ── Assets ─────────────────────────────────────────────────────────────────
const BG_MAIN = "/new addition/new_loadout_bg.webp";

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
  all: "#56a4cb",
  strike: "#f97316",
  defense: "#3b82f6",
  control: "#a855f7",
};

// Special cards shown separately below
const SPECIAL_STRIKE_ID = "phantom_break";
const SPECIAL_DEFENSE_ID = "reversal_edge";

function getPlayTips(charId?: string): string[] {
  switch (charId) {
    case "kaira":
      return ["Open aggressive on slot 1 to trigger First Strike.", "Save Ultimate for high-knock strike cards."];
    case "kenji":
      return ["Prioritize cards with high priority to snowball.", "Use Ultimate when you expect a slot win."];
    case "riven":
      return ["Anchor risky cards on slot 3 for passive value.", "Use Ultimate to nullify enemy power spikes."];
    case "zane":
      return ["Lean into strike-heavy sequences for bonus knock.", "Use Ultimate before opponent burst turns."];
    case "elara":
      return ["Mix control cards to sustain drain pressure.", "Ultimate works best when tempo is contested."];
    default:
      return ["Build a balanced sequence of strike, defense, and control.", "Keep 1 low-energy card for flexibility."];
  }
}

function compactText(text?: string): string {
  if (!text) return "—";
  const firstSentence = text.split(".")[0]?.trim() ?? text.trim();
  return firstSentence.length > 64 ? `${firstSentence.slice(0, 61)}...` : `${firstSentence}${firstSentence.endsWith(".") ? "" : "."}`;
}

function CardTooltip({ card }: { card: Card }) {
  const typeColors: Record<string, string> = { strike: "#f97316", defense: "#3b82f6", control: "#a855f7" };
  const col = typeColors[card.type] ?? "#56a4cb";
  return (
    <div style={{
      position: "absolute", top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
      width: 210, zIndex: 200, pointerEvents: "none",
      backgroundColor: "rgba(8, 12, 24, 0.98)",
      border: `1.5px solid ${col}70`,
      borderRadius: 8,
      padding: "12px 14px",
      boxShadow: `0 0 20px ${col}30, 0 8px 32px rgba(0,0,0,0.9)`,
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: col, borderRadius: "10px 10px 0 0" }} />
      <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>{card.name}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 9 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: col, backgroundColor: `${col}20`, padding: "2px 7px", borderRadius: 3, textTransform: "uppercase" }}>{card.type}</span>
        <span style={{ fontSize: 9, color: "#94a3b8", padding: "2px 7px", backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 3 }}>⚡{card.energyCost}</span>
      </div>
      <p style={{ fontSize: 11, color: "#94a3b8", lineHeight: "15px", margin: 0, marginBottom: 11 }}>{card.effect}</p>
      <div style={{ display: "flex", gap: 14, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 9 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>{card.knock}</div>
          <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Knock</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>{card.priority}</div>
          <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Priority</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>{card.energyCost}</div>
          <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Energy</div>
        </div>
      </div>
    </div>
  );
}

export default function Loadout() {
  const storePersist = (useGameStore as typeof useGameStore & {
    persist?: {
      hasHydrated?: () => boolean;
      onHydrate?: (fn: () => void) => () => void;
      onFinishHydration?: (fn: () => void) => () => void;
    };
  }).persist;
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(0);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [isShortLandscape, setIsShortLandscape] = useState(false);
  const [storeHydrated, setStoreHydrated] = useState(
    typeof window !== "undefined" ? (storePersist?.hasHydrated?.() ?? true) : true
  );
  const safeTop = "env(safe-area-inset-top)";
  const safeBottom = "env(safe-area-inset-bottom)";

  const {
    selectedCharacter,
    selectCharacter,
    currentOrder,
    addCardToSlot,
    removeCardFromSlot,
    lockOrder,
    maxEnergy,
    matchId,
    playerRole,
    roundNumber,
    playerRoundsWon,
    opponentRoundsWon,
    setPrecomputedFromServer,
    deckPresets,
    savePreset,
    loadPreset,
    deletePreset,
    unlockedPremiumCards,
    setOpponentCharacterFromServer,
    setOpponentName,
    resetMatch,
  } = useGameStore();
  const [lockError, setLockError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [pollErrorCount, setPollErrorCount] = useState(0);
  const [netStatus, setNetStatus] = useState<"online" | "reconnecting" | "offline">("online");
  const [graceRemainingMs, setGraceRemainingMs] = useState<number>(0);
  const [showPresets, setShowPresets] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");

  const currentFilter = TABS[activeTab].filter;
  const accentColor = TYPE_COLORS[currentFilter];

  const usedEnergy = currentOrder.reduce((s, c) => s + (c?.energyCost ?? 0), 0);
  const remainingEnergy = maxEnergy - usedEnergy;

  // Separate regular cards from special cards per tab
  const getCardsForTab = () => {
    const baseCards = CARDS.filter(c => !c.isPremium || unlockedPremiumCards.includes(c.id));
    let cards = currentFilter === "all" ? baseCards : baseCards.filter((c) => c.type === currentFilter);

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
    if (!storePersist?.onHydrate || !storePersist?.onFinishHydration || !storePersist?.hasHydrated) {
      setStoreHydrated(true);
      return;
    }
    const unsubStart = storePersist.onHydrate(() => setStoreHydrated(false));
    const unsubFinish = storePersist.onFinishHydration(() => setStoreHydrated(true));
    setStoreHydrated(storePersist.hasHydrated());
    return () => {
      unsubStart();
      unsubFinish();
    };
  }, [storePersist]);

  useEffect(() => {
    if (storeHydrated && !selectedCharacter) {
      const fallback = CHARACTERS.find((c) => !c.isLocked) ?? CHARACTERS[0];
      if (fallback) selectCharacter(fallback);
    }
  }, [selectedCharacter, selectCharacter, storeHydrated]);

  useEffect(() => {
    const scale = () => {
      if (!wrapRef.current) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setIsShortLandscape(vw > vh && vh < 760);
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

  // Multiplayer polling + retry refs
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollDelayRef = useRef(2000);
  const pendingSubmitRef = useRef<{ role: "host" | "joiner"; cardIds: string[]; round: number } | null>(null);
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);
  useEffect(() => {
    const handleOnline = () => {
      setNetStatus("online");
      pollDelayRef.current = 2000;
      const p = pendingSubmitRef.current;
      if (p && matchId) {
        void fetch(`/api/match/${matchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        }).catch(() => {});
      }
    };
    const handleOffline = () => setNetStatus("offline");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [matchId]);

  const handleLockOrder = useCallback(async () => {
    if (!isOrderComplete) return;
    setLockError(null);

    // Solo path — unchanged
    if (!playerRole || !matchId) {
      await lockOrder();
      router.push("/gameplay");
      return;
    }

    // Multiplayer path
    const cardIds = currentOrder
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .map((c) => c.id);

    const payload = { role: playerRole, cardIds, round: roundNumber } as const;
    pendingSubmitRef.current = payload;
    const pendingKey = `pending-submit:${matchId}`;
    try { sessionStorage.setItem(pendingKey, JSON.stringify(payload)); } catch {}
    setWaiting(true);
    setNetStatus(navigator.onLine ? "online" : "offline");
    pollDelayRef.current = 2000;

    const submitPending = async () => {
      if (!pendingSubmitRef.current || !matchId) return;
      try {
        await fetch(`/api/match/${matchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pendingSubmitRef.current),
        });
      } catch {
        // keep queued; we'll retry on reconnect/poll
      }
    };

    const stopPolling = () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      pollRef.current = null;
    };

    const pollOnce = async () => {
      if (!matchId || !playerRole) return;
      try {
        const res = await fetch(`/api/match/${matchId}?role=${playerRole}`);
        const data = await res.json() as {
          phase: string;
          slots: unknown;
          opponentCharId?: string;
          opponentName?: string | null;
          abortedBy?: "host" | "joiner" | null;
          opponentReconnecting?: boolean;
          graceRemainingMs?: number;
        };
        setPollErrorCount(0); // successful response
        setNetStatus("online");
        pollDelayRef.current = 2000;
        setGraceRemainingMs(data.graceRemainingMs ?? 0);

        // Sync opponent character if joined
        if (data.opponentCharId) {
          setOpponentCharacterFromServer(data.opponentCharId);
        }
        if (data.opponentName !== undefined) {
          setOpponentName(data.opponentName);
        }

        // Abort if timed out or opponent quit
        const opponentRole = playerRole === "host" ? "joiner" : "host";
        if (data.phase === "timed-out" || data.abortedBy === opponentRole) {
          stopPolling();
          alert("Your opponent has left the match.");
          resetMatch();
          router.push("/");
          return;
        }

        if (data.phase === "resolved" && data.slots) {
          stopPolling();
          try { sessionStorage.removeItem(pendingKey); } catch {}
          pendingSubmitRef.current = null;
          setPrecomputedFromServer(data.slots as Parameters<typeof setPrecomputedFromServer>[0]);
          router.push("/gameplay");
          return;
        }
        if (data.opponentReconnecting) {
          setNetStatus("reconnecting");
        }
      } catch {
        setPollErrorCount((n) => n + 1);
        setNetStatus(navigator.onLine ? "reconnecting" : "offline");
        pollDelayRef.current = Math.min(10_000, Math.round(pollDelayRef.current * 1.5));
        await submitPending();
      }
      pollRef.current = setTimeout(() => { void pollOnce(); }, pollDelayRef.current);
    };

    void submitPending();
    void pollOnce();
  }, [isOrderComplete, playerRole, matchId, currentOrder, roundNumber, lockOrder, setPrecomputedFromServer, router]);

  const isCardInOrder = (card: Card) => currentOrder.some((s) => s?.id === card.id);

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left" }}>

        {/* Background */}
        <img src={BG_MAIN} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />

        {/* ── Top Bar ── */}
        <div style={{ position: "absolute", top: safeTop, left: 0, right: 0, height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.75)", zIndex: 10 }}>
          {/* Left: back + logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={() => router.back()} className="ko-btn ko-btn-secondary" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px" }}>
              <span className="material-icons ko-btn-icon" style={{ fontSize: 16, color: "rgba(255,255,255,0.9)" }}>arrow_back_ios</span>
              <span className="ko-btn-text" style={{ fontSize: 13, letterSpacing: 1.5, fontWeight: 700, color: "rgba(255,255,255,0.9)", textTransform: "uppercase" }}>Back</span>
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 4, height: 28, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
              <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase" }}>ACTION ORDER</span>
            </div>
          </div>

          {/* Round + score */}
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10, padding: "5px 14px", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 2 }}>Round {roundNumber}</span>
            <div style={{ width: 1, height: 14, backgroundColor: "rgba(255,255,255,0.12)" }} />
            <span style={{ fontSize: 16, fontWeight: 800, color: "#56a4cb", letterSpacing: 1, fontVariantNumeric: "tabular-nums" }}>{playerRoundsWon}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>—</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: "rgba(255,255,255,0.4)", letterSpacing: 1, fontVariantNumeric: "tabular-nums" }}>{opponentRoundsWon}</span>
          </div>

          {/* Wallet */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <WalletSection />
          </div>
        </div>

        {/* Left character panel — compact portrait + ability intel */}
        <div style={{
          position: "absolute", left: 164, top: `calc(${safeTop} + 68px)`, width: 306, height: 520,
          display: "flex", flexDirection: "column", gap: 10,
          pointerEvents: "none",
        }}>
          {selectedCharacter && (
            <>
              <div style={{
                position: "relative", height: 318,
                overflow: "hidden",
                borderRadius: 8,
                border: `1.5px solid ${selectedCharacter.color}55`,
                boxShadow: `0 0 24px ${selectedCharacter.color}20`,
              }}>
                <img
                  src={selectedCharacter.standingArt}
                  alt={selectedCharacter.name}
                  style={{
                    position: "absolute", width: "100%", height: "100%",
                    objectFit: "cover", objectPosition: "top center",
                    transform: "scale(0.9)",
                  }}
                />
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to top, rgba(5,5,5,0.92) 0%, rgba(5,5,5,0.25) 42%, transparent 72%)",
                }} />
                <div style={{ position: "absolute", bottom: 14, left: 14, right: 14 }}>
                  <span style={{
                    display: "block", fontSize: 9, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: 2.4,
                    color: selectedCharacter.color, marginBottom: 4,
                  }}>
                    {selectedCharacter.className}
                  </span>
                  <div style={{
                    fontSize: 22, fontWeight: 800, color: "#fff",
                    letterSpacing: -0.7, lineHeight: 1,
                    textShadow: `0 0 20px ${selectedCharacter.color}66`,
                  }}>
                    {selectedCharacter.name}
                  </div>
                </div>
              </div>

              <div style={{
                height: 192,
                borderRadius: 8,
                background: "rgba(10,15,28,0.88)",
                border: `1.5px solid ${selectedCharacter.color}35`,
                boxShadow: `inset 0 1px 0 ${selectedCharacter.color}22`,
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                overflow: "hidden",
              }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2.3, color: selectedCharacter.color, textTransform: "uppercase" }}>
                  Ability Intel
                </div>
                <div style={{ padding: "7px 9px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(148,163,184,0.2)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#7dd3fc", textTransform: "uppercase", letterSpacing: 1.4 }}>Passive · {selectedCharacter.passive?.name ?? "—"}</div>
                  <div style={{ marginTop: 3, fontSize: 10, color: "#cbd5e1", lineHeight: 1.28 }}>{compactText(selectedCharacter.passive?.description ?? "No passive available.")}</div>
                </div>
                <div style={{ padding: "7px 9px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(148,163,184,0.2)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 1.4 }}>Ultimate · {selectedCharacter.ultimate?.name ?? "—"}</div>
                  <div style={{ marginTop: 3, fontSize: 10, color: "#cbd5e1", lineHeight: 1.28 }}>{compactText(selectedCharacter.ultimate?.description ?? "No ultimate available.")}</div>
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(148,163,184,0.2)" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#56a4cb", textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 4 }}>Best Move Tip</div>
                  </div>
                  <div style={{ fontSize: 9.5, color: "#cbd5e1", lineHeight: 1.28 }}>
                    • {getPlayTips(selectedCharacter.id)[0]}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ═══════════════ NEW Card Selection Panel ═══════════════ */}
        <div style={{
          position: "absolute",
          left: 480, top: `calc(${safeTop} + 68px)`,
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
                  const isHovered = hoveredCardId === card.id;
                  return (
                    <div
                      key={card.id}
                      onClick={() => {
                        if (inOrder) {
                          const slotIdx = currentOrder.findIndex(s => s?.id === card.id);
                          if (slotIdx !== -1) removeCardFromSlot(slotIdx);
                        } else if (!tooExpensive) {
                          addCardToSlot(card);
                        }
                      }}
                      onMouseEnter={() => setHoveredCardId(card.id)}
                      onMouseLeave={() => setHoveredCardId(null)}
                      style={{
                        width: 152, height: 210,
                        position: "relative", flexShrink: 0,
                        overflow: "visible", borderRadius: 8,
                        cursor: tooExpensive ? "default" : "pointer",
                        opacity: tooExpensive ? 0.45 : 1,
                        border: inOrder
                          ? "2px solid rgba(74,222,128,0.7)"
                          : tooExpensive
                          ? "2px solid rgba(239,68,68,0.3)"
                          : `2px solid ${isHovered ? card.color : card.color + "30"}`,
                        boxShadow: inOrder
                          ? "0 0 16px rgba(74,222,128,0.4)"
                          : isHovered
                          ? `0 0 20px ${card.color}50, 0 8px 32px rgba(0,0,0,0.7)`
                          : `0 4px 16px rgba(0,0,0,0.5), 0 0 0 1px ${card.color}15`,
                        transition: "all 0.18s ease",
                        filter: tooExpensive ? "grayscale(0.6)" : "none",
                        transform: isHovered && !tooExpensive ? "translateY(-4px)" : "none",
                        zIndex: isHovered ? 50 : "auto",
                      }}
                    >
                      {isHovered && <CardTooltip card={card} />}
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
                          backgroundColor: "rgba(0,0,0,0.45)",
                        }}>
                          <span className="material-icons" style={{ fontSize: 28, color: "#4ade80" }}>check_circle</span>
                          <span style={{ position: "absolute", bottom: 6, fontSize: 9, fontWeight: 700, color: "#4ade80", letterSpacing: 1, textTransform: "uppercase" }}>tap to remove</span>
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
                    const spHovered = hoveredCardId === specialCard.id;
                    return (
                  <div
                    onClick={() => {
                      if (spInOrder) {
                        const slotIdx = currentOrder.findIndex(s => s?.id === specialCard.id);
                        if (slotIdx !== -1) removeCardFromSlot(slotIdx);
                      } else if (!spTooExp) {
                        addCardToSlot(specialCard);
                      }
                    }}
                    onMouseEnter={() => setHoveredCardId(specialCard.id)}
                    onMouseLeave={() => setHoveredCardId(null)}
                    style={{
                      width: 170, height: 235,
                      position: "relative", overflow: "visible",
                      borderRadius: 10,
                      cursor: spTooExp ? "default" : "pointer",
                      opacity: spTooExp ? 0.45 : 1,
                      border: `3px solid ${specialCard.color}`,
                      boxShadow: spHovered
                        ? `0 0 40px ${specialCard.color}80, 0 12px 40px rgba(0,0,0,0.8)`
                        : `0 0 24px ${specialCard.color}50, 0 8px 32px rgba(0,0,0,0.6)`,
                      transition: "all 0.18s ease",
                      filter: spTooExp ? "grayscale(0.6)" : "none",
                      transform: spHovered && !spTooExp ? "translateY(-4px)" : "none",
                      zIndex: spHovered ? 50 : "auto",
                    }}
                  >
                    {spHovered && <CardTooltip card={specialCard} />}
                    <img src={specialCard.image} alt={specialCard.name} style={{
                      position: "absolute", width: "100%", height: "100%", objectFit: "cover",
                    }} />
                    {spInOrder && (
                      <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        backgroundColor: "rgba(0,0,0,0.45)",
                      }}>
                        <span className="material-icons" style={{ fontSize: 38, color: "#4ade80" }}>check_circle</span>
                        <span style={{ position: "absolute", bottom: 48, fontSize: 9, fontWeight: 700, color: "#4ade80", letterSpacing: 1, textTransform: "uppercase" }}>tap to remove</span>
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
          left: 200, top: isShortLandscape ? 580 : 600,
          width: 1100, height: 230,
          backgroundColor: "#0b0f1a",
          zIndex: 9,
        }} />

        {/* ═══════════════ Bottom Deck Loadout ═══════════════ */}
        <div style={{
          position: "absolute",
          left: 250, top: isShortLandscape ? 585 : 605,
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
            border: "2px solid #56a4cb",
            borderRadius: 6,
            padding: "4px 24px",
            boxShadow: "0 0 12px rgba(90, 191, 230, 0.5)",
          }}>
            <span style={{
              fontSize: 14, fontWeight: 800, textTransform: "uppercase",
              letterSpacing: 3, color: "#56a4cb",
              textShadow: "0 0 8px rgba(90,191,230,0.6)",
            }}>DECK LOADOUT</span>
          </div>

          {/* Preset controls — bottom-left so dialogs are always visible */}
          <div style={{ position: "absolute", left: 20, bottom: 12, zIndex: 40 }}>
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: 6 }}>
                {/* Save preset */}
                {isOrderComplete && !savingPreset && (
                  <button
                    onClick={() => { setSavingPreset(true); setPresetName(""); setShowPresets(false); }}
                    style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 5, padding: "4px 10px", color: "#4ade80", fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: 1 }}
                  >SAVE</button>
                )}
                {/* Load presets */}
                {deckPresets.length > 0 && (
                  <button
                    onClick={() => { setShowPresets((v) => !v); setSavingPreset(false); }}
                    style={{ background: "rgba(86,164,203,0.1)", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 5, padding: "4px 10px", color: "#56a4cb", fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: 1 }}
                  >PRESETS ({deckPresets.length})</button>
                )}
              </div>

              {/* Save preset input */}
              {savingPreset && (
                <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, background: "rgba(10,15,25,0.97)", border: "1px solid rgba(86,164,203,0.35)", borderRadius: 8, padding: "12px 14px", width: 220, zIndex: 300, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#56a4cb", letterSpacing: 1.5, textTransform: "uppercase" }}>Save Preset</div>
                  <input
                    autoFocus
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="Preset name…"
                    maxLength={20}
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 5, padding: "6px 10px", color: "#f1f5f9", fontSize: 12, outline: "none" }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { savePreset(presetName); setSavingPreset(false); }
                      if (e.key === "Escape") setSavingPreset(false);
                    }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { savePreset(presetName); setSavingPreset(false); }} style={{ flex: 1, background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.35)", borderRadius: 5, padding: "6px", color: "#4ade80", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>SAVE</button>
                    <button onClick={() => setSavingPreset(false)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, padding: "6px 10px", color: "#64748b", fontSize: 11, cursor: "pointer" }}>✕</button>
                  </div>
                </div>
              )}

              {/* Preset list dropdown */}
              {showPresets && (
                <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, background: "rgba(10,15,25,0.97)", border: "1px solid rgba(86,164,203,0.35)", borderRadius: 8, padding: "12px", width: 260, zIndex: 300, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#56a4cb", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>Saved Presets</div>
                  {deckPresets.map((preset, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{preset.name || `Preset ${idx + 1}`}</div>
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{preset.cardIds.length} cards</div>
                      </div>
                      <button onClick={() => { loadPreset(idx); setShowPresets(false); }} style={{ background: "rgba(86,164,203,0.12)", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 4, padding: "4px 10px", color: "#56a4cb", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>LOAD</button>
                      <button onClick={() => deletePreset(idx)} style={{ background: "none", border: "none", color: "#475569", fontSize: 14, cursor: "pointer", padding: "2px" }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Energy bar — keep clear at top-right */}
          <div style={{ position: "absolute", top: 14, right: 20, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#56a4cb", textTransform: "uppercase", letterSpacing: 1 }}>
              ⚡ {usedEnergy} / {maxEnergy}
            </span>
            <div style={{ width: 120, height: 8, borderRadius: 4, backgroundColor: "rgba(0,0,0,0.5)", border: "1px solid rgba(90,191,230,0.3)", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.min(100, (usedEnergy / maxEnergy) * 100)}%`,
                backgroundColor: usedEnergy >= maxEnergy ? "#ef4444" : "#56a4cb",
                borderRadius: 4,
                transition: "width 0.3s ease, background-color 0.2s",
                boxShadow: `0 0 8px ${usedEnergy >= maxEnergy ? "#ef4444" : "#56a4cb"}80`,
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
                    border: card ? "2px solid #56a4cb" : "2px solid rgba(90, 191, 230, 0.2)",
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
                      {/* Name gradient background */}
                      <div style={{
                        position: "absolute", bottom: 0, left: 0, right: 0,
                        background: "linear-gradient(to top, rgba(0,0,0,0.9), transparent)",
                        padding: "20px 4px 6px 4px", textAlign: "center"
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: 0.5, textShadow: "0 1px 4px #000" }}>
                          {card.name}
                        </span>
                      </div>
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
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: `calc(${safeBottom} + ${isShortLandscape ? 24 : 16}px)`, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
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
              borderTopColor: "#56a4cb",
              animation: "spin 0.9s linear infinite",
            }} />
            <span style={{ fontSize: 20, fontWeight: 700, color: "#56a4cb", textTransform: "uppercase", letterSpacing: 3 }}>
              Waiting for opponent...
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "rgba(86,164,203,0.08)", border: "1px solid rgba(86,164,203,0.28)", borderRadius: 6 }}>
              <span className="material-icons" style={{ color: netStatus === "offline" ? "#f87171" : netStatus === "reconnecting" ? "#fbbf24" : "#4ade80", fontSize: 14 }}>
                {netStatus === "offline" ? "wifi_off" : netStatus === "reconnecting" ? "sync" : "wifi"}
              </span>
              <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
                {netStatus === "offline" ? "Offline — queued, will auto-resend" : netStatus === "reconnecting" ? "Reconnecting..." : "Connected"}
              </span>
            </div>
            {graceRemainingMs > 0 && (
              <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 600 }}>
                Opponent reconnect grace: {Math.ceil(graceRemainingMs / 1000)}s
              </div>
            )}
            {pollErrorCount >= 3 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 6 }}>
                <span className="material-icons" style={{ color: "#fbbf24", fontSize: 14 }}>wifi_off</span>
                <span style={{ fontSize: 12, color: "#fbbf24", fontWeight: 600 }}>Connection issues — retrying…</span>
                <button
                  onClick={async () => {
                    const p = pendingSubmitRef.current;
                    if (!p || !matchId) return;
                    try {
                      await fetch(`/api/match/${matchId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(p),
                      });
                      setPollErrorCount(0);
                    } catch {}
                  }}
                  style={{ marginLeft: 10, background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.5)", borderRadius: 4, color: "#fbbf24", fontSize: 11, fontWeight: 700, padding: "4px 8px", cursor: "pointer" }}
                >
                  RETRY NOW
                </button>
              </div>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

      </div>
    </div>
  );
}
