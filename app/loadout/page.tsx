"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useGameStore } from "../lib/gameStore";
import { CARDS, Card, CardType, CHARACTERS } from "../lib/gameData";
import { ArchetypeKey, CARD_INTEL, getPlayTips, getStarterArchetypes } from "../lib/archetypes";
import { MiniPayImage } from "../components/MiniPayImage";
import { OnboardingCoach } from "../components/OnboardingCoach";
import { WalletSection } from "../components/WalletSection";
import { getCardForgeProgress, getCardMasteryPerkCopy, getCardMasterySnapshot } from "../lib/cardMastery";
import { useAttunementSync } from "../lib/useSignatureCardSync";
import { isMiniPay } from "../lib/minipay";

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
const LOADOUT_GUIDE_KEY = "ao-loadout-guide-seen";

function compactText(text?: string): string {
  if (!text) return "—";
  const firstSentence = text.split(".")[0]?.trim() ?? text.trim();
  return firstSentence.length > 64 ? `${firstSentence.slice(0, 61)}...` : `${firstSentence}${firstSentence.endsWith(".") ? "" : "."}`;
}

function compactPresetWhy(text?: string): string {
  if (!text) return "";
  return text.length > 58 ? `${text.slice(0, 55).trimEnd()}...` : text;
}

type TooltipAnchor = { left: number; top: number; width: number; height: number };

