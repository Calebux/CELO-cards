"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MatchMode, useGameStore } from "../lib/gameStore";
import { hydrateActiveMatchResume, useActiveMatchResume } from "../lib/activeMatch";
import { MiniPayImage } from "../components/MiniPayImage";
import { isMiniPay } from "../lib/minipay";
import { useAccount } from "wagmi";
import { DESIGN_W, DESIGN_H } from "../lib/designConstants";

const OnboardingCoach = dynamic(() => import("../components/OnboardingCoach").then(m => ({ default: m.OnboardingCoach })), { ssr: false });
const WalletSection = dynamic(() => import("../components/WalletSection").then(m => ({ default: m.WalletSection })), { ssr: false, loading: () => <div style={{ width: 220, height: 40 }} /> });
const WagerModal = dynamic(() => import("../components/WagerModal").then(m => ({ default: m.WagerModal })), { ssr: false });
const SeasonPassModal = dynamic(() => import("../components/SeasonPassModal").then(m => ({ default: m.SeasonPassModal })), { ssr: false });

async function fetchSeasonPass(address: string) {
  const res = await fetch(`/api/season-pass?address=${address.toLowerCase()}&t=${Date.now()}`, {
    cache: "no-store",
  });
  return res.json() as Promise<{ active: boolean }>;
}

type MatchType = "wager" | "ranked" | "tourney" | "vshouse";

