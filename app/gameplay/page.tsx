"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useGameStore } from "../lib/gameStore";
import { Card, CardType, getArenaBackground } from "../lib/gameData";
import { SlotResult } from "../lib/combatEngine";
import { playSound, startBgMusic, stopBgMusic, setMuted, isMuted } from "../lib/soundManager";
import { SoundSettings } from "../components/SoundSettings";
import { formatUnits } from "viem";
import { PAYOUT_AMOUNT, DUAL_WAGER_PAYOUT, DUAL_WAGER_PAYOUT_CELO } from "../lib/cusd";
import { DUAL_WAGER_PAYOUT_GDOLLAR } from "../lib/gooddollar";
import { ClashCinematic, CLASH_STYLES, getTypeColor, getTypeIcon, getTypeBg } from "./ClashCinematic";
import { MatchLoadingScreen } from "../components/MatchLoadingScreen";
import { ShareCard } from "../components/ShareCard";

const DEFAULT_BG = "/new addition/gameplay777.webp";
const MENU_BG = "/new addition/gameplay landing page.webp";

const DESIGN_W = 1440;
const DESIGN_H = 823;

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
    playerTaunt,
    wagerMultiplier,
    setWagerMultiplier,
    opponentWagered,
    ultimateActivated,
    ultimateUsed,
    activateUltimate,
    matchesWon,
    matchesPlayed,
    maxWinStreak,
    matchesLost,
    playerName,
    startMatch,
    autoLockOrder,
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
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const [gameStuck, setGameStuck] = useState(false);
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [critBanner, setCritBanner] = useState<"player" | "opponent" | null>(null);
  const [comboBanner, setComboBanner] = useState<"player" | "opponent" | null>(null);
  const [playerStreak, setPlayerStreak] = useState(0);
  const [opponentStreak, setOpponentStreak] = useState(0);
  const [momentum, setMomentum] = useState(0); // 0-5, fills with slot wins
  const [showTaunt, setShowTaunt] = useState(true); // show taunt banner at match start
  const [opponentTauntText, setOpponentTauntText] = useState<string | null>(null);
  const [showDoubleDown, setShowDoubleDown] = useState(false);
  const [doubleDownTimer, setDoubleDownTimer] = useState(10);
  const [matchLoading, setMatchLoading] = useState(true);
  const [achievementToast, setAchievementToast] = useState<{ id: string; name: string; icon: string; label?: string } | null>(null);
  const achievementQueueRef = useRef<{ id: string; name: string; icon: string; label?: string }[]>([]);
  const [showShareCard, setShowShareCard] = useState(false);

  // Stuck-game detection: if combat hasn't progressed in 90s, show recovery overlay
  useEffect(() => {
    if (isAnimating || showResult || matchPhase === "match-end") {
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
      setGameStuck(false);
      return;
    }
    stuckTimerRef.current = setTimeout(() => setGameStuck(true), 90_000);
    return () => { if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current); };
  }, [revealedSlots, isAnimating, showResult, matchPhase]);

  // Hide taunt banner after 2.5 seconds
  useEffect(() => {
    if (!playerTaunt) { setShowTaunt(false); return; }
    setShowTaunt(true);
    const t = setTimeout(() => setShowTaunt(false), 2500);
    return () => clearTimeout(t);
  }, [playerTaunt]);

  // Double-down prompt: show after round 1 completes if wagerActive and multiplier=1
  useEffect(() => {
    if (matchPhase === "round-result" && roundNumber === 1 && wagerActive && wagerMultiplier === 1) {
      setShowDoubleDown(true);
      setDoubleDownTimer(10);
    } else {
      setShowDoubleDown(false);
    }
  }, [matchPhase, roundNumber, wagerActive, wagerMultiplier]);

  // Double-down countdown timer
  useEffect(() => {
    if (!showDoubleDown) return;
    if (doubleDownTimer <= 0) { setShowDoubleDown(false); return; }
    const t = setInterval(() => setDoubleDownTimer((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, [showDoubleDown, doubleDownTimer]);

  // Brief cinematic loading screen before match starts
  useEffect(() => {
    const t = setTimeout(() => setMatchLoading(false), 2200);
    return () => clearTimeout(t);
  }, []);

  // Show opponent taunt ~3s after match loads (after player taunt clears)
  useEffect(() => {
    if (!opponentCharacter?.taunts?.length) return;
    const taunt = opponentCharacter.taunts[Math.floor(Math.random() * opponentCharacter.taunts.length)];
    const show = setTimeout(() => setOpponentTauntText(taunt), 3200);
    const hide = setTimeout(() => setOpponentTauntText(null), 5800);
    return () => { clearTimeout(show); clearTimeout(hide); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentCharacter?.id]);

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

  const applyScale = useCallback(() => {
    if (!wrapRef.current) return;
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
    wrapRef.current.style.transform = transform;
  }, []);

  useEffect(() => {
    applyScale();
    window.addEventListener("resize", applyScale);
    return () => window.removeEventListener("resize", applyScale);
  }, [applyScale]);

  // wrapRef only mounts after matchLoading → false, so re-apply scale then
  useEffect(() => {
    if (!matchLoading) applyScale();
  }, [matchLoading, applyScale]);

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
      // Update streaks and trigger banners
      if (result.winner === "player") {
        setPlayerStreak(s => { const next = s + 1; if (next >= 3) setComboBanner("player"); return next; });
        setOpponentStreak(0);
        setMomentum(m => Math.min(5, m + 1));
      } else if (result.winner === "opponent") {
        setOpponentStreak(s => { const next = s + 1; if (next >= 3) setComboBanner("opponent"); return next; });
        setPlayerStreak(0);
        setMomentum(m => Math.max(0, m - 1));
      } else {
        setMomentum(m => Math.max(0, m - 1));
      }
      if (result.isCrit) { setCritBanner("player"); setTimeout(() => setCritBanner(null), 1200); }
      if (result.isOpponentCrit) { setCritBanner("opponent"); setTimeout(() => setCritBanner(null), 1200); }
      if (result.playerComboBonus || result.opponentComboBonus) {
        setTimeout(() => setComboBanner(null), 1500);
      }
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
    setPlayerStreak(0);
    setOpponentStreak(0);
    setMomentum(0);
    setCritBanner(null);
    setComboBanner(null);
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
        body: JSON.stringify({ winner: address, matchId, currency: wagerCurrency, multiplier: wagerMultiplier }),
      });
      const data = await res.json() as { txHash?: string; error?: string; streaming?: boolean };
      if (!res.ok || data.error) throw new Error(data.error ?? "Payout failed");
      setPayoutTxHash(data.txHash ?? null);
      setPayoutState("done");
    } catch (e) {
      console.error(e);
      setPayoutState("error");
    }
  };

  // Record match result on leaderboard + sync achievements (fire-and-forget)
  useEffect(() => {
    if (matchPhase !== "match-end" || !address) return;
    const won = playerRoundsWon > opponentRoundsWon;
    void fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerAddress: address, playerName: playerName || undefined, won, pointsEarned: pointsThisRound, wagered: wagerActive }),
    });
    const ACHIEVEMENT_META: Record<string, { name: string; icon: string }> = {
      first_blood:  { name: "First Blood",   icon: "🩸" },
      warrior:      { name: "Warrior",        icon: "⚔️" },
      veteran:      { name: "Veteran",        icon: "🎖️" },
      on_fire:      { name: "On Fire",        icon: "🔥" },
      unstoppable:  { name: "Unstoppable",    icon: "⚡" },
      centurion:    { name: "Centurion",      icon: "💎" },
      legend:       { name: "Legend",         icon: "👑" },
      iron_will:    { name: "Iron Will",      icon: "🛡️" },
    };
    void fetch("/api/achievements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        stats: { matchesWon, matchesPlayed, playerPoints, maxWinStreak, matchesLost },
      }),
    }).then((r) => r.json()).then((data: { newlyUnlocked?: string[] }) => {
      const queue = (data.newlyUnlocked ?? []).map((id) => ({
        id,
        name: ACHIEVEMENT_META[id]?.name ?? id,
        icon: ACHIEVEMENT_META[id]?.icon ?? "🏅",
      }));
      if (queue.length === 0) return;
      achievementQueueRef.current = queue;
      // Show first toast; subsequent ones are shown after each auto-dismiss
      setAchievementToast(queue[0]);
      achievementQueueRef.current = queue.slice(1);
    }).catch(() => {});
    void fetch("/api/challenges", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, won }),
    }).then(() =>
      fetch(`/api/challenges?address=${address}`)
        .then((r) => r.json())
        .then((data: { challenges?: { id: string; title: string; eligible: boolean }[] }) => {
          const readyChallenges = (data.challenges ?? []).filter((c) => c.eligible);
          if (readyChallenges.length > 0) {
            // Queue challenge toasts after any achievement toasts
            const challengeItems = readyChallenges.map((c) => ({
              id: `challenge-${c.id}`,
              name: c.title,
              icon: "🎯",
              label: "Challenge Ready to Claim",
            }));
            const existingQueue = achievementQueueRef.current ?? [];
            achievementQueueRef.current = [...existingQueue, ...challengeItems];
            if (!achievementToast) {
              setAchievementToast(achievementQueueRef.current[0]);
              achievementQueueRef.current = achievementQueueRef.current.slice(1);
            }
          }
        })
        .catch(() => {})
    ).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchPhase]);

  const handleBackToMenu = () => {
    playSound(isMatchEnd ? "gameOver" : "click");
    resetMatch();
    stopBgMusic();
    router.push("/");
  };

  const handleNextOpponent = useCallback(() => {
    playSound("click");
    // Reset all local combat state
    setRevealedSlots(0);
    setSlotResults([]);
    setShowResult(false);
    setTotalPlayerKnock(0);
    setTotalOpponentKnock(0);
    setPlayerStreak(0);
    setOpponentStreak(0);
    setMomentum(0);
    setCritBanner(null);
    setComboBanner(null);
    setShowBreakdown(false);
    setShowShareCard(false);
    setPayoutState("idle");
    setPayoutTxHash(null);
    // Pick new opponent and auto-lock cards
    startMatch();
    autoLockOrder();
    // Re-show loading screen
    setMatchLoading(true);
    setTimeout(() => setMatchLoading(false), 2200);
  }, [startMatch, autoLockOrder]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  const player = selectedCharacter;
  const opponent = opponentCharacter;

  const BG_MAIN = getArenaBackground(player?.id ?? "", opponent?.id ?? "");

  // Calculate HP bars based on knock
  const maxHP = 40;
  const playerHP = Math.max(0, maxHP - totalOpponentKnock);
  const opponentHP = Math.max(0, maxHP - totalPlayerKnock);

  // When round ends, drain the loser's HP to 0
  const roundWinner = currentRoundResult?.roundWinner;
  const displayPlayerHP = showResult && roundWinner === "opponent" ? 0 : playerHP;
  const displayOpponentHP = showResult && roundWinner === "player" ? 0 : opponentHP;

  const isMatchEnd = matchPhase === "match-end";
  const payoutTokenSymbol = wagerCurrency === "celo" ? "CELO" : wagerCurrency === "gdollar" ? "G$" : "cUSD";
  const effectivePayoutAmt =
    opponentWagered
      ? (wagerCurrency === "gdollar" ? DUAL_WAGER_PAYOUT_GDOLLAR : wagerCurrency === "celo" ? DUAL_WAGER_PAYOUT_CELO : DUAL_WAGER_PAYOUT)
      : PAYOUT_AMOUNT;
  const payoutAmountDisplay = `${formatUnits(effectivePayoutAmt, 18)} ${payoutTokenSymbol}`;
  const isGDollar = wagerCurrency === "gdollar";
  const isLastStand = playerRoundsWon === 0 && opponentRoundsWon >= 2;

  if (!selectedCharacter || !opponentCharacter) {
    return <MatchLoadingScreen playerName="—" opponentName="—" />;
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      {/* Inject clash animation keyframes */}
      <style dangerouslySetInnerHTML={{ __html: CLASH_STYLES + `
        @keyframes achieveIn {
          from { opacity: 0; transform: translateX(-50%) translateY(24px) scale(0.88); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1);    }
        }
      ` }} />
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left" }}>

        {/* VS loading screen — inside the canvas so it gets the portrait rotation */}
        {matchLoading && (
          <MatchLoadingScreen
            playerName={selectedCharacter.name}
            opponentName={opponentCharacter.name}
            playerColor={selectedCharacter.color}
            opponentColor={opponentCharacter.color}
            playerPortrait={selectedCharacter.standingArt}
            opponentPortrait={opponentCharacter.standingArt}
            label="MATCH STARTING…"
          />
        )}

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

        {/* Critical hit banner */}
        {critBanner && (
          <div style={{
            position: "absolute", top: "30%", left: "50%", transform: "translateX(-50%)",
            zIndex: 80, pointerEvents: "none",
            padding: "12px 28px",
            background: critBanner === "player" ? "rgba(249,115,22,0.95)" : "rgba(239,68,68,0.95)",
            border: `2px solid ${critBanner === "player" ? "#f97316" : "#ef4444"}`,
            borderRadius: 6,
            boxShadow: `0 0 40px ${critBanner === "player" ? "#f97316" : "#ef4444"}`,
            animation: "critPop 0.3s ease-out",
          }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: 2, textTransform: "uppercase" }}>
              {critBanner === "player" ? "⚡ CRITICAL HIT!" : "💥 OPPONENT CRITS!"}
            </span>
          </div>
        )}

        {/* Combo banner */}
        {comboBanner && (
          <div style={{
            position: "absolute", top: "38%", left: "50%", transform: "translateX(-50%)",
            zIndex: 79, pointerEvents: "none",
            padding: "10px 24px",
            background: comboBanner === "player" ? "rgba(251,191,36,0.95)" : "rgba(167,139,250,0.95)",
            borderRadius: 6,
            boxShadow: `0 0 30px ${comboBanner === "player" ? "#fbbf24" : "#a78bfa"}`,
            animation: "critPop 0.3s ease-out",
          }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: "#000", letterSpacing: 2 }}>
              {comboBanner === "player" ? "🔥 COMBO STREAK! +3" : "🔥 OPPONENT COMBO! +3"}
            </span>
          </div>
        )}

        {/* Taunt banner — shown at start of combat */}
        {showTaunt && playerTaunt && (
          <div style={{
            position: "absolute", top: "22%", left: "50%", transform: "translateX(-50%)",
            zIndex: 85, pointerEvents: "none",
            padding: "14px 32px",
            background: "rgba(15,20,35,0.92)",
            border: `2px solid ${selectedCharacter?.color ?? "#56a4cb"}`,
            borderRadius: 8,
            boxShadow: `0 0 30px ${selectedCharacter?.color ?? "#56a4cb"}60`,
            animation: "critPop 0.3s ease-out",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 36, marginBottom: 4 }}>{playerTaunt}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: selectedCharacter?.color ?? "#56a4cb", letterSpacing: 2, textTransform: "uppercase" }}>
              {selectedCharacter?.name} enters the arena
            </div>
          </div>
        )}

        {/* Opponent taunt banner */}
        {opponentTauntText && (
          <div style={{
            position: "absolute", top: "22%", left: "50%", transform: "translateX(-50%)",
            zIndex: 85, pointerEvents: "none",
            padding: "14px 32px",
            background: "rgba(15,20,35,0.92)",
            border: `2px solid ${opponentCharacter?.color ?? "#f906a8"}`,
            borderRadius: 8,
            boxShadow: `0 0 30px ${opponentCharacter?.color ?? "#f906a8"}60`,
            animation: "critPop 0.3s ease-out",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 36, marginBottom: 4 }}>⚠️</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: opponentCharacter?.color ?? "#f906a8", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>
              {opponentCharacter?.name} taunts you
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.85)", fontStyle: "italic" }}>
              &ldquo;{opponentTauntText}&rdquo;
            </div>
          </div>
        )}

        {/* Double-down overlay */}
        {showDoubleDown && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 90,
            background: "rgba(0,0,0,0.75)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 20,
          }}>
            <div style={{
              background: "rgba(10,15,30,0.97)",
              border: "2px solid #f59e0b",
              borderRadius: 12,
              padding: "40px 56px",
              textAlign: "center",
              boxShadow: "0 0 60px rgba(245,158,11,0.4)",
              maxWidth: 480,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 }}>WAGER OFFER</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#f1f5f9", marginBottom: 8, letterSpacing: -1 }}>Double Down?</div>
              <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.6, margin: "0 0 24px" }}>
                Double your wager for twice the reward. You have {doubleDownTimer}s to decide.
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  onClick={() => { setWagerMultiplier(2); setShowDoubleDown(false); }}
                  style={{
                    flex: 1, padding: "14px", borderRadius: 8, cursor: "pointer",
                    background: "linear-gradient(135deg, #92400e, #78350f)",
                    border: "2px solid #f59e0b",
                    fontWeight: 900, fontSize: 15, color: "#fbbf24", letterSpacing: 2, textTransform: "uppercase",
                    fontFamily: "inherit",
                  }}
                >⚡ DOUBLE IT</button>
                <button
                  onClick={() => setShowDoubleDown(false)}
                  style={{
                    flex: 1, padding: "14px", borderRadius: 8, cursor: "pointer",
                    background: "rgba(255,255,255,0.05)",
                    border: "2px solid rgba(255,255,255,0.12)",
                    fontWeight: 700, fontSize: 15, color: "#94a3b8", letterSpacing: 1, textTransform: "uppercase",
                    fontFamily: "inherit",
                  }}
                >PASS</button>
              </div>
            </div>
          </div>
        )}

        {/* Last Stand banner */}
        {isLastStand && !isMatchEnd && (
          <div style={{
            position: "absolute", bottom: 120, left: "50%", transform: "translateX(-50%)",
            zIndex: 60, pointerEvents: "none",
            padding: "8px 20px",
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.5)",
            borderRadius: 6,
            animation: "pulse 1.5s ease-in-out infinite",
          }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#ef4444", letterSpacing: 2, textTransform: "uppercase" }}>
              🛡️ LAST STAND — +20% KNOCK
            </span>
          </div>
        )}

        {/* Momentum bar */}
        <div style={{ position: "absolute", bottom: 88, left: "50%", transform: "translateX(-50%)", zIndex: 20, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: "#94a3b8", textTransform: "uppercase" }}>MOMENTUM</span>
          <div style={{ display: "flex", gap: 3 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                width: 18, height: 8, borderRadius: 2,
                background: i < momentum ? "#4ade80" : "rgba(255,255,255,0.1)",
                boxShadow: i < momentum ? "0 0 6px #4ade80" : "none",
                transition: "all 0.3s ease",
              }} />
            ))}
          </div>
        </div>

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

        {/* ── Ultimate Ability Button ──────────────────────── */}
        {player?.ultimate && !ultimateUsed && (
          <div style={{ position: "absolute", top: 96, right: 32, zIndex: 10 }}>
            <button
              onClick={() => { if (!ultimateActivated && !isAnimating) { activateUltimate(); playSound("click"); } }}
              disabled={ultimateActivated || isAnimating || revealedSlots > 0}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 16px",
                background: ultimateActivated
                  ? `linear-gradient(135deg, ${player.color}33, ${player.color}15)`
                  : `linear-gradient(135deg, ${player.color}22, ${player.color}0a)`,
                border: `1.5px solid ${ultimateActivated ? player.color : `${player.color}60`}`,
                borderRadius: 4,
                cursor: ultimateActivated || revealedSlots > 0 ? "not-allowed" : "pointer",
                backdropFilter: "blur(6px)",
                opacity: revealedSlots > 0 ? 0.4 : 1,
                transition: "all 0.2s ease",
                boxShadow: ultimateActivated ? `0 0 20px ${player.color}50` : "none",
                fontFamily: "inherit",
              }}
            >
              <span style={{ fontSize: 16 }}>⚡</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase",
                  color: ultimateActivated ? player.color : `${player.color}cc`,
                }}>ULTIMATE</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
                  {player.ultimate.name}
                </span>
              </div>
              {ultimateActivated && (
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: "#4ade80",
                  textTransform: "uppercase", animation: "ko-dot-pulse 1s ease-in-out infinite",
                }}>ACTIVE</span>
              )}
            </button>
            {!ultimateActivated && revealedSlots === 0 && (
              <p style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", letterSpacing: 1, marginTop: 4, textAlign: "center" }}>
                {player.ultimate.description}
              </p>
            )}
          </div>
        )}

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
                        <div style={{ position: "relative" }}>
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
                        <div style={{ position: "relative" }}>
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

                  {/* Fighter portraits */}
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, gap: 8 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <div style={{
                        width: 72, height: 96, borderRadius: 4, overflow: "hidden",
                        border: `2px solid ${won ? "#4ade80" : "#ef4444"}`,
                        boxShadow: `0 0 16px ${won ? "rgba(74,222,128,0.4)" : "rgba(239,68,68,0.3)"}`,
                        opacity: won ? 1 : 0.55,
                      }}>
                        <img src={player?.standingArt} alt={player?.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#06a8f9", textTransform: "uppercase" }}>{player?.name}</span>
                    </div>

                    <div style={{ textAlign: "center", flex: 1 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 4, color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>
                        Round {roundNumber}
                      </p>
                      <h2 style={{ fontSize: 46, fontWeight: 800, color: accentColor, textTransform: "uppercase", letterSpacing: -1, margin: 0, lineHeight: "46px", textShadow: `0 0 30px ${accentGlow}` }}>
                        {won ? "VICTORY" : roundWinner === "opponent" ? "DEFEAT" : "DRAW"}
                      </h2>
                      <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                        {won ? "You won this round" : roundWinner === "opponent" ? `${opponent?.name ?? "Opponent"} wins this round` : "This round is a draw"}
                      </p>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <div style={{
                        width: 72, height: 96, borderRadius: 4, overflow: "hidden",
                        border: `2px solid ${roundWinner === "opponent" ? "#4ade80" : "#ef4444"}`,
                        boxShadow: `0 0 16px ${roundWinner === "opponent" ? "rgba(74,222,128,0.4)" : "rgba(239,68,68,0.3)"}`,
                        opacity: roundWinner === "opponent" ? 1 : 0.55,
                      }}>
                        <img src={opponent?.standingArt} alt={opponent?.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: opponent?.color ?? "#f906a8", textTransform: "uppercase" }}>{opponent?.name}</span>
                    </div>
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

                  {/* Fighter portraits */}
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, gap: 8 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <div style={{
                        width: 80, height: 108, borderRadius: 4, overflow: "hidden",
                        border: `2px solid ${won ? "#4ade80" : "#ef4444"}`,
                        boxShadow: `0 0 20px ${won ? "rgba(74,222,128,0.5)" : "rgba(239,68,68,0.3)"}`,
                        opacity: won ? 1 : 0.45,
                      }}>
                        <img src={player?.standingArt} alt={player?.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#06a8f9", textTransform: "uppercase" }}>{player?.name}</span>
                    </div>

                    <div style={{ textAlign: "center", flex: 1 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 4, color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>
                        Match Complete
                      </p>
                      <h2 style={{ fontSize: 46, fontWeight: 800, color: accentColor, textTransform: "uppercase", letterSpacing: -1, margin: 0, lineHeight: "46px", textShadow: `0 0 30px ${accentGlow}` }}>
                        {won ? "VICTORY" : roundWinner === "opponent" ? "DEFEAT" : "DRAW"}
                      </h2>
                      <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                        {won
                          ? `You defeated ${opponent?.name ?? "your opponent"}`
                          : `${opponent?.name ?? "Opponent"} wins this match`}
                      </p>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <div style={{
                        width: 80, height: 108, borderRadius: 4, overflow: "hidden",
                        border: `2px solid ${!won ? "#4ade80" : "#ef4444"}`,
                        boxShadow: `0 0 20px ${!won ? "rgba(74,222,128,0.5)" : "rgba(239,68,68,0.3)"}`,
                        opacity: !won ? 1 : 0.45,
                      }}>
                        <img src={opponent?.standingArt} alt={opponent?.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: opponent?.color ?? "#f906a8", textTransform: "uppercase" }}>{opponent?.name}</span>
                    </div>
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
                            background: isGDollar
                              ? "linear-gradient(135deg, rgba(0,197,142,0.15), rgba(0,197,142,0.05))"
                              : "linear-gradient(135deg, rgba(74,222,128,0.15), rgba(74,222,128,0.05))",
                            border: `1.5px solid ${isGDollar ? "#00C58E" : "#4ade80"}`,
                            borderRadius: 6, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                            fontFamily: "inherit",
                          }}
                        >
                          <span className="material-icons" style={{ fontSize: 20, color: isGDollar ? "#00C58E" : "#4ade80" }}>
                            {isGDollar ? "stream" : "payments"}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: isGDollar ? "#00C58E" : "#4ade80", textTransform: "uppercase", letterSpacing: 3 }}>
                            {isGDollar ? "Stream G$ Winnings" : `Claim ${payoutAmountDisplay}`}
                          </span>
                        </button>
                      )}
                      {payoutState === "loading" && (
                        <div style={{ textAlign: "center", padding: "14px 0" }}>
                          <span style={{ fontSize: 13, color: isGDollar ? "#00C58E" : "#b9e7f4", letterSpacing: 1 }}>
                            {isGDollar ? "Starting G$ stream via Superfluid…" : "Sending payout…"}
                          </span>
                        </div>
                      )}
                      {payoutState === "done" && !isGDollar && (
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
                      {payoutState === "done" && isGDollar && (
                        <div style={{ padding: "14px 16px", background: "rgba(0,197,142,0.08)", border: "1px solid rgba(0,197,142,0.35)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00C58E", boxShadow: "0 0 8px #00C58E", animation: "pulse 1.5s ease-in-out infinite" }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#00C58E", letterSpacing: 0.5 }}>G$ streaming to your wallet</span>
                          </div>
                          <span style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
                            {payoutAmountDisplay} flowing over 24h via Superfluid.{" "}
                            {payoutTxHash && (
                              <a
                                href={`https://explorer.celo.org/mainnet/tx/${payoutTxHash}`}
                                target="_blank" rel="noopener noreferrer"
                                style={{ color: "#00C58E", textDecoration: "underline" }}
                              >
                                View stream ↗
                              </a>
                            )}
                          </span>
                        </div>
                      )}
                      {payoutState === "error" && (
                        <div style={{ textAlign: "center", padding: "14px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, color: "#f87171" }}>Payout failed — please try again.</span>
                          <button
                            onClick={() => { setPayoutState("idle"); void handleClaimPayout(); }}
                            style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.4)", borderRadius: 6, padding: "6px 16px", color: "#f87171", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 1 }}
                          >
                            RETRY PAYOUT
                          </button>
                          <span style={{ fontSize: 10, color: "#475569" }}>Match ID: {matchId}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Round breakdown toggle */}
                  <div style={{ marginBottom: 14 }}>
                    <button
                      onClick={() => setShowBreakdown((v) => !v)}
                      style={{ width: "100%", background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                    >
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#475569", textTransform: "uppercase" }}>Round Breakdown</span>
                      <span className="material-icons" style={{ fontSize: 14, color: "#475569" }}>{showBreakdown ? "expand_less" : "expand_more"}</span>
                    </button>
                    {showBreakdown && (
                      <div style={{ marginTop: 6, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, overflow: "hidden" }}>
                        {currentRoundResult.slots.map((s, i) => (
                          <div
                            key={i}
                            style={{
                              display: "grid", gridTemplateColumns: "16px 1fr 28px 1fr 44px",
                              alignItems: "center", gap: 0,
                              padding: "6px 8px",
                              borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none",
                              backgroundColor: s.winner === "player" ? "rgba(6,168,249,0.05)" : s.winner === "opponent" ? "rgba(249,6,168,0.05)" : "transparent",
                            }}
                          >
                            <span style={{ fontSize: 8, fontWeight: 700, color: "#334155" }}>{i + 1}</span>
                            {/* Player card thumbnail */}
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <div style={{
                                width: 36, height: 50, borderRadius: 3, overflow: "hidden", flexShrink: 0,
                                border: `1.5px solid ${s.winner === "player" ? "#4ade80" : "#334155"}`,
                                boxShadow: s.winner === "player" ? "0 0 6px rgba(74,222,128,0.4)" : "none",
                              }}>
                                <img src={s.playerCard.image} alt={s.playerCard.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              </div>
                              <span style={{ fontSize: 8, fontWeight: 600, color: s.winner === "player" ? "#b9e7f4" : "#475569", lineHeight: 1.2, wordBreak: "break-word" }}>{s.playerCard.name}</span>
                            </div>
                            {/* Arrow */}
                            <span style={{ fontSize: 11, textAlign: "center", color: s.winner === "player" ? "#4ade80" : s.winner === "opponent" ? "#f87171" : "#6b7280", fontWeight: 700 }}>
                              {s.winner === "player" ? "▶" : s.winner === "opponent" ? "◀" : "="}
                            </span>
                            {/* Opponent card thumbnail */}
                            <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                              <span style={{ fontSize: 8, fontWeight: 600, color: s.winner === "opponent" ? "#f87171" : "#475569", textAlign: "right", lineHeight: 1.2, wordBreak: "break-word" }}>{s.opponentCard.name}</span>
                              <div style={{
                                width: 36, height: 50, borderRadius: 3, overflow: "hidden", flexShrink: 0,
                                border: `1.5px solid ${s.winner === "opponent" ? "#f87171" : "#334155"}`,
                                boxShadow: s.winner === "opponent" ? "0 0 6px rgba(248,113,113,0.4)" : "none",
                              }}>
                                <img src={s.opponentCard.image} alt={s.opponentCard.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              </div>
                            </div>
                            {/* KNK score */}
                            <span style={{ fontSize: 8, fontWeight: 700, textAlign: "right", color: "#475569", paddingLeft: 4 }}>{s.playerKnock}–{s.opponentKnock}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

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
                    {/* Next Opponent — win only */}
                    {won && (
                      <button
                        onClick={handleNextOpponent}
                        style={{
                          flex: 2, height: 52,
                          background: "linear-gradient(135deg, rgba(74,222,128,0.15), rgba(74,222,128,0.05))",
                          border: "1.5px solid #4ade80",
                          borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                          fontWeight: 800, fontSize: 12, letterSpacing: 1.5,
                          color: "#4ade80", textTransform: "uppercase",
                        }}
                      >
                        NEXT OPPONENT ▶
                      </button>
                    )}
                    {/* Share card */}
                    <button
                      onClick={() => setShowShareCard(true)}
                      style={{ width: 52, height: 52, flexShrink: 0, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      title="Share result card"
                    >
                      <span className="material-icons" style={{ fontSize: 20, color: "#e2e8f0" }}>share</span>
                    </button>
                    {/* Return to Menu — secondary */}
                    <button onClick={handleBackToMenu} style={{ width: 52, height: 52, flexShrink: 0, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 11, letterSpacing: 1, color: "#6b7280", textTransform: "uppercase" }}>
                      MENU
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
        {/* ── Share Card Modal ── */}
        {showShareCard && selectedCharacter && opponent && (
          <ShareCard
            won={roundWinner === "player"}
            playerChar={selectedCharacter}
            opponentChar={opponent}
            playerRounds={playerRoundsWon}
            opponentRounds={opponentRoundsWon}
            onClose={() => setShowShareCard(false)}
          />
        )}

        {/* ── Clash Cinematic Overlay ── */}
        {clashAnim && (
          <ClashCinematic
            result={clashAnim.result}
            opponentColor={opponent?.color || "#f906a8"}
            fadeOut={clashAnim.fadeOut}
            arenaBackground={BG_MAIN}
          />
        )}

        {/* ── Floating Sound Settings Toggle ── */}
        <div
          onClick={() => setShowSoundSettings(true)}
          title="Sound settings"
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
            fontSize: 20,
          }}
        >
          {muted ? "🔇" : "🔊"}
        </div>

        {/* Sound settings modal */}
        {showSoundSettings && (
          <SoundSettings onClose={() => { setShowSoundSettings(false); setMutedState(isMuted()); }} />
        )}

        {/* Game stuck recovery overlay */}
        {gameStuck && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, zIndex: 200 }}>
            <div style={{ fontSize: 36 }}>⚠️</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.5px" }}>Game seems stuck</div>
            <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", maxWidth: 320 }}>
              No activity detected for 90 seconds. You can resume or return to menu.
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setGameStuck(false)}
                style={{ background: "rgba(86,164,203,0.15)", border: "1px solid rgba(86,164,203,0.4)", borderRadius: 8, padding: "12px 24px", color: "#56a4cb", fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: 1 }}
              >
                RESUME
              </button>
              <button
                onClick={handleBackToMenu}
                style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, padding: "12px 24px", color: "#f87171", fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: 1 }}
              >
                BACK TO MENU
              </button>
            </div>
          </div>
        )}

        {/* Achievement unlock toast */}
        {achievementToast && (
          <div
            key={achievementToast.id}
            style={{
              position: "absolute", bottom: 100, left: "50%", transform: "translateX(-50%)",
              background: "linear-gradient(135deg, rgba(15,23,42,0.97), rgba(86,164,203,0.18))",
              border: "1.5px solid rgba(86,164,203,0.5)",
              borderRadius: 10, padding: "14px 24px",
              display: "flex", alignItems: "center", gap: 14,
              boxShadow: "0 0 30px rgba(86,164,203,0.3)",
              zIndex: 300, minWidth: 280,
              animation: "achieveIn 0.4s cubic-bezier(0.34,1.56,0.64,1)",
            }}
            onAnimationEnd={() => {
              // Auto-dismiss after 2.8s then show next queued toast
              setTimeout(() => {
                setAchievementToast(null);
                if (achievementQueueRef.current.length > 0) {
                  setTimeout(() => {
                    setAchievementToast(achievementQueueRef.current[0]);
                    achievementQueueRef.current = achievementQueueRef.current.slice(1);
                  }, 300);
                }
              }, 2800);
            }}
          >
            <div style={{ fontSize: 30, lineHeight: 1 }}>{achievementToast.icon}</div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: "#56a4cb", textTransform: "uppercase", marginBottom: 2 }}>{achievementToast.label ?? "Achievement Unlocked"}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9", letterSpacing: 0.3 }}>{achievementToast.name}</div>
            </div>
            <div style={{ marginLeft: "auto", width: 24, height: 24, borderRadius: "50%", background: "rgba(74,222,128,0.15)", border: "1.5px solid rgba(74,222,128,0.5)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: "#4ade80" }}>✓</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
