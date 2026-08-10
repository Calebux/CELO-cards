"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MatchMode, useGameStore } from "../../lib/gameStore";
import { BOUNTY_MIN_POINTS_TO_WIN } from "../../lib/bountyConfig";
import { hydrateActiveMatchResume, useActiveMatchResume } from "../../lib/activeMatch";
import { MiniPayImage } from "../../components/MiniPayImage";
import { useMiniPayMode } from "../../lib/premiumPayments";
import { useBossOnchainEntry, bossEntryWillCharge } from "../../lib/bossEntry";
import { WAGERS_ENABLED } from "../../lib/wagerConfig";
import { useAccount } from "wagmi";
import { DESIGN_W, DESIGN_H } from "../../lib/designConstants";
import { useMatchActionAuth } from "../../lib/useMatchActionAuth";

const OnboardingCoach = dynamic(() => import("../../components/OnboardingCoach").then(m => ({ default: m.OnboardingCoach })), { ssr: false });
const WalletSection = dynamic(() => import("../../components/WalletSection").then(m => ({ default: m.WalletSection })), { ssr: false, loading: () => <div style={{ width: 220, height: 40 }} /> });
const WagerModal = dynamic(() => import("../../components/WagerModal").then(m => ({ default: m.WagerModal })), { ssr: false });
const SeasonPassModal = dynamic(() => import("../../components/SeasonPassModal").then(m => ({ default: m.SeasonPassModal })), { ssr: false });

async function fetchSeasonPass(address: string) {
  const res = await fetch(`/api/season-pass?address=${address.toLowerCase()}&t=${Date.now()}`, {
    cache: "no-store",
  });
  return res.json() as Promise<{ active: boolean; freeGamesLeft?: number }>;
}

type MatchType = "wager" | "ranked" | "tourney" | "vshouse";

function toStoreMode(matchType: MatchType): MatchMode {
  if (matchType === "tourney") return "tournament";
  return matchType;
}

// Multipliers mirror DIFFICULTY_POINT_MULTIPLIER in app/lib/houseDifficulty.ts.
// Keep them in step — a picker that promises points the server will not pay is
// the same silent-rule problem as an invisible daily cap.
const DIFFICULTIES: readonly { value: 0 | 1 | 2; label: string; multiplier: string; color: string }[] = [
  { value: 0, label: "Easy",     multiplier: "0.5× pts", color: "#4ade80" },
  { value: 1, label: "Moderate", multiplier: "1.5× pts", color: "#fbbf24" },
  { value: 2, label: "Hard",     multiplier: "2× pts",   color: "#f87171" },
];

const MATCH_TYPES: {
  key: MatchType;
  icon: string;
  label: string;
  sub: string;
  subSecondary?: string;
  desc: string;
  color: string;
  badge?: string;
}[] = [
  {
    key: "vshouse",
    icon: "smart_toy",
    label: "VS HOUSE",
    sub: "5-Fight Streak",
    desc: "Face all 5 fighters back-to-back. Win each bout to advance. Beat all 5 and claim 5,000 bonus points.",
    color: "#00C58E",
    badge: "STREAK",
  },
  {
    key: "ranked",
    icon: "military_tech",
    label: "RANKED",
    sub: "1V1",
    desc: "Climb the leaderboard. Qualify for the weekly tournament.",
    color: "#f59e0b",
    badge: "POPULAR",
  },
  {
    key: "wager",
    icon: "toll",
    label: "WAGER",
    sub: "Stake",
    desc: "Both players stake the same amount. Winner claims 90% of the combined pot.",
    color: "#fbbf24",
    badge: "NEW",
  },
  {
    key: "tourney",
    icon: "emoji_events",
    label: "TOURNEY",
    sub: "Bracketed",
    desc: "Tournament play. Only available to qualified top-16 players.",
    color: "#a855f7",
  },
];