function toStoreMode(matchType: MatchType): MatchMode {
  if (matchType === "tourney") return "tournament";
  return matchType;
}

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
    key: "ranked",
    icon: "military_tech",
    label: "RANKED",
    sub: "1V1",
    desc: "Climb the leaderboard. Qualify for the weekly tournament.",
    color: "#f59e0b",
    badge: "POPULAR",
  },
  {
    key: "vshouse",
    icon: "smart_toy",
    label: "VS HOUSE",
    sub: "Play AI",
    desc: "Challenge the house AI. No wait time — jump straight in and sharpen your skills.",
    color: "#00C58E",
    badge: "INSTANT",
  },
  {
    key: "wager",
    icon: "toll",
    label: "WAGER",
    sub: "Stake",
    desc: "Both players stake tokens. Winner claims 90% of the combined pot.",
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
  const isMp = isMiniPay();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [matchType, setMatchType] = useState<MatchType>("ranked");
  const [showWager, setShowWager] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [showSeasonPassModal, setShowSeasonPassModal] = useState(false);
  const [hasSeasonPass, setHasSeasonPass] = useState(false);
  const [postWagerDest, setPostWagerDest] = useState<string>("/ready");
  const [isShortLandscape, setIsShortLandscape] = useState(false);
  const [isCompactPhone, setIsCompactPhone] = useState(false);
  const router = useRouter();
  const resetMatch = useGameStore((s) => s.resetMatch);
  const setMatchMode = useGameStore((s) => s.setMatchMode);
  const setPlayerRole = useGameStore((s) => s.setPlayerRole);
  const setWager = useGameStore((s) => s.setWager);
  const setVsBot = useGameStore((s) => s.setVsBot);
  const markOnboardingStep = useGameStore((s) => s.markOnboardingStep);
  const matchPhase = useGameStore((s) => s.matchPhase);
  const matchId = useGameStore((s) => s.matchId);
  const playerRole = useGameStore((s) => s.playerRole);
  const selectedCharacter = useGameStore((s) => s.selectedCharacter);
  const vsBot = useGameStore((s) => s.vsBot);
  const aiDifficulty = useGameStore((s) => s.aiDifficulty);
  const setAiDifficulty = useGameStore((s) => s.setAiDifficulty);
  const { address } = useAccount();
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
      return;
    }
    if (isMp) {
      const timeout = window.setTimeout(() => {
        fetchSeasonPass(address)
          .then((d: { active: boolean }) => setHasSeasonPass(d.active))
          .catch(() => {});
      }, 900);
      return () => window.clearTimeout(timeout);
    }

    fetchSeasonPass(address)
      .then((d: { active: boolean }) => setHasSeasonPass(d.active))
      .catch(() => {});
  }, [address, isMp]);

  useEffect(() => {
    if (isMp) return;
    const scale = () => {
      if (!wrapRef.current) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
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
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, [isMp]);

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "ranked" || mode === "wager" || mode === "tourney" || mode === "vshouse") {
      setMatchType(mode);
    }
  }, []);

  useEffect(() => {
    type IdleWindow = Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const idleWindow = window as IdleWindow;
    const prefetch = () => {
      void router.prefetch("/select-character");
      void router.prefetch("/ready");
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
      await fetch(`/api/match/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "keepalive", role: "host", playerName, address, mode }),
      });
    } catch {
      // Best-effort: keep UX responsive even if network is flaky.
    }
  };

  const handleFindMatch = async () => {
    if (!address) return;
    if (!hasSeasonPass) {
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
    if (matchType === "vshouse") {
      resetMatch();
      setVsBot(true);
      setMatchMode(toStoreMode(matchType));
      setPlayerRole(null);
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
      if (!hasSeasonPass) {
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

  if (isMp) {
    return (
      <div style={{ width: "100vw", minHeight: "100vh", overflow: "hidden", position: "relative", backgroundColor: "#050505", fontFamily: "var(--font-space-grotesk), sans-serif", color: "#f8fafc" }}>
        <MiniPayImage src="/new addition/gameplay landing page.webp" alt="" minipayWidth={960} minipayQuality={48} priority style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.22, pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(5,5,5,0.92) 0%, rgba(5,8,18,0.82) 38%, rgba(5,5,5,0.98) 100%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1, padding: "calc(env(safe-area-inset-top) + 18px) 16px calc(env(safe-area-inset-bottom) + 26px)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
            <div>
              <button onClick={() => router.push("/")} style={{ background: "none", border: "none", padding: 0, color: "#7dd3fc", fontFamily: "inherit", fontSize: 12, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", cursor: "pointer" }}>
                ← Back
              </button>
              <div style={{ marginTop: 10, fontSize: 26, fontWeight: 900, letterSpacing: -1, lineHeight: 1.02 }}>Create match</div>
              <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: "#94a3b8" }}>MiniPay uses a lighter flow here for faster loading and faster route changes.</div>
            </div>
            <WalletSection />
          </div>

          {effectiveResumeRoute && (
            <button
              onClick={handleResume}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: 14,
                padding: "13px 14px",
                borderRadius: 14,
                border: "1px solid rgba(6,168,249,0.42)",
                background: "linear-gradient(135deg, rgba(6,168,249,0.18), rgba(6,168,249,0.08))",
                color: "#e0f2fe",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.3, textTransform: "uppercase" }}>Match in progress</span>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase" }}>Resume</span>
            </button>
          )}

          <div style={{ padding: "16px", borderRadius: 18, border: "1px solid rgba(86,164,203,0.2)", background: "rgba(8,14,26,0.82)", boxShadow: "0 18px 40px rgba(0,0,0,0.22)", backdropFilter: "blur(10px)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              {MATCH_TYPES.map((mt) => {
                const active = matchType === mt.key;
                return (
                  <button
                    key={mt.key}
                    onClick={() => setMatchType(mt.key)}
                    style={{
                      padding: "14px 12px",
                      minHeight: 112,
                      borderRadius: 16,
                      border: active ? `1.5px solid ${mt.color}` : "1px solid rgba(255,255,255,0.08)",
                      background: active ? `${mt.color}18` : "rgba(255,255,255,0.03)",
                      color: "#f8fafc",
                      fontFamily: "inherit",
                      textAlign: "left",
                      cursor: "pointer",
                      boxShadow: active ? `0 0 18px ${mt.color}22` : "none",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: active ? mt.color : "#94a3b8", textTransform: "uppercase" }}>{mt.label}</div>
                    <div style={{ marginTop: 6, fontSize: 15, fontWeight: 900, letterSpacing: -0.4 }}>{mt.sub}</div>
                    <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.45, color: active ? "#cbd5e1" : "#64748b" }}>{mt.desc}</div>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 14, padding: "13px 14px", borderRadius: 14, border: `1px solid ${selected.color}35`, background: "rgba(255,255,255,0.03)" }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.6, color: selected.color, textTransform: "uppercase" }}>{selected.label}</div>
              <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.55, color: "#cbd5e1" }}>{selected.desc}</div>
            </div>

            {matchType === "ranked" && (
              !hasSeasonPass ? (
                <button
                  onClick={() => setShowSeasonPassModal(true)}
                  style={{ width: "100%", marginTop: 14, padding: "13px 14px", borderRadius: 14, border: "1px solid rgba(251,204,92,0.38)", background: "rgba(60,45,0,0.24)", color: "#fbbf24", fontSize: 12, fontWeight: 800, letterSpacing: 1.3, textTransform: "uppercase", fontFamily: "inherit", cursor: "pointer", textAlign: "left" }}
                >
                  Season pass required for ranked. Tap to unlock.
                </button>
              ) : (
                <div style={{ marginTop: 14, padding: "13px 14px", borderRadius: 14, border: "1px solid rgba(74,222,128,0.35)", background: "rgba(20,43,30,0.26)", color: "#4ade80", fontSize: 12, fontWeight: 800, letterSpacing: 1.3, textTransform: "uppercase" }}>
                  Season pass active
                </div>
              )
            )}

            {matchType === "vshouse" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 14 }}>
                {([
                  { level: 0 as const, label: "Easy", color: "#4ade80" },
                  { level: 1 as const, label: "Normal", color: "#f59e0b" },
                  { level: 2 as const, label: "Hard", color: "#f87171" },
                ] as const).map(({ level, label, color }) => {
                  const active = aiDifficulty === level;
                  return (
                    <button
                      key={level}
                      onClick={() => setAiDifficulty(level)}
                      style={{ padding: "12px 8px", borderRadius: 12, border: `1px solid ${active ? color : "rgba(255,255,255,0.1)"}`, background: active ? `${color}18` : "rgba(255,255,255,0.03)", color: active ? color : "#94a3b8", fontFamily: "inherit", fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", cursor: "pointer" }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
              {!address ? (
                <button disabled style={{ width: "100%", padding: "16px 14px", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#64748b", fontSize: 13, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", fontFamily: "inherit" }}>
                  Connect wallet to play
                </button>
              ) : matchType === "ranked" ? (
                <>
                  <button onClick={() => void handleFindMatch()} style={{ width: "100%", padding: "16px 14px", borderRadius: 16, border: `1px solid ${selected.color}`, background: "linear-gradient(135deg, #1a3a52, #0f2233)", color: "#b9e7f4", fontSize: 13, fontWeight: 900, letterSpacing: 1.4, textTransform: "uppercase", fontFamily: "inherit", cursor: "pointer" }}>
                    Find player
                  </button>
                  <button onClick={handleCreateMatch} style={{ width: "100%", padding: "16px 14px", borderRadius: 16, border: "1px solid rgba(86,164,203,0.32)", background: "rgba(255,255,255,0.03)", color: "#56a4cb", fontSize: 13, fontWeight: 900, letterSpacing: 1.4, textTransform: "uppercase", fontFamily: "inherit", cursor: "pointer" }}>
                    Invite friend
                  </button>
                </>
              ) : (
                <button onClick={handleCreateMatch} style={{ width: "100%", padding: "16px 14px", borderRadius: 16, border: `1px solid ${selected.color}`, background: "linear-gradient(135deg, #1a3a52, #0f2233)", color: "#b9e7f4", fontSize: 13, fontWeight: 900, letterSpacing: 1.4, textTransform: "uppercase", fontFamily: "inherit", cursor: "pointer" }}>
                  Continue
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
            <div style={{ padding: "12px 10px", borderRadius: 14, border: "1px solid rgba(74,222,128,0.2)", background: "rgba(10,18,30,0.74)" }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: "#4ade80", textTransform: "uppercase" }}>Online</div>
              <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900 }}>{onlineCount !== null ? onlineCount.toLocaleString() : "—"}</div>
            </div>
            <div style={{ padding: "12px 10px", borderRadius: 14, border: "1px solid rgba(86,164,203,0.18)", background: "rgba(10,18,30,0.74)" }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: "#7dd3fc", textTransform: "uppercase" }}>Bots</div>
              <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900 }}>Ready</div>
            </div>
            <div style={{ padding: "12px 10px", borderRadius: 14, border: "1px solid rgba(38,161,123,0.22)", background: "rgba(10,18,30,0.74)" }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: "#26a17b", textTransform: "uppercase" }}>Premium</div>
              <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900 }}>USDT</div>
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
            {!hasSeasonPass && (
              <div style={{
                position: "fixed", bottom: `calc(${safeBottom} + 18px)`, left: "50%", transform: "translateX(-50%)",
                zIndex: 9999,
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px", borderRadius: 30,
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
                  Get Season Pass
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
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#050505", fontFamily: "var(--font-space-grotesk), sans-serif" }}>

      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left", transform: "var(--ao-tr)" }}>

        {/* Background */}
        <MiniPayImage src="/new addition/gameplay landing page.webp" alt="" minipayWidth={1280} minipayQuality={56} priority style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.35, pointerEvents: "none" }} />
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

              <div style={{ padding: "36px 40px 40px" }}>

                {/* Heading */}
                <div style={{ textAlign: "center", marginBottom: 32 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 4, color: "#56a4cb", textTransform: "uppercase", marginBottom: 8 }}>MATCH SETUP</div>
                  <h2 style={{ fontSize: 30, fontWeight: 900, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: -1, margin: 0, lineHeight: 1 }}>
                    SELECT MATCH TYPE
                  </h2>
                </div>

                {/* Match type cards */}
                <div style={{ display: "grid", gridTemplateColumns: isCompactPhone ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: isCompactPhone ? 14 : 12, marginBottom: 24 }}>
                  {MATCH_TYPES.map((mt) => {
                    const active = matchType === mt.key;
                    return (
                      <div key={mt.key} style={{ flex: 1, position: "relative" }}>
                        {mt.badge && (
                          <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: mt.color, borderRadius: 3, padding: "2px 8px", zIndex: 2 }}>
                            <span style={{ fontSize: 7.5, fontWeight: 800, color: "#000", letterSpacing: 1, textTransform: "uppercase" }}>{mt.badge}</span>
                          </div>
                        )}
                        <button
                          onClick={() => setMatchType(mt.key)}
                          style={{
                            width: "100%", minHeight: isCompactPhone ? 132 : 0, padding: isCompactPhone ? "24px 12px 20px" : "20px 12px 16px",
                            background: active ? `${mt.color}1e` : "rgba(255,255,255,0.03)",
                            border: active ? `1.5px solid ${mt.color}` : "1.5px solid rgba(255,255,255,0.08)",
                            borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                            textAlign: "center",
                            transition: "all 0.18s ease",
                            boxShadow: active ? `0 0 20px ${mt.color}25` : "none",
                          }}
                        >
                          <span className="material-icons" style={{ fontSize: isCompactPhone ? 34 : 28, color: active ? mt.color : "#6b7280", display: "block", marginBottom: 8 }}>{mt.icon}</span>
                          <div style={{ fontSize: isCompactPhone ? 14 : 13, fontWeight: 800, color: active ? "#f1f5f9" : "#9ca3af", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>{mt.label}</div>
                          <div style={{ fontSize: isCompactPhone ? 10 : 9, color: active ? mt.color : "#6b7280", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>{mt.sub}</div>
                          {mt.subSecondary && (
                            <div style={{ fontSize: isCompactPhone ? 9 : 8, color: active ? `${mt.color}cc` : "#6b7280", fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase", marginTop: 2 }}>
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

                {/* Season Pass callout — ranked only, hidden if user already has a pass */}
                {matchType === "ranked" && !hasSeasonPass && (
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
                        <div style={{ fontSize: 10, color: "rgba(251,204,92,0.6)", marginTop: 2 }}>Unlock unlimited ranked matches during your active pass</div>
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
                {matchType === "ranked" && hasSeasonPass && (
                  <div style={{
                    marginBottom: 20, display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 14px",
                    background: "rgba(74,222,128,0.06)",
                    border: "1px solid rgba(74,222,128,0.3)", borderRadius: 6,
                  }}>
                    <span style={{ fontSize: 13 }}>⚡</span>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#4ade80", letterSpacing: 1.5, textTransform: "uppercase" }}>SEASON PASS ACTIVE</div>
                    <div style={{ fontSize: 10, color: "rgba(74,222,128,0.6)", marginLeft: 2 }}>— ranked unlocked</div>
                  </div>
                )}

                {/* Difficulty selector — VS House only */}
                {matchType === "vshouse" && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: "#6b7280", textTransform: "uppercase", marginBottom: 10 }}>AI Difficulty</div>
                    <div style={{ display: "flex", gap: 10 }}>
                      {([
                        { level: 0 as const, label: "EASY",   sub: "Random orders",     color: "#4ade80" },
                        { level: 1 as const, label: "NORMAL", sub: "Adaptive AI",        color: "#f59e0b" },
                        { level: 2 as const, label: "HARD",   sub: "Counter-picks you",  color: "#f87171" },
                      ] as const).map(({ level, label, sub, color }) => {
                        const active = aiDifficulty === level;
                        return (
                          <button
                            key={level}
                            onClick={() => setAiDifficulty(level)}
                            style={{
                              flex: 1, padding: "10px 8px",
                              background: active ? `${color}18` : "rgba(255,255,255,0.03)",
                              border: `1.5px solid ${active ? color : "rgba(255,255,255,0.08)"}`,
                              borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                              transition: "all 0.15s",
                              boxShadow: active ? `0 0 12px ${color}25` : "none",
                            }}
                          >
                            <div style={{ fontSize: 11, fontWeight: 800, color: active ? color : "#6b7280", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                            <div style={{ fontSize: 9, color: active ? `${color}cc` : "#475569", letterSpacing: 0.3 }}>{sub}</div>
                          </button>
                        );
                      })}
                    </div>
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
                <div style={{ fontSize: 16, fontWeight: 800, color: "#00C58E", letterSpacing: -0.5 }}>Instant</div>
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
    </div>
  );
}
