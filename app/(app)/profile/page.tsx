"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useGameStore } from "../../lib/gameStore";
import { ClaimGDollar } from "../../components/ClaimGDollar";
import { TransferFundsModal } from "../../components/TransferFundsModal";
import { CardPreviewModal } from "../../components/CardPreviewModal";
import { MiniPayImage } from "../../components/MiniPayImage";
import { CARDS } from "../../lib/gameData";
import { getCardMasterySnapshot, getHighestMasteryTier, getMasteredCardCount, getCardForgeProgress } from "../../lib/cardMastery";
import { useAttunementSync } from "../../lib/useSignatureCardSync";
import { DESIGN_W, DESIGN_H } from "../../lib/designConstants";
import { addressToCode } from "../../lib/referral";
import { useMiniPayMode } from "../../lib/premiumPayments";
import { useMobileViewportMode } from "../../lib/mobile";
import { useTradeCardSync } from "../../lib/useTradeCardSync";

const WalletSection = dynamic(() => import("../../components/WalletSection").then(m => ({ default: m.WalletSection })), { ssr: false, loading: () => <div style={{ width: 220, height: 40 }} /> });
const SeasonPassModal = dynamic(() => import("../../components/SeasonPassModal").then(m => ({ default: m.SeasonPassModal })), { ssr: false });

const BG_IMAGE = "/new-assets/gameplay-landing-lite.webp";

async function fetchSeasonPass(address: string) {
  const res = await fetch(`/api/season-pass?address=${address.toLowerCase()}&t=${Date.now()}`, {
    cache: "no-store",
  });
  return res.json() as Promise<{ active: boolean; expiry: number | null; plan: string | null }>;
}

type Achievement = {
  id: string;
  icon: string;
  name: string;
  description: string;
  unlocked: boolean;
  color: string;
};

function getRank(points: number): { label: string; color: string } {
  if (points >= 5000) return { label: "LEGEND", color: "#FFD700" };
  if (points >= 2000) return { label: "MASTER", color: "#c084fc" };
  if (points >= 1000) return { label: "VETERAN", color: "#06a8f9" };
  if (points >= 400)  return { label: "FIGHTER", color: "#56a4cb" };
  if (points >= 100)  return { label: "ROOKIE", color: "#4ade80" };
  return { label: "UNRANKED", color: "#475569" };
}

function winRate(won: number, played: number): string {
  if (played === 0) return "—";
  return Math.round((won / played) * 100) + "%";
}