export default function CreateMatch() {
  const isMp = useMiniPayMode();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [matchType, setMatchType] = useState<MatchType>("vshouse");
  const [showWager, setShowWager] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [showSeasonPassModal, setShowSeasonPassModal] = useState(false);
  const [hasSeasonPass, setHasSeasonPass] = useState(false);
  const [freeGamesLeft, setFreeGamesLeft] = useState(0);
  const [postWagerDest, setPostWagerDest] = useState<string>("/ready");
  const [isShortLandscape, setIsShortLandscape] = useState(false);
  const [isCompactPhone, setIsCompactPhone] = useState(false);
  const enterBossOnchain = useBossOnchainEntry();
  // "needs-funding" is deliberately distinct from "error": an empty wallet is
  // not a failure the player can retry their way out of, and offering Retry
  // there just produces the same failure until they give up.
  const [bossEntryState, setBossEntryState] = useState<"idle" | "paying" | "error" | "needs-funding">("idle");
  const [bossEntryError, setBossEntryError] = useState<string>("");
  const router = useRouter();
  const resetMatch = useGameStore((s) => s.resetMatch);
  const setMatchMode = useGameStore((s) => s.setMatchMode);
  const setPlayerRole = useGameStore((s) => s.setPlayerRole);
  const setWager = useGameStore((s) => s.setWager);
  const setVsBot = useGameStore((s) => s.setVsBot);
  const aiDifficulty = useGameStore((s) => s.aiDifficulty);
  const setAiDifficulty = useGameStore((s) => s.setAiDifficulty);
  const setUpperChamberActive = useGameStore((s) => s.setUpperChamberActive);
  const markOnboardingStep = useGameStore((s) => s.markOnboardingStep);
  const matchPhase = useGameStore((s) => s.matchPhase);
  const matchId = useGameStore((s) => s.matchId);
  const playerRole = useGameStore((s) => s.playerRole);
  const selectedCharacter = useGameStore((s) => s.selectedCharacter);
  const vsBot = useGameStore((s) => s.vsBot);
  const { address } = useAccount();
  const signMatchAction = useMatchActionAuth();
  const serverResumeMatch = useActiveMatchResume(address);
  const safeTop = "env(safe-area-inset-top)";
  const safeBottom = "env(safe-area-inset-bottom)";

  useEffect(() => {
    const fetchOnline = () => {
      fetch("/api/online").then((r) => r.json()).then((d: { online: number }) => setOnlineCount(d.online)).catch(() => {});
    };
    type IdleWindow = Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const idleWindow = window as IdleWindow;
    if (isMp) {
      let idleHandle: number | undefined;
      let timeoutHandle: number | undefined;
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(fetchOnline, { timeout: 1800 });
      } else {
        timeoutHandle = window.setTimeout(fetchOnline, 1200);
      }
      const id = setInterval(fetchOnline, 30_000);
      return () => {
        if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
        if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
        clearInterval(id);
      };
    }

    fetchOnline();
    const id = setInterval(fetchOnline, 15_000);
    return () => clearInterval(id);
  }, [isMp]);

  useEffect(() => {
    if (!address) {
      setHasSeasonPass(false);
      setFreeGamesLeft(0);
      return;
    }
    const handlePass = (d: { active: boolean; freeGamesLeft?: number }) => {
      setHasSeasonPass(d.active);
      setFreeGamesLeft(d.freeGamesLeft ?? 0);
    };
    if (isMp) {
      const timeout = window.setTimeout(() => {
        fetchSeasonPass(address).then(handlePass).catch(() => {});
      }, 900);
      return () => window.clearTimeout(timeout);
    }

    fetchSeasonPass(address).then(handlePass).catch(() => {});
  }, [address, isMp]);

  useLayoutEffect(() => {
    const scale = () => {
      if (!wrapRef.current) return;
      const viewport = window.visualViewport;
      const vw = viewport?.width ?? window.innerWidth;
      const vh = viewport?.height ?? window.innerHeight;
      setIsShortLandscape(vw > vh && vh < (isMp ? 820 : 760));
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
    const viewport = window.visualViewport;
    window.addEventListener("resize", scale);
    window.addEventListener("orientationchange", scale);
    viewport?.addEventListener("resize", scale);
    viewport?.addEventListener("scroll", scale);
    return () => {
      window.removeEventListener("resize", scale);
      window.removeEventListener("orientationchange", scale);
      viewport?.removeEventListener("resize", scale);
      viewport?.removeEventListener("scroll", scale);
    };
  }, [isMp]);

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "ranked" || mode === "wager" || mode === "tourney" || mode === "vshouse") {
      if (isMp && mode !== "vshouse") return; // MiniPay: only VS House available
      setMatchType(mode);
    }
  }, [isMp]);

  useEffect(() => {
    type IdleWindow = Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const idleWindow = window as IdleWindow;
    const prefetch = () => {
      void router.prefetch("/select-character");
      void router.prefetch("/ready");
      void router.prefetch("/loadout");
      void router.prefetch("/gameplay");
    };

    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(prefetch, { timeout: 1500 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }

    const timeout = window.setTimeout(prefetch, 900);
    return () => window.clearTimeout(timeout);
  }, [router]);

  // FIND PLAYER: create match immediately, verify pass, proceed to character select.
  // No queue wait — match appears in open games so opponents can join.
  const sendHostKeepalive = async (matchId: string, mode: "ranked" | "wager" | "tournament") => {
    const playerName = useGameStore.getState().playerName;
    try {
      const payload = { playerName, address: address?.toLowerCase(), mode };
      const matchAuth = mode === "wager" && address
        ? await signMatchAction({
            address,
            matchId,
            role: "host",
            action: "keepalive",
            payload,
          })
        : undefined;
      await fetch(`/api/match/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "keepalive", role: "host", playerName, address, mode, matchAuth }),
      });
    } catch {
      // Best-effort: keep UX responsive even if network is flaky.
    }
  };

  const handleFindMatch = async () => {
    if (!address) return;
    if (!hasSeasonPass && freeGamesLeft <= 0) {
      setShowSeasonPassModal(true);
      return;
    }
    resetMatch();
    setVsBot(false);
    setMatchMode("ranked");
    setPlayerRole("host");
    markOnboardingStep("create_match");

    const newMatchId = useGameStore.getState().matchId;
    if (!newMatchId) return;

    await sendHostKeepalive(newMatchId, "ranked");
    router.push("/select-character");
  };

  const handleCreateMatch = async () => {
    if (!address) return;
    if (bossEntryState === "paying") return; // don't double-fire the entry tx
    if (matchType === "vshouse") {
      if (!hasSeasonPass && freeGamesLeft <= 0) {
        setShowSeasonPassModal(true);
        return;
      }
      // On-chain boss check-in (flag-gated, pay-in only; rewards stay manual).
      // Skips silently on MiniPay / when disabled. A cancelled or failed entry
      // keeps the player here to retry or back out rather than dropping in unpaid.
      if (bossEntryWillCharge(address, isMp)) {
        setBossEntryError("");
        setBossEntryState("paying");
        const res = await enterBossOnchain(address, isMp);
        if (!res.ok) {
          setBossEntryError(res.error ?? "Couldn't enter the arena.");
          setBossEntryState(res.needsFunding ? "needs-funding" : "error");
          return;
        }
        setBossEntryState("idle");
      }
      resetMatch();
      setVsBot(true);
      setMatchMode(toStoreMode(matchType));
      setPlayerRole(null);
      setUpperChamberActive(true);
      markOnboardingStep("create_match");
      router.push("/select-character");
      return;
    }
    if (matchType === "tourney") {
      router.push("/tournament");
      return;
    }
    // Generate a fresh matchId BEFORE opening the WagerModal.
    resetMatch();
    setVsBot(false);
    setMatchMode(toStoreMode(matchType));
    setPlayerRole("host");
    markOnboardingStep("create_match");
    if (matchType === "ranked") {
      if (!hasSeasonPass && freeGamesLeft <= 0) {
        setShowSeasonPassModal(true);
        return;
      }
      const newMatchId = useGameStore.getState().matchId;
      if (newMatchId) await sendHostKeepalive(newMatchId, "ranked");
      router.push("/ready?ranked=true");
      return;
    }
    setPostWagerDest("/ready");
    setShowWager(true);
  };

  const proceedAfterPayment = () => {
    setShowWager(false);
    router.push(postWagerDest);
  };

  const selected = MATCH_TYPES.find((m) => m.key === matchType)!;
  const resumeRoute = useMemo(() => {
    if (!selectedCharacter && matchPhase !== "idle") return "/select-character";
    if (matchPhase === "combat" || matchPhase === "round-result") return "/gameplay";
    if (matchPhase === "loadout") return "/loadout";
    if (matchPhase === "lobby") return "/lobby";
    if (matchPhase === "waiting-for-opponent" && matchId) return "/lobby";
    return null;
  }, [matchId, matchPhase, selectedCharacter]);
  const effectiveResumeRoute = serverResumeMatch?.route ?? resumeRoute ?? null;

  const handleResume = () => {
    if (serverResumeMatch) hydrateActiveMatchResume(serverResumeMatch);
    if (effectiveResumeRoute) router.push(effectiveResumeRoute);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#050505", fontFamily: "var(--font-space-grotesk), sans-serif" }}>

      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left", transform: "var(--ao-tr)" }}>

        {/* Background */}
        <MiniPayImage src="/new-assets/gameplay-landing-lite.webp" alt="" minipayWidth={1280} minipayQuality={56} priority style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.35, pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(5,5,5,0.85) 0%, rgba(5,8,18,0.75) 50%, rgba(5,5,5,0.85) 100%)", pointerEvents: "none" }} />

        {/* ── Top Bar ──────────────────────────────────────────────────── */}
        <div style={{ position: "absolute", top: safeTop, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: isCompactPhone ? "0 28px" : "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <button onClick={() => router.push("/")} className="ko-btn ko-btn-secondary" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px" }}>
              <span className="material-icons ko-btn-icon" style={{ fontSize: 16, color: "rgba(255,255,255,0.9)" }}>arrow_back_ios</span>
              <span className="ko-btn-text" style={{ fontSize: 13, letterSpacing: 1.5, fontWeight: 700, color: "rgba(255,255,255,0.9)", textTransform: "uppercase" }}>Back</span>
            </button>
            <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
              <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
              <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase" }}>ACTION ORDER</span>
            </button>
          </div>

          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, padding: "5px 16px", border: "1px solid rgba(86,164,203,0.2)", borderRadius: 4, background: "rgba(86,164,203,0.06)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#9ca3af", textTransform: "uppercase" }}>CREATE MATCH</span>
          </div>

          <WalletSection />
        </div>

        <OnboardingCoach style={{ position: "absolute", top: `calc(${safeTop} + 76px)`, right: 18, zIndex: 12 }} />

        {/* Match Resume Banner */}
        {effectiveResumeRoute && (
          <button
            onClick={handleResume}
            style={{
              position: "absolute",
              top: `calc(${safeTop} + 76px)`,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 11,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: isCompactPhone ? "7px 12px" : "8px 16px",
              background: "linear-gradient(135deg, rgba(6,168,249,0.18), rgba(6,168,249,0.08))",
              border: "1px solid rgba(6,168,249,0.45)",
              borderRadius: 6,
              boxShadow: "0 0 14px rgba(6,168,249,0.28)",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: "#7dd3fc", textTransform: "uppercase" }}>Match in progress</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#fff", textTransform: "uppercase" }}>Resume</span>
          </button>
        )}

        {/* ── Main Layout ───────────────────────────────────────────────── */}
        <div style={{
          position: "absolute",
          top: `calc(${safeTop} + ${effectiveResumeRoute ? 112 : 68}px)`,
          left: 0,
          right: 0,
          bottom: `calc(${safeBottom} + ${isShortLandscape ? 8 : 0}px)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: isShortLandscape ? 2 : 12,
        }}>

          {/* Panel */}
          <div style={{ position: "relative", width: isCompactPhone ? 520 : 560 }}>

            {/* Corner accents */}
            {[
              { top: -12, left: -12, borderLeft: "1.5px solid #56a4cb", borderTop: "1.5px solid #56a4cb" },
              { top: -12, right: -12, borderRight: "1.5px solid #56a4cb", borderTop: "1.5px solid #56a4cb" },
              { bottom: -12, left: -12, borderLeft: "1.5px solid #56a4cb", borderBottom: "1.5px solid #56a4cb" },
              { bottom: -12, right: -12, borderRight: "1.5px solid #56a4cb", borderBottom: "1.5px solid #56a4cb" },
            ].map((s, i) => (
              <div key={i} style={{ position: "absolute", width: 36, height: 36, ...s }} />
            ))}

            {/* Glass panel */}
            <div style={{ background: "rgba(10,15,28,0.85)", border: "1.5px solid rgba(86,164,203,0.35)", borderRadius: 8, backdropFilter: "blur(12px)", overflow: "hidden", boxShadow: "0 0 40px rgba(86,164,203,0.1)" }}>

              {/* Scanline */}
              <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #56a4cb, transparent)" }} />

              <div style={{ padding: "42px 46px 46px" }}>

                {/* Heading */}
                <div style={{ textAlign: "center", marginBottom: 36 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 4, color: "#56a4cb", textTransform: "uppercase", marginBottom: 8 }}>MATCH SETUP</div>
                  <h2 style={{ fontSize: 34, fontWeight: 900, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: -1.2, margin: 0, lineHeight: 1 }}>
                    SELECT MATCH TYPE
                  </h2>
                </div>

                {/* Match type cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginBottom: 28 }}>
                  {MATCH_TYPES.map((mt) => {
                    const comingSoon = (isMp && mt.key !== "vshouse") || (mt.key === "wager" && !WAGERS_ENABLED);
                    const active = matchType === mt.key && !comingSoon;
                    return (
                      <div key={mt.key} style={{ flex: 1, position: "relative" }}>
                        {comingSoon ? (
                          <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: "#475569", borderRadius: 3, padding: "3px 9px", zIndex: 2 }}>
                            <span style={{ fontSize: 8, fontWeight: 800, color: "#fff", letterSpacing: 1, textTransform: "uppercase" }}>COMING SOON</span>
                          </div>
                        ) : mt.badge ? (
                          <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: mt.color, borderRadius: 3, padding: "3px 9px", zIndex: 2 }}>
                            <span style={{ fontSize: 8, fontWeight: 800, color: "#000", letterSpacing: 1, textTransform: "uppercase" }}>{mt.badge}</span>
                          </div>
                        ) : null}
                        <button
                          onClick={() => !comingSoon && setMatchType(mt.key)}
                          disabled={comingSoon}
                          style={{
                            width: "100%", minHeight: 146, padding: "24px 14px 20px",
                            background: active ? `${mt.color}1e` : "rgba(255,255,255,0.03)",
                            border: active ? `1.5px solid ${mt.color}` : "1.5px solid rgba(255,255,255,0.08)",
                            borderRadius: 8, cursor: comingSoon ? "not-allowed" : "pointer", fontFamily: "inherit",
                            textAlign: "center",
                            transition: "all 0.18s ease",
                            boxShadow: active ? `0 0 20px ${mt.color}25` : "none",
                            opacity: comingSoon ? 0.4 : 1,
                          }}
                        >
                          <span className="material-icons" style={{ fontSize: isCompactPhone ? 38 : 32, color: active ? mt.color : "#6b7280", display: "block", marginBottom: 10 }}>{mt.icon}</span>
                          <div style={{ fontSize: isCompactPhone ? 15 : 14, fontWeight: 800, color: active ? "#f1f5f9" : "#9ca3af", letterSpacing: 1.6, textTransform: "uppercase", marginBottom: 4 }}>{mt.label}</div>
                          <div style={{ fontSize: isCompactPhone ? 11 : 10, color: active ? mt.color : "#6b7280", fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" }}>{mt.sub}</div>
                          {mt.subSecondary && (
                            <div style={{ fontSize: isCompactPhone ? 10 : 9, color: active ? `${mt.color}cc` : "#6b7280", fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase", marginTop: 3 }}>
                              {mt.subSecondary}
                            </div>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Description of selected type */}
                <div style={{ marginBottom: matchType === "ranked" ? 10 : matchType === "vshouse" ? 16 : 28, padding: "12px 16px", background: `rgba(${selected.color === "#56a4cb" ? "86,164,203" : selected.color === "#f59e0b" ? "245,158,11" : "168,85,247"},0.06)`, border: `1px solid ${selected.color}30`, borderRadius: 6 }}>
                  <p style={{ fontSize: isCompactPhone ? 13 : 12, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>{selected.desc}</p>
                </div>

                {/* Difficulty — VS House only. Locked in when the match starts;
                    the multiplier applies to the points that feed the daily bounty. */}
                {matchType === "vshouse" && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: "#6b7280", textTransform: "uppercase" }}>Difficulty</span>
                      <span style={{ fontSize: 10, color: "#475569", letterSpacing: 0.5 }}>harder boss, more points</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {DIFFICULTIES.map((d) => {
                        const active = aiDifficulty === d.value;
                        return (
                          <button
                            key={d.value}
                            onClick={() => setAiDifficulty(d.value)}
                            style={{
                              flex: 1, padding: isCompactPhone ? "10px 8px" : "9px 8px",
                              border: `1.5px solid ${active ? d.color : "#334155"}`,
                              borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                              background: active ? `${d.color}1f` : "rgba(17,10,24,0.4)",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                              transition: "all 0.2s",
                            }}
                          >
                            <span style={{ fontSize: isCompactPhone ? 12 : 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: active ? d.color : "#6b7280" }}>
                              {d.label}
                            </span>
                            <span style={{ fontSize: isCompactPhone ? 11 : 10, fontWeight: 700, color: active ? "rgba(255,255,255,0.75)" : "#475569" }}>
                              {d.multiplier}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {aiDifficulty === 0 && (
                      <p style={{ margin: "8px 0 0", fontSize: 10, lineHeight: 1.6, color: "#64748b", letterSpacing: 0.3 }}>
                        Easy is practice — it builds your total points and leaderboard rank, but
                        a full Easy day tops out below the {BOUNTY_MIN_POINTS_TO_WIN.toLocaleString()} needed for the daily bounty.
                        Play <span style={{ color: "#fbbf24", fontWeight: 700 }}>Moderate</span> or higher to compete for the pool.
                      </p>
                    )}
                  </div>
                )}

                {/* Season Pass / Free Games callout */}
                {(matchType === "ranked" || matchType === "vshouse") && hasSeasonPass && (
                  <div style={{
                    marginBottom: 20, display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 14px",
                    background: "rgba(74,222,128,0.06)",
                    border: "1px solid rgba(74,222,128,0.3)", borderRadius: 6,
                  }}>
                    <span style={{ fontSize: 13 }}>⚡</span>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#4ade80", letterSpacing: 1.5, textTransform: "uppercase" }}>SEASON PASS ACTIVE</div>
                    <div style={{ fontSize: 10, color: "rgba(74,222,128,0.6)", marginLeft: 2 }}>
                      — {matchType === "vshouse" ? "house event unlocked" : "ranked unlocked"}
                    </div>
                  </div>
                )}
                {(matchType === "ranked" || matchType === "vshouse") && !hasSeasonPass && freeGamesLeft > 0 && (
                  <div style={{
                    marginBottom: 20, display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 14px",
                    background: "rgba(74,222,128,0.06)",
                    border: "1px solid rgba(74,222,128,0.3)", borderRadius: 6,
                  }}>
                    <span style={{ fontSize: 13 }}>🎮</span>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#4ade80", letterSpacing: 1.5, textTransform: "uppercase" }}>
                      {freeGamesLeft === 2 ? "2 FREE MATCHES" : "1 FREE MATCH LEFT"}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(74,222,128,0.6)", marginLeft: 2 }}>
                      — no season pass needed
                    </div>
                  </div>
                )}
                {(matchType === "ranked" || matchType === "vshouse") && !hasSeasonPass && freeGamesLeft <= 0 && (
                  <div style={{
                    marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "linear-gradient(135deg, rgba(40,28,5,0.6), rgba(60,45,0,0.4))",
                    border: "1px solid rgba(251,204,92,0.35)", borderRadius: 6,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14 }}>⚡</span>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: "#fbbf24", letterSpacing: 1.5, textTransform: "uppercase", lineHeight: 1 }}>SEASON PASS</div>
                        <div style={{ fontSize: 10, color: "rgba(251,204,92,0.6)", marginTop: 2 }}>
                          Free matches used — get a pass to keep playing
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowSeasonPassModal(true)}
                      style={{
                        background: "rgba(251,204,92,0.12)", border: "1px solid rgba(251,204,92,0.45)",
                        borderRadius: 4, padding: "5px 12px", cursor: "pointer",
                        fontSize: 10, fontWeight: 800, color: "#fbbf24",
                        letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit",
                      }}
                    >
                      Get Pass →
                    </button>
                  </div>
                )}

                {/* Create/Find Match button */}
                {(
                  !address ? (
                    <button
                      disabled
                      style={{
                        width: "100%", height: isCompactPhone ? 64 : 56,
                        background: "rgba(255,255,255,0.03)",
                        border: "1.5px solid rgba(255,255,255,0.1)",
                        borderRadius: 6,
                        cursor: "not-allowed",
                        fontFamily: "inherit",
                        fontWeight: 900, fontSize: isCompactPhone ? 17 : 16, letterSpacing: 3,
                        color: "#475569",
                        textTransform: "uppercase",
                        clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                        opacity: 0.6,
                      }}
                    >
                      <span className="material-icons" style={{ fontSize: isCompactPhone ? 22 : 20, color: "#475569" }}>lock</span>
                      CONNECT WALLET TO PLAY
                    </button>
                  ) : matchType === "ranked" ? (
                    <div style={{ display: "flex", flexDirection: isCompactPhone ? "column" : "row", gap: 12 }}>
                      <button
                        onClick={() => void handleFindMatch()}
                        style={{
                          flex: 1, height: isCompactPhone ? 64 : 56,
                          background: "linear-gradient(135deg, #1a3a52, #0f2233)",
                          border: `1.5px solid ${selected.color}`,
                          borderRadius: 6,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontWeight: 900, fontSize: isCompactPhone ? 17 : 16, letterSpacing: 1.5,
                          color: "#b9e7f4",
                          textTransform: "uppercase",
                          clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
                          boxShadow: `0 0 24px ${selected.color}30`,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                          transition: "all 0.2s ease"
                        }}
                      >
                        <span className="material-icons" style={{ fontSize: isCompactPhone ? 22 : 20, color: selected.color }}>manage_search</span>
                        FIND PLAYER
                      </button>
                      
                      <button
                        onClick={handleCreateMatch}
                        style={{
                          flex: 1, height: isCompactPhone ? 64 : 56,
                          background: "rgba(255,255,255,0.03)",
                          border: `1.5px solid rgba(86,164,203,0.4)`,
                          borderRadius: 6,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontWeight: 900, fontSize: isCompactPhone ? 17 : 16, letterSpacing: 1.5,
                          color: "#56a4cb",
                          textTransform: "uppercase",
                          clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                          transition: "all 0.2s ease"
                        }}
                      >
                        <span className="material-icons" style={{ fontSize: isCompactPhone ? 22 : 20, color: "#56a4cb" }}>group</span>
                        WITH FRIEND
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleCreateMatch}
                      style={{
                        width: "100%", height: isCompactPhone ? 64 : 56,
                        background: "linear-gradient(135deg, #1a3a52, #0f2233)",
                        border: `1.5px solid ${selected.color}`,
                        borderRadius: 6,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontWeight: 900, fontSize: isCompactPhone ? 17 : 16, letterSpacing: 3,
                        color: "#b9e7f4",
                        textTransform: "uppercase",
                        clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
                        boxShadow: `0 0 24px ${selected.color}30`,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                        transition: "all 0.2s ease"
                      }}
                    >
                      <span className="material-icons" style={{ fontSize: isCompactPhone ? 22 : 20, color: selected.color }}>radar</span>
                      CREATE MATCH
                      <span className="material-icons" style={{ fontSize: isCompactPhone ? 22 : 20, color: selected.color }}>arrow_forward_ios</span>
                    </button>
                  )
                )}

                <p style={{ fontSize: 10, color: address ? "#475569" : "#56a4cb", textAlign: "center", marginTop: 15, letterSpacing: 1, textTransform: "uppercase" }}>
                  {address
                    ? matchType === "ranked"
                      ? "Find a random player or invite a friend via Match ID"
                      : matchType === "tourney"
                        ? "Tournament mode is managed from the weekly bracket page"
                      : matchType === "vshouse"
                        ? "Choose your character, then face the house across all 5 fights"
                        : isMp
                          ? "MiniPay mode uses USDT only for wagers and premium payments"
                          : "Secure connection via Celo network"
                    : "Use the Connect button in the top right ↗"}
                </p>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <div style={{ flex: 1, textAlign: "center", padding: "10px 0", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(86,164,203,0.15)", borderRadius: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 3 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 5px #4ade80", animation: "pulse 2s ease-in-out infinite" }} />
                  <div style={{ fontSize: 8.5, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Playing Now</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#4ade80", letterSpacing: -0.5 }}>
                  {onlineCount !== null ? onlineCount.toLocaleString() : "—"}
                </div>
              </div>
              <div style={{ flex: 1, textAlign: "center", padding: "10px 0", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(86,164,203,0.15)", borderRadius: 6 }}>
                <div style={{ fontSize: 8.5, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>House Bots</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#b9e7f4", letterSpacing: -0.5 }}>Always On</div>
              </div>
              <div style={{ flex: 1, textAlign: "center", padding: "10px 0", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(86,164,203,0.15)", borderRadius: 6 }}>
                <div style={{ fontSize: 8.5, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>VS House</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#00C58E", letterSpacing: -0.5 }}>5,000 pts</div>
              </div>
            </div>
            <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
          </div>
        </div>

      </div>

      {showWager && (
        <>
        <WagerModal
          onConfirmed={proceedAfterPayment}
          onSkip={() => {
            setWager(false, null);
            setShowWager(false);
          }}
        />
        {/* Season pass upsell — floats below WagerModal */}
        {!hasSeasonPass && (
          <div style={{
            position: "fixed", bottom: `calc(${safeBottom} + 18px)`, left: "50%", transform: "translateX(-50%)",
            zIndex: 9999,
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 20px", borderRadius: 30,
            backgroundColor: "rgba(8,14,26,0.92)", border: "1px solid rgba(251,191,36,0.3)",
            boxShadow: "0 0 20px rgba(251,191,36,0.1)",
          }}>
            <span style={{ fontSize: 11, color: "rgba(185,231,244,0.6)" }}>Want instant ranked access?</span>
            <button
              onClick={() => setShowSeasonPassModal(true)}
              style={{
                background: "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(251,191,36,0.3))",
                border: "1px solid rgba(251,191,36,0.5)",
                borderRadius: 20, padding: "5px 14px", cursor: "pointer",
                fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: "#fbbf24",
                textTransform: "uppercase", fontFamily: "inherit",
              }}
            >
              ⚡ Get Season Pass
            </button>
          </div>
        )}
        </>
      )}
      {showSeasonPassModal && (
        <SeasonPassModal
          onClose={() => setShowSeasonPassModal(false)}
          onActivated={() => setShowSeasonPassModal(false)}
        />
      )}
      {bossEntryState !== "idle" && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(3,6,12,0.82)", backdropFilter: "blur(4px)",
        }}>
          <div style={{
            width: "min(360px, 88vw)", background: "rgba(10,16,28,0.98)",
            border: "1px solid rgba(86,164,203,0.35)", borderRadius: 10, padding: "26px 24px",
            textAlign: "center", fontFamily: "inherit",
          }}>
            {bossEntryState === "paying" ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.5, color: "#56a4cb", textTransform: "uppercase", marginBottom: 10 }}>
                  Entering the Arena
                </div>
                <div style={{ fontSize: 13, color: "rgba(185,231,244,0.75)", lineHeight: 1.5 }}>
                  Confirm in your wallet to record this run on-chain. The entry is
                  <strong style={{ color: "#b9e7f4" }}> 0.000007</strong> of whichever coin you hold — a marker, not a fee.
                </div>
              </>
            ) : bossEntryState === "needs-funding" ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.5, color: "#fbbf24", textTransform: "uppercase", marginBottom: 10 }}>
                  Wallet needs a top-up
                </div>
                <div style={{ fontSize: 13, color: "rgba(185,231,244,0.75)", lineHeight: 1.5, marginBottom: 18 }}>
                  {bossEntryError}
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button
                    onClick={() => window.open("https://t.me/actionorder", "_blank", "noopener,noreferrer")}
                    style={{ flex: 1, padding: "11px 0", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: "#0a101c", background: "#fbbf24", border: "none" }}
                  >
                    Ask for gas
                  </button>
                  <button
                    onClick={() => setBossEntryState("idle")}
                    style={{ flex: 1, padding: "11px 0", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: "#b9e7f4", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(86,164,203,0.3)" }}
                  >
                    Back
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.5, color: "#f87171", textTransform: "uppercase", marginBottom: 10 }}>
                  Entry not completed
                </div>
                <div style={{ fontSize: 13, color: "rgba(185,231,244,0.75)", lineHeight: 1.5, marginBottom: 18 }}>
                  {bossEntryError || "Couldn't enter the arena."}
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button
                    onClick={() => { setBossEntryState("idle"); void handleCreateMatch(); }}
                    style={{ flex: 1, padding: "11px 0", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: "#0a101c", background: "#56a4cb", border: "none" }}
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => setBossEntryState("idle")}
                    style={{ flex: 1, padding: "11px 0", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: "#b9e7f4", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(86,164,203,0.3)" }}
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