function CardTooltip({
  card,
  anchor,
  stats,
  isAttuned,
  mobileSheet = false,
}: {
  card: Card;
  anchor: TooltipAnchor;
  stats: Parameters<typeof getCardMasterySnapshot>[0];
  isAttuned: boolean;
  mobileSheet?: boolean;
}) {
  const typeColors: Record<string, string> = { strike: "#f97316", defense: "#3b82f6", control: "#a855f7" };
  const col = typeColors[card.type] ?? "#56a4cb";
  const intel = CARD_INTEL[card.id];
  const mastery = getCardMasterySnapshot(stats);
  const forge = !card.isPremium ? getCardForgeProgress(stats) : null;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;
  const tooltipWidth = mobileSheet ? Math.min(336, Math.max(276, viewportWidth - 24)) : 228;
  const tooltipHeight = mobileSheet ? 320 : 286;
  const preferLeft = anchor.left + anchor.width / 2 + tooltipWidth > viewportWidth - 16;
  const left = mobileSheet
    ? Math.max(12, (viewportWidth - tooltipWidth) / 2)
    : preferLeft
      ? Math.max(12, anchor.left + anchor.width / 2 - tooltipWidth)
      : Math.min(viewportWidth - tooltipWidth - 12, anchor.left + anchor.width / 2);
  const top = mobileSheet
    ? Math.max(12, viewportHeight - tooltipHeight - 20)
    : Math.min(
        Math.max(12, anchor.top + anchor.height / 2 - tooltipHeight / 2),
        Math.max(12, viewportHeight - tooltipHeight - 12),
      );

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top,
        left,
        width: tooltipWidth,
        zIndex: 600,
        pointerEvents: "none",
        backgroundColor: "rgba(8, 12, 24, 0.98)",
        border: `1.5px solid ${col}70`,
        borderRadius: mobileSheet ? 12 : 8,
        padding: mobileSheet ? "14px 16px" : "12px 14px",
        boxShadow: mobileSheet ? `0 0 24px ${col}26, 0 16px 36px rgba(0,0,0,0.9)` : `0 0 20px ${col}30, 0 8px 32px rgba(0,0,0,0.9)`,
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: col, borderRadius: "10px 10px 0 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontSize: mobileSheet ? 14 : 13, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 }}>{card.name}</div>
        {(isAttuned || mastery.tier > 0 || forge?.ready) && (
          <div style={{ padding: "2px 7px", borderRadius: 999, border: "1px solid rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.14)", color: "#fbbf24", fontSize: 8, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", flexShrink: 0 }}>
            {isAttuned ? "Attuned" : forge?.ready ? "Forge Ready" : `T${mastery.tier}`}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 9, flexWrap: "wrap" }}>
        <span style={{ fontSize: mobileSheet ? 10 : 9, fontWeight: 700, color: col, backgroundColor: `${col}20`, padding: mobileSheet ? "3px 8px" : "2px 7px", borderRadius: 3, textTransform: "uppercase" }}>{card.type}</span>
        <span style={{ fontSize: mobileSheet ? 10 : 9, color: "#94a3b8", padding: mobileSheet ? "3px 8px" : "2px 7px", backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 3 }}>⚡{card.energyCost}</span>
        <span style={{ fontSize: mobileSheet ? 10 : 9, color: "#fbbf24", padding: mobileSheet ? "3px 8px" : "2px 7px", backgroundColor: "rgba(251,191,36,0.08)", borderRadius: 3 }}>{mastery.xp} XP</span>
      </div>
      <p style={{ fontSize: mobileSheet ? 12 : 11, color: "#94a3b8", lineHeight: mobileSheet ? "17px" : "15px", margin: 0, marginBottom: 10 }}>{card.effect}</p>
      {intel && (
        <div style={{ marginBottom: 10, padding: "7px 8px", borderRadius: 6, background: "rgba(86,164,203,0.08)", border: "1px solid rgba(86,164,203,0.18)" }}>
          <div style={{ fontSize: mobileSheet ? 10 : 9, color: "#56a4cb", letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 700 }}>Role: {intel.role}</div>
          <div style={{ fontSize: mobileSheet ? 10 : 9, color: "#93c5fd", marginTop: 3 }}>Strong vs {intel.strongVs}</div>
          <div style={{ fontSize: mobileSheet ? 10 : 9, color: "#fca5a5", marginTop: 2 }}>Weak vs {intel.weakVs}</div>
        </div>
      )}
      <div style={{ marginBottom: 10, padding: "7px 8px", borderRadius: 6, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.18)" }}>
        <div style={{ fontSize: mobileSheet ? 10 : 9, color: "#fbbf24", letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 700 }}>
          Mastery {mastery.tier > 0 ? `T${mastery.tier}` : "Unranked"}
        </div>
        <div style={{ fontSize: mobileSheet ? 10 : 9, color: "#f8fafc", marginTop: 4, lineHeight: 1.4 }}>
          {isAttuned ? getCardMasteryPerkCopy() : "Attune this card to activate its first reveal surge."}
        </div>
        {forge && (
          <div style={{ fontSize: mobileSheet ? 10 : 9, color: forge.ready ? "#fbbf24" : "#cbd5e1", marginTop: 5, lineHeight: 1.35 }}>
            {forge.ready
              ? "Forge path complete. This normal card is ready for Black Market ascension."
              : `Forge progress: ${forge.requirements.filter((requirement) => requirement.complete).length}/${forge.requirements.length} requirements complete.`}
          </div>
        )}
      </div>
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
          <div style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>{mastery.tier > 0 ? `T${mastery.tier}` : "T0"}</div>
          <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Tier</div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Loadout() {
  const isMp = isMiniPay();
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
  const [hoveredTooltip, setHoveredTooltip] = useState<{ card: Card; anchor: TooltipAnchor } | null>(null);
  const [pinnedTooltip, setPinnedTooltip] = useState<{ card: Card; anchor: TooltipAnchor } | null>(null);
  const [isTouchMode, setIsTouchMode] = useState(false);
  const [isCompactPhone, setIsCompactPhone] = useState(false);
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
    cardPerformance,
    setSelectedCharacterFromServer,
    setOpponentCharacterFromServer,
    setCurrentOrderFromIds,
    syncMultiplayerRoundState,
    setOpponentName,
    resetMatch,
    markOnboardingStep,
    attunedCardIds,
  } = useGameStore();
  const { toggleAttunedCard: syncAttunedCard } = useAttunementSync();
  const [lockError, setLockError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [pollErrorCount, setPollErrorCount] = useState(0);
  const [netStatus, setNetStatus] = useState<"online" | "reconnecting" | "offline">("online");
  const [graceRemainingMs, setGraceRemainingMs] = useState<number>(0);
  const [showPresets, setShowPresets] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [tutorialStep, setTutorialStep] = useState(0);
  const [showLoadoutGuide, setShowLoadoutGuide] = useState(false);
  const [selectedArchetypeKey, setSelectedArchetypeKey] = useState<ArchetypeKey | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressCardTapRef = useRef(false);

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
  const starterArchetypes = getStarterArchetypes(selectedCharacter?.id);
  const selectedArchetype = starterArchetypes.find((preset) => preset.key === selectedArchetypeKey) ?? starterArchetypes[0] ?? null;
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
    if (storeHydrated && !selectedCharacter && !(matchId && playerRole)) {
      const fallback = CHARACTERS.find((c) => !c.isLocked) ?? CHARACTERS[0];
      if (fallback) selectCharacter(fallback);
    }
  }, [selectedCharacter, selectCharacter, storeHydrated, matchId, playerRole]);

  useEffect(() => {
    if (!storeHydrated || !matchId || !playerRole) return;
    let cancelled = false;

    const syncFromServer = async () => {
      try {
        const res = await fetch(`/api/match/${matchId}?role=${playerRole}`);
        if (!res.ok) return;
        const data = await res.json() as {
          phase: "waiting-for-opponent" | "resolved" | "lobby" | "timed-out";
          round: number;
          hostWins: number;
          opponentWins: number;
          selfCharId?: string | null;
          opponentCharId?: string | null;
          opponentName?: string | null;
          selfCardIds?: string[] | null;
          slots?: Parameters<typeof setPrecomputedFromServer>[0] | null;
        };
        if (cancelled) return;

        if (data.selfCharId) setSelectedCharacterFromServer(data.selfCharId);
        if (data.opponentCharId) setOpponentCharacterFromServer(data.opponentCharId);
        if (data.opponentName !== undefined) setOpponentName(data.opponentName);
        const serverIsCurrentOrNewerRound = data.round >= roundNumber;
        if (serverIsCurrentOrNewerRound) {
          syncMultiplayerRoundState({
            roundNumber: data.round,
            selfWins: data.hostWins,
            opponentWins: data.opponentWins,
            resolvedSlots: data.phase === "resolved" ? data.slots ?? null : null,
          });
        }
        if (serverIsCurrentOrNewerRound && Array.isArray(data.selfCardIds) && data.selfCardIds.length === 5) {
          setCurrentOrderFromIds(data.selfCardIds);
        }
        if (data.phase === "resolved" && data.slots && serverIsCurrentOrNewerRound) {
          router.replace("/gameplay");
        }
      } catch {
        // Best-effort recovery only.
      }
    };

    void syncFromServer();
    return () => {
      cancelled = true;
    };
  }, [
    storeHydrated,
    matchId,
    playerRole,
    router,
    setCurrentOrderFromIds,
    setOpponentCharacterFromServer,
    setOpponentName,
    setPrecomputedFromServer,
    setSelectedCharacterFromServer,
  ]);

  useEffect(() => {
    const scale = () => {
      if (!wrapRef.current) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setIsShortLandscape(vw > vh && vh < 760);
      setIsCompactPhone(Math.min(vw, vh) <= (isMp ? 560 : 430));
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
  }, [isMp]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(hover: none), (pointer: coarse)");
    const syncTouchMode = () => setIsTouchMode(mq.matches);
    syncTouchMode();
    mq.addEventListener?.("change", syncTouchMode);
    return () => mq.removeEventListener?.("change", syncTouchMode);
  }, []);

  // Multiplayer polling + retry refs
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollDelayRef = useRef(2000);
  const pendingSubmitRef = useRef<{ role: "host" | "joiner"; cardIds: string[]; round: number; attunedCardIds: string[] } | null>(null);
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);
  const beginWaitingForResolution = useCallback((pendingKey: string, expectedRound: number) => {
    if (!matchId || !playerRole) return;

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

    setWaiting(true);
    setNetStatus(navigator.onLine ? "online" : "offline");
    pollDelayRef.current = 2000;

    const pollOnce = async () => {
      if (!matchId || !playerRole) return;
      try {
        const res = await fetch(`/api/match/${matchId}?role=${playerRole}`);
        const data = await res.json() as {
          phase: string;
          round: number;
          hostWins: number;
          opponentWins: number;
          slots: unknown;
          selfCardIds?: string[] | null;
          opponentCharId?: string;
          opponentName?: string | null;
          abortedBy?: "host" | "joiner" | null;
          opponentReconnecting?: boolean;
          graceRemainingMs?: number;
        };
        setPollErrorCount(0);
        setNetStatus("online");
        pollDelayRef.current = 2000;
        setGraceRemainingMs(data.graceRemainingMs ?? 0);

        if (data.opponentCharId) {
          setOpponentCharacterFromServer(data.opponentCharId);
        }
        if (data.opponentName !== undefined) {
          setOpponentName(data.opponentName);
        }

        const serverIsCurrentOrNewerRound = data.round >= expectedRound;
        if (serverIsCurrentOrNewerRound) {
          syncMultiplayerRoundState({
            roundNumber: data.round,
            selfWins: data.hostWins,
            opponentWins: data.opponentWins,
            resolvedSlots: data.phase === "resolved"
              ? data.slots as Parameters<typeof setPrecomputedFromServer>[0]
              : null,
          });
        }
        if (serverIsCurrentOrNewerRound && Array.isArray(data.selfCardIds) && data.selfCardIds.length === 5) {
          setCurrentOrderFromIds(data.selfCardIds);
        }

        const opponentRole = playerRole === "host" ? "joiner" : "host";
        if (data.phase === "timed-out" || data.abortedBy === opponentRole) {
          stopPolling();
          setWaiting(false);
          alert("Your opponent has left the match.");
          resetMatch();
          router.push("/");
          return;
        }

        if (data.phase === "resolved" && data.slots && serverIsCurrentOrNewerRound) {
          stopPolling();
          setWaiting(false);
          try { sessionStorage.removeItem(pendingKey); } catch {}
          pendingSubmitRef.current = null;
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
  }, [
    matchId,
    playerRole,
    resetMatch,
    router,
    setCurrentOrderFromIds,
    setOpponentCharacterFromServer,
    setOpponentName,
    setPrecomputedFromServer,
    syncMultiplayerRoundState,
  ]);
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

  useEffect(() => {
    if (!matchId || !playerRole) return;
    const pendingKey = `pending-submit:${matchId}`;
    try {
      const raw = sessionStorage.getItem(pendingKey);
      if (!raw) return;
      const restored = JSON.parse(raw) as { role?: "host" | "joiner"; cardIds?: string[]; round?: number; attunedCardIds?: string[] };
      if (
        restored.role === playerRole &&
        Array.isArray(restored.cardIds) &&
        restored.cardIds.length === 5 &&
        typeof restored.round === "number" &&
        restored.round === roundNumber
      ) {
        pendingSubmitRef.current = {
          role: restored.role,
          cardIds: restored.cardIds,
          round: restored.round,
          attunedCardIds: Array.isArray(restored.attunedCardIds) ? restored.attunedCardIds.filter((id): id is string => typeof id === "string").slice(0, 2) : [],
        };
        beginWaitingForResolution(pendingKey, restored.round);
        return;
      }
      sessionStorage.removeItem(pendingKey);
    } catch {
      sessionStorage.removeItem(pendingKey);
    }
  }, [beginWaitingForResolution, matchId, playerRole, roundNumber]);

  const handleLockOrder = useCallback(async () => {
    if (!isOrderComplete) return;
    setLockError(null);
    markOnboardingStep("lock_sequence");

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

    const payload = { role: playerRole, cardIds, round: roundNumber, attunedCardIds } as const;
    pendingSubmitRef.current = payload;
    const pendingKey = `pending-submit:${matchId}`;
    try { sessionStorage.setItem(pendingKey, JSON.stringify(payload)); } catch {}
    beginWaitingForResolution(pendingKey, roundNumber);
  }, [beginWaitingForResolution, isOrderComplete, playerRole, matchId, currentOrder, roundNumber, lockOrder, router, markOnboardingStep, attunedCardIds]);

  const isCardInOrder = (card: Card) => currentOrder.some((s) => s?.id === card.id);
  const toggleAttunement = (cardId: string) => {
    setLockError(null);
    void syncAttunedCard(attunedCardIds, cardId).catch((error) => {
      setLockError(error instanceof Error ? error.message : "Failed to update attunement.");
    });
  };
  const tutorialSteps = [
    "Pick 5 cards to build your round loadout. Mix strike, defense, and control.",
    "Watch your energy meter. Staying balanced gives you more flexible counters.",
    "Use SAVE to store decks and PRESETS to quickly switch styles before locking in.",
    "When ready, LOCK SEQUENCE to enter the matchup.",
  ];

  const updateTooltipAnchor = (card: Card, el: HTMLDivElement) => {
    const rect = el.getBoundingClientRect();
    setHoveredTooltip({
      card,
      anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    });
  };

  const beginTouchHoldPreview = (card: Card, el: HTMLDivElement) => {
    if (!isTouchMode) return;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    suppressCardTapRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      suppressCardTapRef.current = true;
      setHoveredCardId(card.id);
      updateTooltipAnchor(card, el);
      const rect = el.getBoundingClientRect();
      setPinnedTooltip({
        card,
        anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      });
    }, 420);
  };

  const cancelTouchHoldPreview = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const applyStarterPreset = (presetKey: ArchetypeKey) => {
    const preset = starterArchetypes.find((p) => p.key === presetKey);
    if (!preset) return;
    setHoveredCardId(null);
    setHoveredTooltip(null);
    setPinnedTooltip(null);
    setSelectedArchetypeKey(presetKey);
    currentOrder.forEach((slot, idx) => {
      if (slot) removeCardFromSlot(idx);
    });
    preset.cardIds.forEach((id) => {
      const card = CARDS.find((c) => c.id === id);
      if (card) addCardToSlot(card);
    });
  };

  useEffect(() => {
    if (!storeHydrated || typeof window === "undefined") return;
    const seen = window.localStorage.getItem(LOADOUT_GUIDE_KEY) === "1";
    if (!seen) {
      setTutorialStep(0);
      setShowLoadoutGuide(true);
    }
  }, [storeHydrated]);

  useEffect(() => {
    setHoveredCardId(null);
    setHoveredTooltip(null);
    setPinnedTooltip(null);
  }, [activeTab]);

  useEffect(() => {
    setSelectedArchetypeKey(null);
  }, [selectedCharacter?.id]);

  useEffect(() => {
    if (filledSlots === 5) {
      markOnboardingStep("build_sequence");
    }
  }, [filledSlots, markOnboardingStep]);

  const dismissLoadoutGuide = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOADOUT_GUIDE_KEY, "1");
    }
    setShowLoadoutGuide(false);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left" }}>

        {/* Background */}
        <MiniPayImage src={BG_MAIN} alt="" minipayWidth={1280} minipayQuality={56} priority style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />

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

        <OnboardingCoach style={{ position: "absolute", top: `calc(${safeTop} + 74px)`, right: 18, zIndex: 45 }} />

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
                <MiniPayImage
                  src={selectedCharacter.standingArt}
                  alt={selectedCharacter.name}
                  minipayWidth={760}
                  minipayQuality={58}
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
            <div
              style={{
                position: "absolute", inset: 0,
                padding: "20px 24px",
                overflowY: "auto",
                display: "flex", flexDirection: "column", gap: 14,
              }}
              onScroll={() => {
                setHoveredCardId(null);
                setHoveredTooltip(null);
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                {regularCards.map((card) => {
                  const inOrder = isCardInOrder(card);
                  const tooExpensive = !inOrder && card.energyCost > remainingEnergy;
                  const isHovered = hoveredCardId === card.id;
                  const isAttuned = attunedCardIds.includes(card.id);
                  const attunementFull = attunedCardIds.length >= 2 && !isAttuned;
                  const masteryTier = getCardMasterySnapshot(cardPerformance[card.id] ?? null).tier;
                  const forgeProgress = !card.isPremium ? getCardForgeProgress(cardPerformance[card.id] ?? null) : null;
                  const progressLabel = forgeProgress?.ready ? "Forge Ready" : masteryTier > 0 ? `T${masteryTier}` : null;
                  return (
                    <div
                      key={card.id}
                      onClick={() => {
                        if (suppressCardTapRef.current) {
                          suppressCardTapRef.current = false;
                          return;
                        }
                        if (inOrder) {
                          const slotIdx = currentOrder.findIndex((s) => s?.id === card.id);
                          if (slotIdx !== -1) removeCardFromSlot(slotIdx);
                        } else if (!tooExpensive) {
                          addCardToSlot(card);
                        }
                      }}
                      onMouseEnter={(e) => {
                        setHoveredCardId(card.id);
                        updateTooltipAnchor(card, e.currentTarget);
                      }}
                      onMouseMove={(e) => {
                        if (hoveredCardId === card.id) updateTooltipAnchor(card, e.currentTarget);
                      }}
                      onMouseLeave={() => {
                        setHoveredCardId(null);
                        setHoveredTooltip(null);
                      }}
                      onPointerDown={(e) => {
                        if (e.pointerType !== "mouse") beginTouchHoldPreview(card, e.currentTarget);
                      }}
                      onPointerUp={cancelTouchHoldPreview}
                      onPointerCancel={cancelTouchHoldPreview}
                      onPointerLeave={() => {
                        cancelTouchHoldPreview();
                      }}
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
                          : `2px solid ${isHovered ? card.color : `${card.color}30`}`,
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
                      <MiniPayImage src={card.image} alt={card.name} minipayWidth={320} minipayQuality={52} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover" }} />
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 50%)", pointerEvents: "none" }} />
                      {inOrder && (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" }}>
                          <span className="material-icons" style={{ fontSize: 28, color: "#4ade80" }}>check_circle</span>
                          <span style={{ position: "absolute", bottom: 6, fontSize: 9, fontWeight: 700, color: "#4ade80", letterSpacing: 1, textTransform: "uppercase" }}>tap to remove</span>
                        </div>
                      )}
                      <div style={{ position: "absolute", top: 7, left: 7, width: 28, height: 28, borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.75)", border: `2px solid ${card.color}80`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 8px ${card.color}30` }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{card.energyCost}</span>
                      </div>
                      <div style={{ position: "absolute", top: 7, right: 7, padding: "2px 6px", borderRadius: 4, backgroundColor: `${card.color}25`, border: `1px solid ${card.color}40` }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: card.color, textTransform: "uppercase", letterSpacing: 0.5 }}>{card.type}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!attunementFull) toggleAttunement(card.id);
                        }}
                        disabled={attunementFull}
                        aria-label={isAttuned ? `Unattune ${card.name}` : attunementFull ? `${card.name} attunement full` : `Attune ${card.name}`}
                        style={{
                          position: "absolute", bottom: 7, left: 7,
                          minWidth: isCompactPhone ? 54 : 48,
                          height: isCompactPhone ? 26 : 22,
                          padding: "0 8px",
                          borderRadius: 999,
                          border: `1px solid ${isAttuned ? "#fbbf24" : attunementFull ? "rgba(148,163,184,0.28)" : "rgba(148,163,184,0.32)"}`,
                          background: isAttuned ? "rgba(251,191,36,0.2)" : "rgba(6,10,20,0.82)",
                          color: isAttuned ? "#fbbf24" : attunementFull ? "#64748b" : "#cbd5e1",
                          fontSize: isCompactPhone ? 9 : 8,
                          fontWeight: 800,
                          cursor: attunementFull ? "not-allowed" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          letterSpacing: 0.9,
                          textTransform: "uppercase",
                          zIndex: 2,
                          boxShadow: isAttuned ? "0 0 12px rgba(251,191,36,0.24)" : "none",
                          opacity: attunementFull ? 0.75 : 1,
                        }}
                      >
                        {isAttuned ? "Attuned" : attunementFull ? "Full" : "Attune"}
                      </button>
                      {progressLabel && (
                        <div style={{ position: "absolute", bottom: 7, right: 7, padding: "2px 6px", borderRadius: 999, border: "1px solid rgba(251,191,36,0.38)", background: forgeProgress?.ready ? "rgba(251,191,36,0.2)" : "rgba(251,191,36,0.12)", boxShadow: "0 0 10px rgba(251,191,36,0.16)" }}>
                          <span style={{ fontSize: forgeProgress?.ready ? 7 : isCompactPhone ? 9 : 8, fontWeight: 800, color: "#fbbf24", letterSpacing: 0.8, textTransform: "uppercase" }}>{progressLabel}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {specialCard && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
                    Special Card
                  </div>
                  {(() => {
                    const spInOrder = isCardInOrder(specialCard);
                    const spTooExp = !spInOrder && specialCard.energyCost > remainingEnergy;
                    const spHovered = hoveredCardId === specialCard.id;
                    const isSpecialAttuned = attunedCardIds.includes(specialCard.id);
                    const attunementFull = attunedCardIds.length >= 2 && !isSpecialAttuned;
                    const specialMasteryTier = getCardMasterySnapshot(cardPerformance[specialCard.id] ?? null).tier;
                    return (
                      <div
                        onClick={() => {
                          if (suppressCardTapRef.current) {
                            suppressCardTapRef.current = false;
                            return;
                          }
                          if (spInOrder) {
                            const slotIdx = currentOrder.findIndex((s) => s?.id === specialCard.id);
                            if (slotIdx !== -1) removeCardFromSlot(slotIdx);
                          } else if (!spTooExp) {
                            addCardToSlot(specialCard);
                          }
                        }}
                        onMouseEnter={(e) => {
                          setHoveredCardId(specialCard.id);
                          updateTooltipAnchor(specialCard, e.currentTarget);
                        }}
                        onMouseMove={(e) => {
                          if (hoveredCardId === specialCard.id) updateTooltipAnchor(specialCard, e.currentTarget);
                        }}
                        onMouseLeave={() => {
                          setHoveredCardId(null);
                          setHoveredTooltip(null);
                        }}
                        onPointerDown={(e) => {
                          if (e.pointerType !== "mouse") beginTouchHoldPreview(specialCard, e.currentTarget);
                        }}
                        onPointerUp={cancelTouchHoldPreview}
                        onPointerCancel={cancelTouchHoldPreview}
                        onPointerLeave={() => {
                          cancelTouchHoldPreview();
                        }}
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
                        <MiniPayImage src={specialCard.image} alt={specialCard.name} minipayWidth={360} minipayQuality={52} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover" }} />
                        {spInOrder && (
                          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" }}>
                            <span className="material-icons" style={{ fontSize: 38, color: "#4ade80" }}>check_circle</span>
                            <span style={{ position: "absolute", bottom: 48, fontSize: 9, fontWeight: 700, color: "#4ade80", letterSpacing: 1, textTransform: "uppercase" }}>tap to remove</span>
                          </div>
                        )}
                        <div style={{ position: "absolute", top: 9, left: 9, width: 32, height: 32, borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.75)", border: `2px solid ${specialCard.color}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 10px ${specialCard.color}40` }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{specialCard.energyCost}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!attunementFull) toggleAttunement(specialCard.id);
                          }}
                          disabled={attunementFull}
                          aria-label={isSpecialAttuned ? `Unattune ${specialCard.name}` : attunementFull ? `${specialCard.name} attunement full` : `Attune ${specialCard.name}`}
                          style={{
                            position: "absolute", bottom: 10, left: 10,
                            minWidth: 56,
                            height: 24,
                            padding: "0 8px",
                            borderRadius: 999,
                            border: `1px solid ${isSpecialAttuned ? "#fbbf24" : attunementFull ? "rgba(148,163,184,0.28)" : "rgba(148,163,184,0.32)"}`,
                            background: isSpecialAttuned ? "rgba(251,191,36,0.2)" : "rgba(6,10,20,0.82)",
                            color: isSpecialAttuned ? "#fbbf24" : attunementFull ? "#64748b" : "#cbd5e1",
                            fontSize: 8,
                            fontWeight: 800,
                            cursor: attunementFull ? "not-allowed" : "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            letterSpacing: 0.9,
                            textTransform: "uppercase",
                            zIndex: 2,
                            boxShadow: isSpecialAttuned ? "0 0 12px rgba(251,191,36,0.24)" : "none",
                            opacity: attunementFull ? 0.75 : 1,
                          }}
                        >
                          {isSpecialAttuned ? "Attuned" : attunementFull ? "Full" : "Attune"}
                        </button>
                        {specialMasteryTier > 0 && (
                          <div style={{ position: "absolute", bottom: 10, right: 10, padding: "2px 6px", borderRadius: 999, border: "1px solid rgba(251,191,36,0.38)", background: "rgba(251,191,36,0.12)", boxShadow: "0 0 10px rgba(251,191,36,0.16)" }}>
                            <span style={{ fontSize: 8, fontWeight: 800, color: "#fbbf24", letterSpacing: 0.8, textTransform: "uppercase" }}>{`T${specialMasteryTier}`}</span>
                          </div>
                        )}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 12px", background: `linear-gradient(transparent, ${specialCard.color}DD)` }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
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

          {/* Preset controls */}
          <div style={{ position: "absolute", left: 20, top: 18, zIndex: 40, maxWidth: isCompactPhone ? 470 : 340 }}>
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", alignItems: "flex-start", maxWidth: isCompactPhone ? 420 : "none" }}>
                <div style={{ display: "flex", gap: 4, marginRight: 0, flexWrap: "nowrap" }}>
                  {starterArchetypes.map((preset) => (
                    <button
                      key={preset.key}
                      onClick={() => applyStarterPreset(preset.key)}
                      style={{
                        background: selectedArchetypeKey === preset.key ? "rgba(125,211,252,0.22)" : "rgba(125,211,252,0.1)",
                        border: selectedArchetypeKey === preset.key ? "1px solid rgba(125,211,252,0.55)" : "1px solid rgba(125,211,252,0.3)",
                        borderRadius: 5,
                        padding: isCompactPhone ? "8px 12px" : "4px 8px",
                        color: "#7dd3fc",
                        fontSize: isCompactPhone ? 11 : 9,
                        fontWeight: 700,
                        cursor: "pointer",
                        letterSpacing: 0.8,
                        boxShadow: selectedArchetypeKey === preset.key ? "0 0 10px rgba(125,211,252,0.18)" : "none",
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "flex-start" }}>
                {/* Save preset */}
                {isOrderComplete && !savingPreset && (
                  <button
                    onClick={() => { setSavingPreset(true); setPresetName(""); setShowPresets(false); }}
                    style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 5, padding: isCompactPhone ? "8px 14px" : "4px 10px", color: "#4ade80", fontSize: isCompactPhone ? 12 : 10, fontWeight: 700, cursor: "pointer", letterSpacing: 1 }}
                  >SAVE</button>
                )}
                {/* Load presets */}
                {deckPresets.length > 0 && (
                  <button
                    onClick={() => { setShowPresets((v) => !v); setSavingPreset(false); }}
                    style={{ background: "rgba(86,164,203,0.1)", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 5, padding: isCompactPhone ? "8px 14px" : "4px 10px", color: "#56a4cb", fontSize: isCompactPhone ? 12 : 10, fontWeight: 700, cursor: "pointer", letterSpacing: 1 }}
                  >PRESETS ({deckPresets.length})</button>
                )}
              </div>
              {selectedArchetype && (
                <div
                  style={{
                    marginTop: 6,
                    maxWidth: isCompactPhone ? 205 : 160,
                    fontSize: isCompactPhone ? 11 : 9,
                    lineHeight: 1.22,
                    color: "#94a3b8",
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "normal",
                    minHeight: isCompactPhone ? 42 : 30,
                  }}
                >
                  <span style={{ color: "#7dd3fc", fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>
                    {selectedCharacter?.name ?? "Starter"} {selectedArchetype.label}
                  </span>
                  {" "}
                  {compactPresetWhy(selectedArchetype.why)}
                </div>
              )}

              {/* Save preset input */}
              {savingPreset && (
                <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, background: "rgba(10,15,25,0.97)", border: "1px solid rgba(86,164,203,0.35)", borderRadius: 8, padding: "12px 14px", width: 220, zIndex: 300, display: "flex", flexDirection: "column", gap: 8 }}>
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
                <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, background: "rgba(10,15,25,0.97)", border: "1px solid rgba(86,164,203,0.35)", borderRadius: 8, padding: "12px", width: 260, zIndex: 300, display: "flex", flexDirection: "column", gap: 6 }}>
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

          <div
            style={{
              position: "absolute",
              right: 20,
              top: 46,
              width: isCompactPhone ? 138 : 126,
              minHeight: isCompactPhone ? 132 : 122,
              padding: isCompactPhone ? "10px 10px 12px" : "9px 9px 11px",
              borderRadius: 12,
              background: "linear-gradient(135deg, rgba(10,16,28,0.96), rgba(15,23,42,0.92))",
              border: "1px solid rgba(251,191,36,0.24)",
              boxShadow: "0 0 18px rgba(251,191,36,0.08), inset 0 0 0 1px rgba(255,255,255,0.03)",
              zIndex: 12,
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, color: "#fbbf24", letterSpacing: 1.6, textTransform: "uppercase" }}>
                Attunement
              </div>
              <div style={{ marginTop: 4, fontSize: isCompactPhone ? 11 : 10, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.15 }}>
                {attunedCardIds.length} / 2 active
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
              {[0, 1].map((slot) => {
                const cardId = attunedCardIds[slot] ?? null;
                const attunedCard = cardId ? CARDS.find((card) => card.id === cardId) ?? null : null;
                return (
                  <div
                    key={slot}
                    style={{
                      minHeight: isCompactPhone ? 38 : 36,
                      padding: "7px 8px",
                      borderRadius: 8,
                      background: attunedCard ? "rgba(251,191,36,0.14)" : "rgba(255,255,255,0.04)",
                      border: attunedCard ? "1px solid rgba(251,191,36,0.34)" : "1px solid rgba(148,163,184,0.16)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      gap: 3,
                    }}
                  >
                    <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: 1, color: "#94a3b8", textTransform: "uppercase" }}>
                      Attuned {slot + 1}
                    </span>
                    <span
                      style={{
                        fontSize: isCompactPhone ? 9 : 8,
                        fontWeight: 800,
                        letterSpacing: 0.35,
                        color: attunedCard ? "#fbbf24" : "#64748b",
                        textTransform: "uppercase",
                        lineHeight: 1.15,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {attunedCard ? attunedCard.name : "Empty Slot"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid rgba(251,191,36,0.24)",
                background: "rgba(251,191,36,0.1)",
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: 7, fontWeight: 800, color: "#fbbf24", letterSpacing: 0.9, textTransform: "uppercase", lineHeight: 1.1, display: "block" }}>
                First reveal surge
              </span>
            </div>
          </div>

          {/* Slots */}
          <div style={{ display: "flex", gap: isCompactPhone ? 16 : 14, marginTop: 28 }}>
            {[0, 1, 2, 3, 4].map((i) => {
              const card = currentOrder[i];
              const isAttuned = !!card && attunedCardIds.includes(card.id);
              return (
                <div
                  key={i}
                  onClick={() => card && removeCardFromSlot(i)}
                  style={{
                    width: isCompactPhone ? 116 : 108, height: isCompactPhone ? 150 : 140,
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
                      <MiniPayImage src={card.image} alt={card.name} minipayWidth={220} minipayQuality={50} style={{
                        position: "absolute", width: "100%", height: "100%", objectFit: "cover",
                      }} />
                      {/* Name gradient background */}
                      <div style={{
                        position: "absolute", bottom: 0, left: 0, right: 0,
                        background: "linear-gradient(to top, rgba(0,0,0,0.9), transparent)",
                        padding: "20px 4px 6px 4px", textAlign: "center"
                      }}>
                        <span style={{ fontSize: isCompactPhone ? 11 : 10, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: 0.5, textShadow: "0 1px 4px #000" }}>
                          {card.name}
                        </span>
                      </div>
                      <div style={{
                        position: "absolute", top: 4, right: 4,
                        width: isCompactPhone ? 24 : 20, height: isCompactPhone ? 24 : 20, borderRadius: "50%",
                        backgroundColor: "rgba(239,68,68,0.85)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 0 6px rgba(239,68,68,0.5)",
                      }}>
                        <span className="material-icons" style={{ fontSize: isCompactPhone ? 15 : 13, color: "#fff" }}>close</span>
                      </div>
                      {isAttuned && (
                        <div style={{
                          position: "absolute", top: 6, left: 6,
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "1px solid rgba(251,191,36,0.45)",
                          background: "rgba(251,191,36,0.18)",
                          boxShadow: "0 0 10px rgba(251,191,36,0.2)",
                        }}>
                          <span style={{ fontSize: isCompactPhone ? 9 : 8, fontWeight: 800, color: "#fbbf24", letterSpacing: 1, textTransform: "uppercase" }}>
                            Attuned
                          </span>
                        </div>
                      )}
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
              style={{ padding: isCompactPhone ? "14px 46px" : "12px 40px" }}
            >
              <span className="ko-btn-text" style={{
                fontSize: isCompactPhone ? 19 : 18, fontWeight: 800, textTransform: "uppercase",
                letterSpacing: 3, color: "#fff",
              }}>LOCK SEQUENCE</span>
              <span className="material-icons ko-btn-icon" style={{ fontSize: isCompactPhone ? 24 : 22, color: "#fff" }}>double_arrow</span>
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

        {pinnedTooltip && !waiting && !showLoadoutGuide && (
          <>
            <button
              onClick={() => {
                setPinnedTooltip(null);
                setHoveredCardId(null);
                setHoveredTooltip(null);
                suppressCardTapRef.current = false;
              }}
              style={{ position: "fixed", inset: 0, zIndex: 599, background: "transparent", border: "none", padding: 0, cursor: "default" }}
              aria-label="Close card details"
            />
            <CardTooltip
              card={pinnedTooltip.card}
              anchor={pinnedTooltip.anchor}
              stats={cardPerformance[pinnedTooltip.card.id] ?? null}
              isAttuned={attunedCardIds.includes(pinnedTooltip.card.id)}
              mobileSheet={isTouchMode}
            />
          </>
        )}

        {!pinnedTooltip && hoveredTooltip && !waiting && !showLoadoutGuide && !isTouchMode && (
          <CardTooltip
            card={hoveredTooltip.card}
            anchor={hoveredTooltip.anchor}
            stats={cardPerformance[hoveredTooltip.card.id] ?? null}
            isAttuned={attunedCardIds.includes(hoveredTooltip.card.id)}
          />
        )}

        {showLoadoutGuide && (
          <div style={{ position: "absolute", inset: 0, zIndex: 500, background: "rgba(3,6,12,0.82)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 520, borderRadius: 10, border: "1px solid rgba(86,164,203,0.35)", background: "rgba(9,14,26,0.96)", boxShadow: "0 20px 60px rgba(0,0,0,0.65)", padding: "18px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: "#56a4cb", textTransform: "uppercase" }}>Loadout Guide</div>
              <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800, color: "#e2e8f0" }}>Step {tutorialStep + 1} / {tutorialSteps.length}</div>
              <p style={{ marginTop: 10, marginBottom: 0, color: "#cbd5e1", fontSize: 13, lineHeight: 1.5 }}>{tutorialSteps[tutorialStep]}</p>
              <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  onClick={dismissLoadoutGuide}
                  style={{ background: "transparent", border: "none", color: "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  Skip
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setTutorialStep((s) => Math.max(0, s - 1))}
                    disabled={tutorialStep === 0}
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6, padding: "7px 12px", color: tutorialStep === 0 ? "#475569" : "#cbd5e1", fontSize: 12, fontWeight: 700, cursor: tutorialStep === 0 ? "default" : "pointer" }}
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      if (tutorialStep === tutorialSteps.length - 1) {
                        dismissLoadoutGuide();
                        return;
                      }
                      setTutorialStep((s) => s + 1);
                    }}
                    style={{ background: "rgba(86,164,203,0.2)", border: "1px solid rgba(86,164,203,0.4)", borderRadius: 6, padding: "7px 14px", color: "#b9e7f4", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    {tutorialStep === tutorialSteps.length - 1 ? "Finish" : "Next"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