export default function ProfilePage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const isMp = useMiniPayMode();
  const [showTransfer, setShowTransfer] = useState(false);
  const { address } = useAccount();
  const safeTop = "env(safe-area-inset-top)";
  const safeBottom = "env(safe-area-inset-bottom)";
  // Mobile layout uses the app-wide viewport check (coarse pointer / ≤1024px), so
  // it triggers on ALL phones. The old ≤430px-width check missed wider devices —
  // e.g. a Pixel 8 Pro (448px) or a foldable — leaving them on the web layout.
  const isCompactPhone = useMobileViewportMode();

  const {
    playerPoints,
    matchesPlayed,
    matchesWon,
    matchesLost,
    winStreak,
    maxWinStreak,
    playerName,
    setPlayerName,
    matchHistory,
    unlockedPremiumCards,
    attunedCardIds,
    cardPerformance,
  } = useGameStore();
  const { toggleAttunedCard: syncAttunedCard } = useAttunementSync();
  useTradeCardSync(address);

  const ownedCards = CARDS.filter((c) => c.isPremium && unlockedPremiumCards.includes(c.id));

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [serverUnlocked, setServerUnlocked] = useState<Set<string>>(new Set());
  const [serverStats, setServerStats] = useState<{ points: number; wins: number; losses: number } | null>(null);
  const [streak, setStreak] = useState<{ count: number; longestStreak: number } | null>(null);
  const [streakChecking, setStreakChecking] = useState(false);
  const [streakMsg, setStreakMsg] = useState<string | null>(null);
  const [passInfo, setPassInfo] = useState<{ active: boolean; expiry: number | null; plan: string | null } | null>(null);
  const [showSeasonPassModal, setShowSeasonPassModal] = useState(false);
  const [referralData, setReferralData] = useState<{ code: string; link?: string; referredBy: string | null; referrals: string[]; totalBonusEarned: number } | null>(null);
  const [referralInput, setReferralInput] = useState("");
  const [referralSubmitting, setReferralSubmitting] = useState(false);
  const [referralMsg, setReferralMsg] = useState<string | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const referralShareUrl = referralData?.link
    ?? (address ? `${typeof window !== "undefined" ? window.location.origin : ""}/?ref=${referralData?.code ?? addressToCode(address)}` : "");
  const canShareReferral = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shareReferral = useCallback(async () => {
    if (!referralShareUrl) return;
    // The share sheet is the point on a phone — it puts the link straight into
    // WhatsApp or Telegram. Clipboard is the desktop path and the fallback.
    if (canShareReferral) {
      try {
        await navigator.share({ title: "Action Order", text: "Play Action Order with me", url: referralShareUrl });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard?.writeText(referralShareUrl);
    } catch {
      // Fall through to the confirmation anyway — the link is on screen.
    }
    setReferralCopied(true);
    setTimeout(() => setReferralCopied(false), 2000);
  }, [referralShareUrl, canShareReferral]);
  const [mintedCardIds, setMintedCardIds] = useState<Set<string>>(new Set());
  const [mintingCardId, setMintingCardId] = useState<string | null>(null);
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);
  const previewCard = previewCardId ? ownedCards.find((card) => card.id === previewCardId) ?? null : null;
  const highestMasteryTier = getHighestMasteryTier(cardPerformance);
  const masteredCardCount = getMasteredCardCount(cardPerformance);
  const isProfileCompact = isMp || isCompactPhone;
  const showStreaks = !isProfileCompact;

  /**
   * Referrals are shown on phones, and hidden only in MiniPay.
   *
   * They used to share a flag with streaks and vanish on any compact layout,
   * which had it exactly backwards: a referral link shared on WhatsApp opens in
   * mobile web, so a phone is precisely where someone needs to find their code.
   * Hiding it there meant the people the programme is aimed at could not take
   * part — which is how it was found, from a player complaining.
   *
   * MiniPay stays excluded on purpose: players arrive through its dapp store
   * rather than a shared link, and the code is the first 8 characters of the
   * wallet address, which the MiniPay review rules do not allow on screen.
   */
  const showReferrals = !isMp;

  useEffect(() => {
    if (!address) {
      setPassInfo(null);
      return;
    }
    fetchSeasonPass(address)
      .then(setPassInfo)
      .catch(() => {});
  }, [address]);

  useEffect(() => {
    if (!address) return;
    const addr = address.toLowerCase();
    type Entry = { address: string; points: number; wins: number; losses: number };
    Promise.all([
      fetch("/api/leaderboard?tab=ranked&limit=200").then(r => r.ok ? r.json() as Promise<{ players: Entry[] }> : { players: [] as Entry[] }),
      fetch("/api/leaderboard?tab=casual&limit=200").then(r => r.ok ? r.json() as Promise<{ players: Entry[] }> : { players: [] as Entry[] }),
    ]).then(([ranked, casual]) => {
      const rEntry = ranked.players.find(p => p.address.toLowerCase() === addr);
      const cEntry = casual.players.find(p => p.address.toLowerCase() === addr);
      setServerStats({
        points: (rEntry?.points ?? 0) + (cEntry?.points ?? 0),
        wins:   (rEntry?.wins   ?? 0) + (cEntry?.wins   ?? 0),
        losses: (rEntry?.losses ?? 0) + (cEntry?.losses ?? 0),
      });
    }).catch(() => {});
  }, [address]);

  const saveUsername = async (name: string) => {
    if (!address) { setPlayerName(name); setEditingName(false); return; }
    setNameSaving(true);
    setNameError("");
    try {
      const res = await fetch("/api/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, username: name }),
      });
      const data = await res.json() as { ok?: boolean; username?: string; error?: string };
      if (!res.ok) {
        setNameError(data.error ?? "Failed to save");
      } else {
        setPlayerName(data.username ?? name);
        setEditingName(false);
      }
    } catch {
      setNameError("Network error");
    } finally {
      setNameSaving(false);
    }
  };

  // Fetch streak on load
  useEffect(() => {
    if (!address || !showStreaks) return;
    fetch(`/api/streak?address=${address.toLowerCase()}`)
      .then(r => r.ok ? r.json() as Promise<{ count: number; longestStreak: number }> : null)
      .then(data => { if (data) setStreak(data); })
      .catch(() => {});
  }, [address, showStreaks]);

  const checkInStreak = useCallback(async () => {
    if (!address || streakChecking) return;
    setStreakChecking(true);
    setStreakMsg(null);
    try {
      const res = await fetch("/api/streak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json() as { streak: { count: number; longestStreak: number }; wasAlreadyCheckedIn: boolean; bonusPoints: number };
      setStreak(data.streak);
      if (data.wasAlreadyCheckedIn) {
        setStreakMsg("Already checked in today!");
      } else {
        setStreakMsg(`Day ${data.streak.count} streak! +${data.bonusPoints} pts`);
      }
    } catch {
      setStreakMsg("Check-in failed. Try again.");
    } finally {
      setStreakChecking(false);
    }
  }, [address, streakChecking]);

  // Fetch referral data on load
  useEffect(() => {
    if (!address || !showReferrals) return;
    fetch(`/api/referral?address=${address.toLowerCase()}`)
      .then(r => r.ok ? r.json() as Promise<{ code: string; link?: string; referredBy: string | null; referrals: string[]; totalBonusEarned: number }> : null)
      .then(data => { if (data) setReferralData(data); })
      .catch(() => {});
  }, [address, showReferrals]);

  const submitReferral = useCallback(async () => {
    if (!address || referralSubmitting || !referralInput.trim()) return;
    setReferralSubmitting(true);
    setReferralMsg(null);
    try {
      const res = await fetch("/api/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, code: referralInput.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; refereeBonus?: number };
      if (data.ok) {
        setReferralMsg(`Referral applied! +${data.refereeBonus ?? 50} pts bonus`);
        setReferralInput("");
        // Refresh referral data
        fetch(`/api/referral?address=${address.toLowerCase()}`)
          .then(r => r.ok ? r.json() as Promise<{ code: string; referredBy: string | null; referrals: string[]; totalBonusEarned: number }> : null)
          .then(d => { if (d) setReferralData(d); })
          .catch(() => {});
      } else {
        setReferralMsg(data.error ?? "Failed to apply code.");
      }
    } catch {
      setReferralMsg("Request failed. Try again.");
    } finally {
      setReferralSubmitting(false);
    }
  }, [address, referralSubmitting, referralInput]);

  // Fetch minted NFT cards
  useEffect(() => {
    if (!address) return;
    fetch(`/api/nft/mint?address=${address.toLowerCase()}`)
      .then(r => r.ok ? r.json() as Promise<{ minted: Array<{ cardId: string }> }> : null)
      .then(data => { if (data?.minted) setMintedCardIds(new Set(data.minted.map(m => m.cardId))); })
      .catch(() => {});
  }, [address]);

  const mintCard = useCallback(async (cardId: string) => {
    if (!address || mintingCardId) return;
    setMintingCardId(cardId);
    const stats = cardPerformance[cardId] ?? null;
    try {
      const res = await fetch("/api/nft/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, cardId, stats }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; record?: { cardId: string } };
      if (data.ok) {
        setMintedCardIds(prev => new Set([...prev, cardId]));
      }
    } catch {
      // silently fail
    } finally {
      setMintingCardId(null);
    }
  }, [address, mintingCardId, cardPerformance]);

  // Sync achievements to server and fetch persisted unlocks
  const syncAchievements = useCallback(async (addr: string) => {
    try {
      const res = await fetch("/api/achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: addr,
          stats: { matchesWon, matchesPlayed, playerPoints, maxWinStreak, matchesLost },
        }),
      });
      if (res.ok) {
        const { unlockedIds } = await res.json() as { unlockedIds: string[] };
        setServerUnlocked(new Set(unlockedIds));
      }
    } catch {
      // offline — silently ignore
    }
  }, [matchesWon, matchesPlayed, playerPoints, maxWinStreak, matchesLost]);

  useEffect(() => {
    if (address) syncAchievements(address);
  }, [address, syncAchievements]);

  useLayoutEffect(() => {
    const scale = () => {
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
  }, []);

  // Use the higher of local vs server (server may have data from other devices)
  const displayPoints  = Math.max(playerPoints,  serverStats?.points  ?? 0);
  const displayWins    = Math.max(matchesWon,    serverStats?.wins    ?? 0);
  const displayLosses  = Math.max(matchesLost,   serverStats?.losses  ?? 0);
  const displayPlayed  = Math.max(matchesPlayed, displayWins + displayLosses);

  const rank = getRank(displayPoints);

  const achievements: Achievement[] = [
    { id: "first_blood",  icon: "🩸", name: "First Blood",   description: "Win your first match",                   unlocked: displayWins >= 1 || serverUnlocked.has("first_blood"),                    color: "#f87171" },
    { id: "warrior",      icon: "⚔️",  name: "Warrior",       description: "Win 5 matches",                          unlocked: displayWins >= 5 || serverUnlocked.has("warrior"),                        color: "#fb923c" },
    { id: "veteran",      icon: "🎖️", name: "Veteran",       description: "Play 10 matches",                        unlocked: displayPlayed >= 10 || serverUnlocked.has("veteran"),                    color: "#60a5fa" },
    { id: "on_fire",      icon: "🔥", name: "On Fire",        description: "Reach a 3-win streak",                   unlocked: maxWinStreak >= 3 || serverUnlocked.has("on_fire"),                      color: "#f97316" },
    { id: "unstoppable",  icon: "⚡", name: "Unstoppable",    description: "Reach a 5-win streak",                   unlocked: maxWinStreak >= 5 || serverUnlocked.has("unstoppable"),                  color: "#fbbf24" },
    { id: "centurion",    icon: "💎", name: "Centurion",      description: "Earn 1,000 points",                      unlocked: displayPoints >= 1000 || serverUnlocked.has("centurion"),                color: "#b9e7f4" },
    { id: "legend",       icon: "👑", name: "Legend",         description: "Reach LEGEND rank (5,000 pts)",          unlocked: displayPoints >= 5000 || serverUnlocked.has("legend"),                   color: "#FFD700" },
    { id: "iron_will",    icon: "🛡️", name: "Iron Will",     description: "Win a match after 3 consecutive losses", unlocked: (displayWins >= 1 && displayLosses >= 3) || serverUnlocked.has("iron_will"), color: "#8c25f4" },
  ];

  const unlockedCount = achievements.filter((a) => a.unlocked).length;


  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef}
        data-ao-frame="" style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left", transform: "var(--ao-tr)" }}>

        {/* Background */}
        <MiniPayImage src={BG_IMAGE} alt="" minipayWidth={1280} minipayQuality={54} priority style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.78)" }} />

        {/* ── Top Bar ── */}
        <div style={{ position: "absolute", top: safeTop, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: isCompactPhone ? "0 28px" : "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
            <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase", fontFamily: "var(--font-space-grotesk), sans-serif" }}>ACTION ORDER</span>
          </button>
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#9ca3af", textTransform: "uppercase" }}>PLAYER PROFILE</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <WalletSection />
          </div>
        </div>

        {/* Main layout — 3 columns, pinned below nav, no scroll */}
        <div style={{ position: "absolute", left: "50%", top: `calc(${safeTop} + 80px)`, bottom: `calc(${safeBottom} + 12px)`, transform: "translateX(-50%)", width: isProfileCompact ? 1220 : 1300, display: "flex", gap: isProfileCompact ? 24 : 20, alignItems: "flex-start", overflowY: "auto", paddingRight: 8 }}>

          {/* ── Col 1: Identity + G$ + Stats ── */}
          <div style={{ width: isProfileCompact ? 300 : 230, flexShrink: 0, display: "flex", flexDirection: "column", gap: isProfileCompact ? 16 : 14 }}>

            {/* Identity card */}
            <div style={{ backgroundColor: "rgba(15,23,42,0.6)", border: "1.5px solid rgba(86,164,203,0.3)", borderRadius: 8, backdropFilter: "blur(8px)", padding: isProfileCompact ? "26px 22px" : "20px 18px", textAlign: "center", boxShadow: "0 0 20px rgba(86,164,203,0.1)" }}>
              <div style={{ width: isProfileCompact ? 70 : 52, height: isProfileCompact ? 70 : 52, borderRadius: "50%", background: `linear-gradient(135deg, ${rank.color}33, transparent)`, border: `2px solid ${rank.color}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <span className="material-icons" style={{ fontSize: isProfileCompact ? 32 : 24, color: rank.color }}>person</span>
              </div>
              <div style={{ fontSize: isProfileCompact ? 12 : 9, fontWeight: 700, letterSpacing: 2.5, color: rank.color, textTransform: "uppercase", marginBottom: 5 }}>{rank.label}</div>

              {editingName ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 3, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
                    <input
                      value={nameInput}
                      onChange={(e) => { setNameInput(e.target.value); setNameError(""); }}
                      maxLength={20}
                      autoFocus
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid #56a4cb", borderRadius: 6, padding: "3px 6px", color: "#f1f5f9", fontSize: 12, fontWeight: 700, width: 100, textAlign: "center", outline: "none" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveUsername(nameInput);
                        if (e.key === "Escape") { setEditingName(false); setNameError(""); }
                      }}
                    />
                    <button onClick={() => void saveUsername(nameInput)} disabled={nameSaving} style={{ background: "#56a4cb", border: "none", borderRadius: 6, padding: "3px 7px", color: "#000", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>{nameSaving ? "…" : "✓"}</button>
                    <button onClick={() => { setEditingName(false); setNameError(""); }} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, padding: "3px 7px", color: "#94a3b8", fontSize: 11, cursor: "pointer" }}>✕</button>
                  </div>
                  {nameError && <span style={{ fontSize: 9, color: "#f87171" }}>{nameError}</span>}
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 3 }}>
                  <div style={{ fontSize: isProfileCompact ? 20 : 13, fontWeight: 800, color: "#f1f5f9", letterSpacing: 0.5, maxWidth: isProfileCompact ? 220 : 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {playerName || (isMp ? "PLAYER" : address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—")}
                  </div>
                  <button onClick={() => { setNameInput(playerName); setEditingName(true); }} title="Edit name" style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", fontSize: isProfileCompact ? 18 : 12, padding: 0, lineHeight: 1 }}>✏️</button>
                </div>
              )}

              <div style={{ fontSize: isProfileCompact ? 12 : 10, color: "#475569", fontFamily: "monospace" }}>
                {address ? (isMp ? "Account connected" : `${address.slice(0, 6)}…${address.slice(-4)}`) : "NOT CONNECTED"}
              </div>
              {address && (
                <button
                  onClick={() => router.push(`/profile/${address}`)}
                  style={{ marginTop: 10, padding: isProfileCompact ? "9px 16px" : "4px 12px", borderRadius: 4, cursor: "pointer", background: "rgba(86,164,203,0.08)", border: "1px solid rgba(86,164,203,0.25)", fontSize: isProfileCompact ? 11 : 8, fontWeight: 700, color: "#56a4cb", fontFamily: "inherit", letterSpacing: 1 }}
                >
                  🔗 Public Profile
                </button>
              )}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: isProfileCompact ? 36 : 24, fontWeight: 900, color: rank.color, textShadow: `0 0 14px ${rank.color}80` }}>
                  {displayPoints.toLocaleString()}
                </div>
                <div style={{ fontSize: isProfileCompact ? 11 : 9, fontWeight: 700, letterSpacing: 2, color: "#475569", textTransform: "uppercase", marginTop: 3 }}>TOTAL POINTS</div>
              </div>
            </div>

            {/* G$ UBI Claim — hidden in MiniPay (USDT-only env) */}
            {!isMp && <ClaimGDollar />}

            {/* Withdraw — web only. A Web3Auth wallet has no seed phrase to
                import elsewhere, so without this a player's balance is stuck in
                the app. MiniPay users already have their own wallet UI. */}
            {!isMp && address && (
              <button
                onClick={() => setShowTransfer(true)}
                style={{
                  width: "100%", marginTop: 10, padding: isProfileCompact ? "14px 0" : "11px 0",
                  borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                  background: "rgba(0,197,142,0.10)", border: "1px solid rgba(0,197,142,0.35)",
                  color: "#00C58E", fontSize: isProfileCompact ? 13 : 12, fontWeight: 800,
                  letterSpacing: 1.2, textTransform: "uppercase",
                }}
              >
                ↗ Send funds out
              </button>
            )}
            {showTransfer && <TransferFundsModal onClose={() => setShowTransfer(false)} />}

            {/* Season Pass status */}
            {address && (
              <div style={{
                backgroundColor: passInfo?.active ? "rgba(40,28,5,0.6)" : "rgba(15,23,42,0.55)",
                border: `1px solid ${passInfo?.active ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 8, padding: isProfileCompact ? "20px 20px" : "14px 16px",
                boxShadow: passInfo?.active ? "0 0 16px rgba(251,191,36,0.1)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: isProfileCompact ? 12 : 9, fontWeight: 700, letterSpacing: 2, color: "#fbbf24", textTransform: "uppercase" }}>⚡ Season Pass</div>
                  {passInfo?.active && (
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: "#4ade80", background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 3, padding: "1px 6px", textTransform: "uppercase" }}>ACTIVE</div>
                  )}
                </div>
                {passInfo?.active ? (
                  <>
                    <div style={{ fontSize: isProfileCompact ? 14 : 10, color: "#b9e7f4", marginBottom: 3, textTransform: "capitalize" }}>
                      {passInfo.plan} pass
                    </div>
                    {passInfo.expiry && (
                      <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 10 }}>
                        Expires {new Date(passInfo.expiry).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: isProfileCompact ? 13 : 10, color: "#6b7280", marginBottom: 10, lineHeight: 1.5 }}>
                    Unlock ranked play and stay eligible for leaderboard rewards.
                  </div>
                )}
                <button
                  onClick={() => setShowSeasonPassModal(true)}
                  style={{
                    width: "100%", padding: isProfileCompact ? "11px 0" : "6px 0", borderRadius: 5, cursor: "pointer",
                    background: passInfo?.active ? "rgba(251,191,36,0.1)" : "rgba(251,191,36,0.08)",
                    border: "1px solid rgba(251,191,36,0.35)",
                    fontSize: isProfileCompact ? 12 : 9, fontWeight: 800, color: "#fbbf24",
                    letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "inherit",
                  }}
                >
                  {passInfo?.active ? "Extend / Renew →" : "Get Pass →"}
                </button>
              </div>
            )}

            {/* Daily Streak */}
            {address && showStreaks && (
              <div style={{
                backgroundColor: "rgba(15,23,42,0.55)",
                border: streak && streak.count >= 3 ? "1px solid rgba(249,115,22,0.35)" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8, padding: "14px 16px",
                boxShadow: streak && streak.count >= 3 ? "0 0 12px rgba(249,115,22,0.08)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#f97316", textTransform: "uppercase" }}>🔥 Daily Streak</div>
                  {streak && streak.count > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 800, color: streak.count >= 7 ? "#fbbf24" : "#f97316" }}>
                      Day {streak.count}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: "#6b7280" }}>
                    Best: <span style={{ color: "#94a3b8", fontWeight: 700 }}>{streak?.longestStreak ?? 0} days</span>
                  </div>
                  <div style={{ fontSize: 9, color: "#6b7280" }}>
                    {streak && streak.count >= 7 ? "🏆 On fire!" : streak && streak.count >= 3 ? "⚡ Keep it up!" : "Check in daily for bonus pts"}
                  </div>
                </div>
                {streakMsg && (
                  <div style={{ fontSize: 9, color: "#4ade80", marginBottom: 8, textAlign: "center", fontWeight: 600 }}>{streakMsg}</div>
                )}
                <button
                  onClick={() => void checkInStreak()}
                  disabled={streakChecking}
                  style={{
                    width: "100%", padding: "6px 0", borderRadius: 5, cursor: streakChecking ? "not-allowed" : "pointer",
                    background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.35)",
                    fontSize: 9, fontWeight: 800, color: "#f97316",
                    letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "inherit",
                    opacity: streakChecking ? 0.6 : 1,
                  }}
                >
                  {streakChecking ? "Checking..." : "Check In Today →"}
                </button>
              </div>
            )}

          </div>

          {/* ── Col 2: Achievements + Owned Cards ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {!isProfileCompact && (
              <div style={{ backgroundColor: "rgba(15,23,42,0.55)", border: "1.5px solid #b9e7f4", borderRadius: 8, backdropFilter: "blur(6px)", padding: "22px 22px 18px", boxShadow: "0 0 20px rgba(185,231,244,0.15)", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, backgroundColor: "#56a4cb" }} />

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: -0.5, margin: 0 }}>Achievements</h2>
                    <p style={{ fontSize: 10, color: "#94a3b8", margin: "3px 0 0", letterSpacing: 0.5 }}>{unlockedCount} / {achievements.length} unlocked</p>
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: "#56a4cb", textTransform: "uppercase", padding: "4px 10px", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 4 }}>
                    {Math.round((unlockedCount / achievements.length) * 100)}% complete
                  </div>
                </div>

                <div style={{ height: 3, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 18, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(unlockedCount / achievements.length) * 100}%`, background: "linear-gradient(90deg, #56a4cb, #b9e7f4)", borderRadius: 2, transition: "width 0.6s ease" }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {achievements.map((a) => (
                    <div key={a.id} style={{ backgroundColor: a.unlocked ? `${a.color}12` : "rgba(255,255,255,0.03)", border: `1px solid ${a.unlocked ? a.color + "50" : "rgba(255,255,255,0.06)"}`, borderRadius: 8, padding: "12px 10px", textAlign: "center", opacity: a.unlocked ? 1 : 0.45, transition: "all 0.2s", position: "relative" }}>
                      {a.unlocked && (
                        <div style={{ position: "absolute", top: 5, right: 5 }}>
                          <span className="material-icons" style={{ fontSize: 10, color: a.color }}>check_circle</span>
                        </div>
                      )}
                      <div style={{ fontSize: 22, marginBottom: 6, filter: a.unlocked ? "none" : "grayscale(1)" }}>{a.icon}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: a.unlocked ? "#f1f5f9" : "#475569", letterSpacing: 0.5, marginBottom: 3 }}>{a.name}</div>
                      <div style={{ fontSize: 8, color: "#475569", lineHeight: "11px" }}>{a.description}</div>
                    </div>
                  ))}
                </div>

                {displayPlayed === 0 && (
                  <div style={{ marginTop: 16, padding: "14px", background: "rgba(86,164,203,0.06)", border: "1px solid rgba(86,164,203,0.15)", borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#64748b", lineHeight: "17px" }}>Play your first match to unlock achievements and start tracking your stats.</div>
                    <button onClick={() => router.push("/create")} style={{ marginTop: 8, background: "linear-gradient(135deg, #56a4cb, #b9e7f4)", border: "none", borderRadius: 6, padding: "7px 18px", color: "#000", fontSize: 11, fontWeight: 800, cursor: "pointer", letterSpacing: 1 }}>PLAY NOW</button>
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16 }}>
                  <div style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
                  <button onClick={() => router.push("/history")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#56a4cb", letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit" }}>
                    MATCH HISTORY ({matchHistory.length})
                  </button>
                  <div style={{ width: 1, height: 12, backgroundColor: "#1e293b" }} />
                  <button onClick={() => router.push("/")} className="ko-btn ko-btn-secondary" style={{ padding: "6px 14px" }}>
                    <span className="material-icons ko-btn-icon" style={{ fontSize: 14, color: "rgba(255,255,255,0.9)" }}>arrow_back_ios</span>
                    <span className="ko-btn-text" style={{ fontSize: 11, letterSpacing: 1.5, fontWeight: 700, color: "rgba(255,255,255,0.9)", textTransform: "uppercase" }}>Back</span>
                  </button>
                  <div style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
                </div>
              </div>
            )}

            {isProfileCompact && (
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, backgroundColor: "rgba(15,23,42,0.45)", border: "1px solid rgba(86,164,203,0.18)", borderRadius: 8, padding: "12px 16px" }}>
                <button onClick={() => router.push("/history")} style={{ flex: 1, minHeight: 44, background: "rgba(86,164,203,0.08)", border: "1px solid rgba(86,164,203,0.28)", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#56a4cb", letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit", fontWeight: 800 }}>
                  Match History ({matchHistory.length})
                </button>
                <button onClick={() => router.push("/")} className="ko-btn ko-btn-secondary" style={{ minHeight: 44, padding: "0 18px" }}>
                  <span className="material-icons ko-btn-icon" style={{ fontSize: 16, color: "rgba(255,255,255,0.9)" }}>arrow_back_ios</span>
                  <span className="ko-btn-text" style={{ fontSize: 12, letterSpacing: 1.5, fontWeight: 700, color: "rgba(255,255,255,0.9)", textTransform: "uppercase" }}>Back</span>
                </button>
              </div>
            )}

            <div style={{ marginTop: isProfileCompact ? 0 : 14, backgroundColor: "rgba(15,23,42,0.55)", border: "1px solid rgba(251,191,36,0.22)", borderRadius: 8, padding: isProfileCompact ? "18px 18px" : "14px 16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: isCompactPhone ? "repeat(3, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                {[
                  { label: "Attuned", value: `${attunedCardIds.length}/2`, color: "#fbbf24" },
                  { label: "Highest Tier", value: highestMasteryTier > 0 ? `T${highestMasteryTier}` : "—", color: "#56a4cb" },
                  { label: "Mastered Cards", value: String(masteredCardCount), color: "#e2e8f0" },
                ].map((entry) => (
                  <div key={entry.label} style={{ borderRadius: 8, border: "1px solid rgba(148,163,184,0.16)", background: "rgba(2,6,23,0.46)", padding: isProfileCompact ? "14px 16px" : "10px 12px" }}>
                    <div style={{ fontSize: isProfileCompact ? 11 : 9, fontWeight: 700, letterSpacing: 1.8, color: "#64748b", textTransform: "uppercase" }}>{entry.label}</div>
                    <div style={{ marginTop: 6, fontSize: isProfileCompact ? 24 : 18, fontWeight: 900, color: entry.color }}>{entry.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Owned cards — full width under achievements */}
            <div style={{ marginTop: 14, backgroundColor: "rgba(15,23,42,0.55)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: isProfileCompact ? "20px 20px" : "16px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: isProfileCompact ? 13 : 10, fontWeight: 700, letterSpacing: 2, color: "#f87171", textTransform: "uppercase" }}>
                  Black Market Cards
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: isProfileCompact ? 12 : 10, color: "#64748b" }}>{ownedCards.length} owned</div>
                  <button onClick={() => router.push("/trade")} style={{ background: "none", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 4, padding: isProfileCompact ? "7px 12px" : "2px 8px", cursor: "pointer", fontSize: isProfileCompact ? 11 : 8, fontWeight: 700, color: "#56a4cb", fontFamily: "inherit", letterSpacing: 1 }}>TRADE →</button>
                </div>
              </div>

              {ownedCards.length === 0 ? (
                <div style={{ textAlign: "center", padding: "18px 0" }}>
                  <div style={{ fontSize: 22, marginBottom: 7 }}>🃏</div>
                  <div style={{ fontSize: 10, color: "#334155", lineHeight: "15px" }}>No premium cards yet</div>
                  <button
                    onClick={() => router.push("/black-market")}
                    style={{ marginTop: 9, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 5, padding: "6px 12px", color: "#f87171", fontSize: 10, fontWeight: 800, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit" }}
                  >
                    Visit Market
                  </button>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: isProfileCompact ? "repeat(4, minmax(0, 1fr))" : "repeat(6, minmax(0, 1fr))", gap: isProfileCompact ? 14 : 8, justifyItems: "center" }}>
                  {ownedCards.map((card) => {
                    const isAttuned = attunedCardIds.includes(card.id);
                    const masteryTier = getCardMasterySnapshot(cardPerformance[card.id] ?? null).tier;
                    const forgeReady = getCardForgeProgress(cardPerformance[card.id] ?? null).ready;
                    const isMinted = mintedCardIds.has(card.id);
                    const isMinting = mintingCardId === card.id;
                    return (
                    <div
                      key={card.id}
                      title={card.name}
                      style={{
                        width: isProfileCompact ? 114 : 82,
                        borderRadius: 6,
                        overflow: "hidden",
                        border: `1.5px solid ${card.color}`,
                        position: "relative",
                        background: "rgba(2,6,23,0.7)",
                        aspectRatio: "170 / 236",
                        cursor: "pointer",
                      }}
                    >
                      <button
                        onClick={() => setPreviewCardId(card.id)}
                        aria-label={`Preview ${card.name}`}
                        style={{ position: "absolute", inset: 0, zIndex: 1, background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                      />
                      <MiniPayImage src={card.image} alt={card.name} minipayWidth={280} minipayQuality={48} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.9))", padding: "10px 6px 5px", textAlign: "center" }}>
                        <div style={{ fontSize: isProfileCompact ? 9 : 8, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: 0.35, lineHeight: 1.2 }}>{card.name}</div>
                      </div>
                      <div style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.72)", borderRadius: "50%", width: isProfileCompact ? 22 : 17, height: isProfileCompact ? 22 : 17, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: isProfileCompact ? 10 : 8, fontWeight: 800, color: card.color }}>{card.knock}</span>
                      </div>
                      <div style={{ position: "absolute", left: 0, right: 0, top: 4, display: "flex", justifyContent: "center" }}>
                        <span
                          style={{
                            fontSize: isProfileCompact ? 8 : 7,
                            fontWeight: 800,
                            letterSpacing: 1.1,
                            color: isAttuned || masteryTier > 0 ? "#fbbf24" : "#cbd5e1",
                            textTransform: "uppercase",
                            background: isAttuned || masteryTier > 0 ? "rgba(251,191,36,0.18)" : "rgba(2,6,23,0.72)",
                            border: isAttuned || masteryTier > 0 ? "1px solid rgba(251,191,36,0.4)" : "1px solid transparent",
                            borderRadius: 999,
                            padding: "2px 5px",
                          }}
                        >
                          {isAttuned ? "Attuned" : masteryTier > 0 ? `T${masteryTier}` : "Owned"}
                        </span>
                      </div>
                      {/* NFT mint button for forge-ready cards */}
                      {forgeReady && (
                        <div style={{ position: "absolute", bottom: 22, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 2 }}>
                          {isMinted ? (
                            <span style={{ fontSize: 6, fontWeight: 800, background: "rgba(74,222,128,0.9)", color: "#000", borderRadius: 3, padding: "2px 5px", letterSpacing: 1 }}>NFT ✓</span>
                          ) : (
                            <button
                              onClick={e => { e.stopPropagation(); void mintCard(card.id); }}
                              disabled={!!mintingCardId}
                              style={{ fontSize: 6, fontWeight: 800, background: "rgba(86,164,203,0.9)", color: "#000", border: "none", borderRadius: 3, padding: "2px 5px", cursor: mintingCardId ? "not-allowed" : "pointer", letterSpacing: 1, fontFamily: "inherit" }}
                            >
                              {isMinting ? "..." : "MINT"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Col 3: Match Stats + Referrals ── */}
          <div style={{ width: isProfileCompact ? 260 : 190, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Stats */}
            <div style={{ backgroundColor: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: isProfileCompact ? "20px 20px" : "16px 16px" }}>
              <div style={{ fontSize: isProfileCompact ? 12 : 9, fontWeight: 700, letterSpacing: 2, color: "#475569", textTransform: "uppercase", marginBottom: isProfileCompact ? 14 : 10 }}>Match Stats</div>
              {[
                { label: "Played",      value: displayPlayed,  color: "#94a3b8" },
                { label: "Wins",        value: displayWins,    color: "#4ade80" },
                { label: "Losses",      value: displayLosses,  color: "#f87171" },
                { label: "Win Rate",    value: winRate(displayWins, displayPlayed), color: "#b9e7f4" },
                { label: "Streak",      value: winStreak > 0 ? `🔥 ${winStreak}` : winStreak, color: winStreak >= 3 ? "#f97316" : "#94a3b8" },
                { label: "Best Streak", value: maxWinStreak,   color: maxWinStreak >= 5 ? "#fbbf24" : "#94a3b8" },
                { label: "Pts Earned",  value: displayPoints > 0 ? `+${displayPoints.toLocaleString()}` : "—", color: "#fbbf24" },
              ].filter(({ label }) => showStreaks || (label !== "Streak" && label !== "Best Streak")).map(({ label, value, color }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isProfileCompact ? "10px 0" : "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: isProfileCompact ? 13 : 10, color: "#6b7280", fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: isProfileCompact ? 18 : 12, fontWeight: 700, color }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Referral */}
            {address && showReferrals && (
              <div style={{
                backgroundColor: "rgba(15,23,42,0.55)",
                border: "1px solid rgba(86,164,203,0.25)",
                borderRadius: 8, padding: "14px 16px",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#56a4cb", textTransform: "uppercase", marginBottom: 8 }}>🔗 Referrals</div>
                {/* Your referral link. The code alone used to be the whole
                    share — an 8-character string someone had to retype on a
                    phone, which is where the old flow lost people. */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 4 }}>Your referral link</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, background: "rgba(86,164,203,0.08)", border: "1px solid rgba(86,164,203,0.2)", borderRadius: 4, padding: "5px 8px", fontSize: 10, fontWeight: 600, color: "#b9e7f4", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {referralShareUrl}
                    </div>
                    <button
                      onClick={() => void shareReferral()}
                      style={{ padding: "5px 10px", borderRadius: 4, cursor: "pointer", background: "rgba(86,164,203,0.1)", border: "1px solid rgba(86,164,203,0.3)", fontSize: 9, fontWeight: 700, color: "#56a4cb", fontFamily: "inherit", whiteSpace: "nowrap" }}
                    >
                      {referralCopied ? "Copied!" : canShareReferral ? "Share" : "Copy"}
                    </button>
                  </div>
                  <div style={{ fontSize: 8, color: "#475569", marginTop: 3 }}>
                    Earn +100 pts for each friend who joins through your link · code {referralData?.code ?? addressToCode(address)}
                  </div>
                </div>
                {/* Stats row */}
                {referralData && (
                  <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#56a4cb" }}>{referralData.referrals.length}</div>
                      <div style={{ fontSize: 8, color: "#475569" }}>Referred</div>
                    </div>
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>+{referralData.totalBonusEarned}</div>
                      <div style={{ fontSize: 8, color: "#475569" }}>Pts Earned</div>
                    </div>
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: referralData.referredBy ? "#4ade80" : "#475569" }}>{referralData.referredBy ? "Yes" : "No"}</div>
                      <div style={{ fontSize: 8, color: "#475569" }}>Referred By</div>
                    </div>
                  </div>
                )}
                {/* Apply code (only if not already referred) */}
                {!referralData?.referredBy && (
                  <div>
                    <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 4 }}>Have a code? Enter it for +50 pts</div>
                    <div style={{ display: "flex", gap: 6, overflow: "hidden" }}>
                      <input
                        value={referralInput}
                        onChange={e => setReferralInput(e.target.value)}
                        placeholder="Enter code..."
                        maxLength={12}
                        style={{ flex: 1, minWidth: 0, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "5px 8px", fontSize: 10, color: "#e2e8f0", fontFamily: "monospace", outline: "none" }}
                      />
                      <button
                        onClick={() => void submitReferral()}
                        disabled={referralSubmitting || !referralInput.trim()}
                        style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 4, cursor: referralSubmitting || !referralInput.trim() ? "not-allowed" : "pointer", background: "rgba(86,164,203,0.1)", border: "1px solid rgba(86,164,203,0.3)", fontSize: 9, fontWeight: 700, color: "#56a4cb", fontFamily: "inherit", opacity: referralSubmitting || !referralInput.trim() ? 0.5 : 1 }}
                      >
                        {referralSubmitting ? "..." : "Apply"}
                      </button>
                    </div>
                    {referralMsg && (
                      <div style={{ fontSize: 9, color: referralMsg.includes("applied") ? "#4ade80" : "#f87171", marginTop: 5 }}>{referralMsg}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{
              backgroundColor: "rgba(15,23,42,0.55)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8,
              padding: "14px 16px",
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#94a3b8", textTransform: "uppercase", marginBottom: 10 }}>
                Legal & Support
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#b9e7f4", textDecoration: "none", fontSize: 11, fontWeight: 600 }}>
                  Terms of Service
                </a>
                <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#b9e7f4", textDecoration: "none", fontSize: 11, fontWeight: 600 }}>
                  Privacy Policy
                </a>
                <a href="https://t.me/actionorder" target="_blank" rel="noopener noreferrer" style={{ color: "#56a4cb", textDecoration: "none", fontSize: 11, fontWeight: 600 }}>
                  Support
                </a>
                <a href="/stats" target="_blank" rel="noopener noreferrer" style={{ color: "#94a3b8", textDecoration: "none", fontSize: 11, fontWeight: 600 }}>
                  Stats
                </a>
              </div>
            </div>

          </div>

        </div>

        {previewCard && (
          <CardPreviewModal
            card={previewCard}
            owned
            stats={cardPerformance[previewCard.id] ?? null}
            isAttuned={attunedCardIds.includes(previewCard.id)}
            canAttune={attunedCardIds.includes(previewCard.id) || attunedCardIds.length < 2}
            onToggleAttunement={
              address
                ? () => {
                    void syncAttunedCard(attunedCardIds, previewCard.id).catch(() => {});
                  }
                : null
            }
            onClose={() => setPreviewCardId(null)}
          />
        )}

        {/* Footer */}
        <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#4ade80" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", letterSpacing: 1.2, textTransform: "uppercase" }}>
            {isMp ? "ACTION ORDER" : "ACTION ORDER — CELO MAINNET"}
          </span>
        </div>

      </div>
      {showSeasonPassModal && (
        <SeasonPassModal
          onClose={() => setShowSeasonPassModal(false)}
          onActivated={() => {
            setShowSeasonPassModal(false);
            // Refresh pass info after purchase/renewal
            if (address) {
              fetchSeasonPass(address)
                .then(setPassInfo)
                .catch(() => {});
            }
          }}
        />
      )}
    </div>
  );
}
