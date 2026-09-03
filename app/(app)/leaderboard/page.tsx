"use client";

import dynamic from "next/dynamic";
import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { MiniPayImage } from "../../components/MiniPayImage";
import { useMiniPayMode } from "../../lib/premiumPayments";
import { DESIGN_W, DESIGN_H } from "../../lib/designConstants";
import { useGameFrameScale } from "../../lib/mobile";
import { ClaimBountyButton } from "../../components/ClaimBountyButton";
import {
  BOUNTY_MIN_POINTS_TO_WIN,
  BOUNTY_PARTICIPATION_POOL_USD,
  BOUNTY_PAUSE_BLURB,
  BOUNTY_PAUSE_HEADLINE,
  BOUNTY_POOL_USD,
  BOUNTY_PRIZE_SPLIT_USD,
  BOUNTY_TOP_N,
  bountyCampaignFor,
  bountyIsFinalPayingDay,
  bountyDayUTC,
  bountyPausedOn,
  bountyWinsPerDay,
  formatBountyCampaignRange,
  formatGdollar,
  HOUSE_BOSS_WINS_COUNTED_PER_DAY,
  HOUSE_LOSS_POINTS_PER_DAY,
} from "../../lib/bountyConfig";
// The engine's own numbers, so the table cannot drift from what is actually paid.
import {
  DIFFICULTY_POINT_MULTIPLIER,
  HOUSE_FLAWLESS_BONUS,
  HOUSE_LOSS_POINTS,
  HOUSE_WIN_BASE_POINTS,
} from "../../lib/houseDifficulty";

const WalletSection = dynamic(() => import("../../components/WalletSection").then(m => ({ default: m.WalletSection })), { ssr: false, loading: () => <div style={{ width: 220, height: 40 }} /> });

const BG_IMAGE = "/new-assets/gameplay-landing-lite.webp";

type Tab = "bounty" | "past" | "casual" | "ranked";

// Casual/ranked are all-time boards with a W/L record; the bounty board is a
// single UTC day and carries prize state instead. One row shape covers both so
// the table renders once, with the columns varying per tab.
type Row = {
  rank: number;
  address: string;
  name?: string;
  points: number;
  wins?: number;
  losses?: number;
  qualified?: boolean;
  prizeUsd?: number;
  participationUsd?: number;
  totalUsd?: number;
};

function truncateAddress(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function winPct(wins: number, losses: number): string {
  const total = wins + losses;
  if (total === 0) return "—";
  return Math.round((wins / total) * 100) + "%";
}

const RANK_COLORS: Record<number, string> = {
  1: "#FFD700",
  2: "#C0C0C0",
  3: "#CD7F32",
};

// "Ranked" here means the ranked match mode, NOT wager — isRankedMultiplayerMode
// is `mode === "ranked"`. The old copy told players to play a wager match, which
// is a different (and currently disabled) mode, so the board looked unreachable.
const TABS: readonly { key: Tab; label: string; icon: string; hint: string }[] = [
  { key: "bounty", label: "Daily",  icon: "paid",            hint: "Today · prizes" },
  { key: "past",   label: "Winners", icon: "military_tech",   hint: "Past days" },
  { key: "casual", label: "Casual", icon: "sports_esports",  hint: "All time" },
  { key: "ranked", label: "Ranked", icon: "emoji_events",    hint: "Ranked PvP" },
];

const SUBTITLES: Record<Tab, string> = {
  bounty: `Today's race — $${BOUNTY_POOL_USD + BOUNTY_PARTICIPATION_POOL_USD}, resets 00:00 UTC`,
  past: "Who won on previous days, and what they were paid",
  casual: "All matches — VS House and PvP",
  ranked: "Ranked PvP matches only",
};

export default function Leaderboard() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const isMp = useMiniPayMode();
  const { address } = useAccount();
  const [isMobile, setIsMobile] = useState(false);
  const isCompact = isMp || isMobile;
  // The bounty board leads: it is the only one that resets, the only one with a
  // prize, and the only one a new player can realistically enter today.
  const [tab, setTab] = useState<Tab>("bounty");
  // The daily prize is paused, so this board is a points race for now. Every
  // piece of prize copy below keys off this rather than being deleted, so
  // resuming is a one-line change in bountyConfig.
  const bountyPaused = bountyPausedOn();
  const bountyCampaign = bountyCampaignFor();
  const bountyFinalDay = bountyIsFinalPayingDay();
  const [players, setPlayers] = useState<Row[]>([]);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const safeTop = "env(safe-area-inset-top)";

  useGameFrameScale(wrapRef);

  useEffect(() => {
    const sync = () => setIsMobile(window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent));
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  type HistoryDay = {
    day: string;
    totalPaidUsd: number;
    winners: { rank: number; address: string; name: string | null; points: number; usd: number; claimed: boolean; txHash: string | null }[];
  };
  /** The caller's own standing today, including the best-25 cap state. */
  type YouToday = {
    points: number;
    winsUsed: number;
    winsAllowed: number;
    slotsFilled: number;
    floorPoints: number | null;
  };
  const [youToday, setYouToday] = useState<YouToday | null>(null);
  const [showScoring, setShowScoring] = useState(false);
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);

  const loadHistory = () => {
    setLoading(true);
    setFetchError(false);
    void fetch("/api/bounty/history?days=30")
      .then((r) => r.json())
      .then((data: { days?: HistoryDay[]; totalPaidUsd?: number }) => {
        setHistory(data.days ?? []);
        setHistoryTotal(data.totalPaidUsd ?? 0);
        setLoading(false);
      })
      .catch(() => { setLoading(false); setFetchError(true); });
  };

  const loadLeaderboard = () => {
    setLoading(true);
    setFetchError(false);
    // ?address= makes the response carry `you` — the caller's own slot count
    // and floor, which is what the cap notice below is built from.
    const url = tab === "bounty"
      ? `/api/bounty?limit=50${address ? `&address=${address}` : ""}`
      : `/api/leaderboard?tab=${tab}&limit=50`;
    void fetch(url)
      .then((r) => r.json())
      .then((data: { players?: Row[]; standings?: Row[]; you?: YouToday | null }) => {
        const list = (tab === "bounty" ? data.standings : data.players) ?? [];
        setPlayers(list);
        setYouToday(data.you ?? null);
        setLoading(false);
        // Overlay Redis usernames on top of file-based names
        const addrs = list.map((p) => p.address).join(",");
        if (addrs) {
          void fetch(`/api/username?addresses=${addrs}`)
            .then((r) => r.json())
            .then((u: { map: Record<string, string> }) => setUsernames(u.map ?? {}))
            .catch(() => {});
        }
      })
      .catch(() => { setLoading(false); setFetchError(true); });
  };

  useEffect(() => {
    if (tab === "past") loadHistory();
    else loadLeaderboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, address]);

  // Ranked is unreachable in MiniPay (every mode but VS House is coming soon
  // there), so never leave a MiniPay player parked on an empty board.
  useEffect(() => {
    if (isMp && tab === "ranked") setTab("bounty");
  }, [isMp, tab]);

  // The bounty board has no W/L record — it trades those columns for the prize.
  // While paused there is no prize to show, so the column goes rather than
  // standing there empty or, worse, telling everyone how far they are from a
  // payout that isn't coming.
  const gridCols = tab === "bounty"
    ? bountyPaused
      ? (isCompact ? "64px 1fr 120px" : "48px 1fr 90px")
      : (isCompact ? "64px 1fr 120px 130px" : "48px 1fr 90px 100px")
    : (isCompact ? "64px 1fr 120px 76px 76px 90px" : "48px 1fr 90px 60px 60px 70px");
  const columns = tab === "bounty"
    ? (bountyPaused ? ["#", "PLAYER", "POINTS"] : ["#", "PLAYER", "POINTS", "PRIZE"])
    : ["#", "PLAYER", "POINTS", "W", "L", "WIN%"];

  // How many more points the signed-in player needs to hold a prize spot:
  // enough to clear the qualifying floor AND pass whoever currently sits last
  // in the money. Null when signed out or not on the bounty board.
  // What the signed-in player is owed today, if anything.
  const myPayout = (() => {
    if (tab !== "bounty" || !address) return 0;
    const mine = players.find((p) => p.address.toLowerCase() === address.toLowerCase());
    return mine?.totalUsd ?? 0;
  })();

  const pointsToPrize = (() => {
    if (tab !== "bounty" || !address) return null;
    const mine = players.find((p) => p.address.toLowerCase() === address.toLowerCase());
    const minePoints = mine?.points ?? 0;
    const lastPaid = players.filter((p) => (p.prizeUsd ?? 0) > 0).slice(-1)[0];
    const contested = players.length >= BOUNTY_TOP_N && lastPaid ? lastPaid.points + 1 : 0;
    const target = Math.max(BOUNTY_MIN_POINTS_TO_WIN, contested);
    if (mine && (mine.prizeUsd ?? 0) > 0) return 0;
    return Math.max(0, target - minePoints);
  })();

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef}
        data-ao-frame="" style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left", transform: "var(--ao-tr)" }}>

        {/* Background */}
        <MiniPayImage src={BG_IMAGE} alt="" minipayWidth={1280} minipayQuality={54} priority style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.75)" }} />

        {/* ── Top Bar ── */}
        <div style={{ position: "absolute", top: safeTop, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
            <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase", fontFamily: "var(--font-space-grotesk), sans-serif" }}>ACTION ORDER</span>
          </button>
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#9ca3af", textTransform: "uppercase" }}>LEADERBOARD</div>
          <WalletSection />
        </div>

        {/* Main container */}
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -46%)", width: isCompact ? 1160 : 820 }}>

          {/* Corner accents */}
          {[
            { top: -12, left: -12, borderLeft: "1.5px solid #b9e7f4", borderTop: "1.5px solid #b9e7f4" },
            { top: -12, right: -12, borderRight: "1.5px solid #b9e7f4", borderTop: "1.5px solid #b9e7f4" },
            { bottom: -12, left: -12, borderLeft: "1.5px solid #b9e7f4", borderBottom: "1.5px solid #b9e7f4" },
            { bottom: -12, right: -12, borderRight: "1.5px solid #b9e7f4", borderBottom: "1.5px solid #b9e7f4" },
          ].map((s, i) => (
            <div key={i} style={{ position: "absolute", width: 36, height: 36, ...s }} />
          ))}

          {/* Glass panel */}
          <div style={{
            backgroundColor: "rgba(15, 23, 42, 0.55)",
            border: "2.4px solid #b9e7f4", borderRadius: 6,
            backdropFilter: "blur(6px)",
            padding: "36px 40px 32px",
            position: "relative", overflow: "hidden",
            boxShadow: "0 0 20px rgba(185, 231, 244, 0.2)",
          }}>
            {/* Scanline */}
            <div style={{ position: "absolute", top: -2, left: -2, right: -2, height: 1.5, backgroundColor: "#56a4cb" }} />

            {/* Heading */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: isCompact ? 36 : 26, fontWeight: 700, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: -0.5, margin: 0, lineHeight: isCompact ? "44px" : "32px" }}>
                  Leaderboard
                </h2>
                <p style={{ fontSize: isCompact ? 16 : 12, color: "#94a3b8", margin: "4px 0 0", letterSpacing: 0.5 }}>
                  {tab === "bounty" && bountyPaused
                    ? "Today's points race — daily prizes are paused, resuming soon"
                    : SUBTITLES[tab]}
                </p>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 8 }}>
                {TABS.filter((t) => !(t.key === "ranked" && isMp)).map(({ key, label, icon, hint }) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    style={{
                      padding: isCompact ? "10px 26px" : "7px 18px",
                      border: `1.5px solid ${tab === key ? "#56a4cb" : "#334155"}`,
                      borderRadius: 5,
                      background: tab === key ? "rgba(86,164,203,0.15)" : "rgba(17,10,24,0.4)",
                      color: tab === key ? "#b9e7f4" : "#6b7280",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all 0.2s",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="material-icons" style={{ fontSize: isCompact ? 18 : 13, color: tab === key ? "#56a4cb" : "#475569" }}>{icon}</span>
                      <span style={{ fontSize: isCompact ? 15 : 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>{label}</span>
                    </div>
                    <span style={{ fontSize: isCompact ? 12 : 9, color: tab === key ? "#56a4cb99" : "#334155", letterSpacing: 0.5, textTransform: "uppercase" }}>
                      {key === "bounty" && bountyPaused ? "Today · paused" : hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Ranked explainer callout */}
            {tab === "ranked" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", marginBottom: 12, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 5 }}>
                <span className="material-icons" style={{ fontSize: 14, color: "#fbbf24" }}>toll</span>
                <span style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 0.3 }}>
                  Only <strong style={{ color: "#fbbf24" }}>Ranked</strong> matches count here. Create a Ranked match to appear on this board.
                </span>
              </div>
            )}

            {/* Paused announcement. Replaces the prize explainer rather than
                sitting beside it: two callouts, one promising a prize pool and
                one saying it is paused, is worse than either alone.

                The claim button stays — prizes won before the pause are still
                owed, and it hides itself when there is nothing to collect. */}
            {tab === "bounty" && bountyPaused && (
              <div style={{ display: "flex", alignItems: "flex-start", flexWrap: "wrap", gap: 10, padding: "10px 14px", marginBottom: 12, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.28)", borderRadius: 5 }}>
                <span className="material-icons" style={{ fontSize: 15, color: "#fbbf24", marginTop: 1 }}>pause_circle</span>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: isCompact ? 14 : 12, fontWeight: 800, color: "#fbbf24", letterSpacing: 0.5, textTransform: "uppercase" }}>
                    {BOUNTY_PAUSE_HEADLINE} · between campaigns
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: isCompact ? 13 : 11, color: "#94a3b8", lineHeight: 1.55, letterSpacing: 0.3 }}>
                    {BOUNTY_PAUSE_BLURB}
                  </p>
                </div>
                <ClaimBountyButton compact={isCompact} />
              </div>
            )}

            {/* Daily bounty explainer + how far you are from a prize */}
            {tab === "bounty" && !bountyPaused && (
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "8px 14px", marginBottom: 12, background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.22)", borderRadius: 5 }}>
                <span className="material-icons" style={{ fontSize: 14, color: "#4ade80" }}>paid</span>
                <span style={{ fontSize: isCompact ? 13 : 11, color: "#94a3b8", letterSpacing: 0.3 }}>
                  Top {BOUNTY_TOP_N} who reach{" "}
                  <strong style={{ color: "#4ade80" }}>{BOUNTY_MIN_POINTS_TO_WIN.toLocaleString()}</strong> points split{" "}
                  <strong style={{ color: "#4ade80" }}>${BOUNTY_POOL_USD}</strong>
                  {" "}({BOUNTY_PRIZE_SPLIT_USD.map((n) => `$${n}`).join(" / ")}).
                  {/* The window, so a short campaign reads as short. Without it
                      a three-day sprint looks identical to an open-ended run
                      and nobody feels a reason to play today. */}
                  {bountyCampaign && (
                    <>{" "}Running <strong style={{ color: "#4ade80" }}>{formatBountyCampaignRange(bountyCampaign)}</strong>.</>
                  )}
                  {/* GoodDollar must not appear anywhere in the MiniPay Mini
                      App — see the MiniPay review requirement. Web keeps it,
                      because G$ is what web winners are actually paid in. */}
                  {!isMp && <>{" "}Paid in G$ — 1st takes ≈{formatGdollar(BOUNTY_PRIZE_SPLIT_USD[0])}.</>}
                </span>
                {/* Said on the last paying day, so the prize does not simply
                    disappear overnight without warning. */}
                {bountyFinalDay && (
                  <span style={{ fontSize: isCompact ? 13 : 11, fontWeight: 800, color: "#fbbf24", letterSpacing: 0.3 }}>
                    Last paying day — the bounty pauses at 00:00 UTC and resumes soon. Today still pays.
                  </span>
                )}
                {/* Payouts are manual, so someone who has qualified needs a place
                    to actually collect rather than waiting and wondering. */}
                {/* Yesterday's prize, paid straight to the wallet. Today's
                    board is still moving, so there is nothing to claim yet. */}
                <ClaimBountyButton compact={isCompact} />
                {pointsToPrize !== null && (
                  <span style={{ fontSize: isCompact ? 13 : 11, fontWeight: 700, color: "#fbbf24", letterSpacing: 0.3 }}>
                    {pointsToPrize > 0
                      ? `${pointsToPrize.toLocaleString()} more points for a prize spot`
                      : "You're in a prize spot — hold it until 00:00 UTC"}
                  </span>
                )}
              </div>
            )}

            {/* How a daily score is actually built.
                The board announced the prize and the threshold and never once
                said how points are earned or why a score stops moving. Players
                asked twice in a day. Collapsed by default so it does not crowd
                the standings, and driven off the same constants the engine
                scores with so the table cannot quietly go stale. */}
            {tab === "bounty" && (
              // The frame is a fixed 1440x823 that gets scaled to fit, and the
              // standings below are a fixed-height scroller — so anything here
              // that GROWS pushes the board out of the frame and distorts the
              // page. The panel floats over the standings instead of taking up
              // room in the flow, which keeps the layout height constant open
              // or closed.
              <div style={{ position: "relative", marginBottom: 12, zIndex: 30 }}>
              <div style={{ background: "rgba(86,164,203,0.05)", border: "1px solid rgba(86,164,203,0.2)", borderRadius: 5, overflow: "hidden" }}>
                <button
                  onClick={() => setShowScoring((v) => !v)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                >
                  <span className="material-icons" style={{ fontSize: 14, color: "#56a4cb" }}>calculate</span>
                  <span style={{ flex: 1, fontSize: isCompact ? 13 : 11, fontWeight: 700, color: "#b9e7f4", letterSpacing: 0.4 }}>
                    How today&apos;s score is calculated
                  </span>
                  <span className="material-icons" style={{ fontSize: 16, color: "#56a4cb" }}>
                    {showScoring ? "expand_less" : "expand_more"}
                  </span>
                </button>
                </div>
                {showScoring && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                    // Bounded so a small viewport scrolls the panel rather than
                    // letting it run off the bottom of the card.
                    maxHeight: isCompact ? 300 : 260, overflowY: "auto",
                    padding: "12px 14px",
                    background: "#0d1420", border: "1px solid rgba(86,164,203,0.35)", borderRadius: 5,
                    boxShadow: "0 12px 32px rgba(0,0,0,0.65)",
                    fontSize: isCompact ? 13 : 11, color: "#94a3b8", lineHeight: 1.7, letterSpacing: 0.2,
                  }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "2px 10px", marginBottom: 10, alignItems: "baseline" }}>
                      <span style={{ fontSize: isCompact ? 11 : 9, color: "#475569", letterSpacing: 1, textTransform: "uppercase" }}>VS House</span>
                      <span style={{ fontSize: isCompact ? 11 : 9, color: "#475569", letterSpacing: 1, textTransform: "uppercase", textAlign: "right" }}>Win</span>
                      <span style={{ fontSize: isCompact ? 11 : 9, color: "#475569", letterSpacing: 1, textTransform: "uppercase", textAlign: "right" }}>Flawless</span>
                      {([
                        { label: "Easy", d: 0 as const, note: "" },
                        { label: "Moderate", d: 1 as const, note: "" },
                        { label: "Hard", d: 2 as const, note: "cards" },
                        { label: "Boss", d: 3 as const, note: "cards" },
                      ]).map(({ label, d, note }) => (
                        <Fragment key={label}>
                          <span style={{ color: "#cbd5e1" }}>
                            {label}
                            {note && <span style={{ color: "#a855f7", fontSize: isCompact ? 10 : 9, marginLeft: 5 }}>needs black market {note}</span>}
                          </span>
                          <span style={{ textAlign: "right", color: "#e2e8f0", fontWeight: 700 }}>
                            {Math.round(HOUSE_WIN_BASE_POINTS * DIFFICULTY_POINT_MULTIPLIER[d])}
                          </span>
                          <span style={{ textAlign: "right", color: "#fbbf24", fontWeight: 700 }}>
                            {Math.round((HOUSE_WIN_BASE_POINTS + HOUSE_FLAWLESS_BONUS) * DIFFICULTY_POINT_MULTIPLIER[d])}
                          </span>
                        </Fragment>
                      ))}
                    </div>
                    <p style={{ margin: "0 0 6px" }}>
                      <strong style={{ color: "#e2e8f0" }}>Flawless</strong> means winning without dropping a round.{" "}
                      A loss still pays <strong style={{ color: "#e2e8f0" }}>{HOUSE_LOSS_POINTS}</strong>, up to{" "}
                      <strong style={{ color: "#e2e8f0" }}>{HOUSE_LOSS_POINTS_PER_DAY}</strong> a day.
                    </p>
                    <p style={{ margin: "0 0 6px" }}>
                      Only your <strong style={{ color: "#fbbf24" }}>best {bountyWinsPerDay(bountyDayUTC())} wins</strong> count each day.
                      Once they are all filled a new win has to <strong style={{ color: "#e2e8f0" }}>beat your weakest one</strong> to
                      move your score — which is why it can stop climbing while you keep winning. Play a harder tier or win
                      flawlessly and it replaces a weaker result.
                    </p>
                    <p style={{ margin: "0 0 6px" }}>
                      <strong style={{ color: "#e2e8f0" }}>Boss wins are separate</strong> — up to{" "}
                      {HOUSE_BOSS_WINS_COUNTED_PER_DAY} a day, and they never use up your{" "}
                      {bountyWinsPerDay(bountyDayUTC())}.
                    </p>
                    <p style={{ margin: 0 }}>
                      Everything resets <strong style={{ color: "#e2e8f0" }}>00:00 UTC</strong>. Your{" "}
                      <strong style={{ color: "#e2e8f0" }}>Casual</strong> score is all-time and has no cap — wins past the
                      daily limit still count there.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* The best-25 cap, said on the board where the frozen number is.
                It was only ever explained on the match result screen, which is
                one tap away from gone — so players watched the Daily score
                refuse to move through win after win and reasonably concluded
                the game was broken. Shown to the player it applies to, with
                their own numbers, because "you need to beat 200" is actionable
                in a way that "the cap is 25" is not. */}
            {tab === "bounty" && youToday && youToday.slotsFilled > 0 && (
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "8px 14px", marginBottom: 12, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.22)", borderRadius: 5 }}>
                <span className="material-icons" style={{ fontSize: 14, color: "#fbbf24" }}>hourglass_top</span>
                <span style={{ fontSize: isCompact ? 13 : 11, color: "#94a3b8", letterSpacing: 0.3 }}>
                  Your <strong style={{ color: "#e2e8f0" }}>best {youToday.winsAllowed} House wins</strong> count each day —{" "}
                  <strong style={{ color: "#fbbf24" }}>{youToday.slotsFilled}/{youToday.winsAllowed}</strong> used.
                  {youToday.floorPoints !== null ? (
                    <>
                      {" "}A new win now has to beat{" "}
                      <strong style={{ color: "#fbbf24" }}>{youToday.floorPoints}</strong> points to move your score —
                      win flawlessly or on a harder tier and it replaces a weaker one. Boss fights always count.
                    </>
                  ) : (
                    <> Every win still counts until all {youToday.winsAllowed} are filled.</>
                  )}
                  {" "}Resets 00:00 UTC.
                </span>
                {/* Volume past the cap is the specific thing that looks broken:
                    the wins happen, the number does not move. Naming it beats
                    leaving them to work it out from the slot count. */}
                {youToday.winsUsed > youToday.winsAllowed && (
                  <span style={{ fontSize: isCompact ? 13 : 11, fontWeight: 700, color: "#fbbf24", letterSpacing: 0.3 }}>
                    {youToday.winsUsed - youToday.winsAllowed} win{youToday.winsUsed - youToday.winsAllowed === 1 ? "" : "s"} past the cap today — still counting on Casual.
                  </span>
                )}
              </div>
            )}

            {/* Past winners is grouped by day rather than a flat ranking, so it
                replaces the table instead of trying to reuse its columns. */}
            {tab === "past" ? (
              <div style={{ minHeight: isCompact ? 460 : 380, maxHeight: isCompact ? 460 : 380, overflowY: "auto", paddingTop: 4 }}>
                {loading ? (
                  <p style={{ textAlign: "center", padding: 40, fontSize: 12, color: "#475569", letterSpacing: 1 }}>Loading…</p>
                ) : fetchError ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 340, gap: 12 }}>
                    <span style={{ fontSize: 32 }}>⚠️</span>
                    <p style={{ fontSize: 13, color: "#f87171", letterSpacing: 1 }}>Failed to load past winners</p>
                    <button onClick={loadHistory} style={{ background: "rgba(86,164,203,0.12)", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 6, padding: "8px 20px", color: "#56a4cb", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 1 }}>RETRY</button>
                  </div>
                ) : history.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 340, gap: 12 }}>
                    <span className="material-icons" style={{ color: "#334155", fontSize: 48 }}>military_tech</span>
                    <p style={{ fontSize: 13, color: "#475569", letterSpacing: 1, textTransform: "uppercase" }}>No days settled yet</p>
                    <p style={{ fontSize: 11, color: "#334155", letterSpacing: 0.5 }}>The first winners appear after 00:00 UTC</p>
                  </div>
                ) : (
                  <>
                    {historyTotal > 0 && (
                      <div style={{ margin: "0 0 12px", padding: "10px 14px", background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 6, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: "#4ade80", textTransform: "uppercase" }}>Paid out so far</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: "#4ade80" }}>${historyTotal.toLocaleString()}</span>
                      </div>
                    )}
                    {history.map((d) => (
                      <div key={d.day} style={{ marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 4px 6px" }}>
                          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: "#94a3b8" }}>
                            {new Date(`${d.day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                          </span>
                          <span style={{ fontSize: 10, color: "#475569", letterSpacing: 0.5 }}>${d.totalPaidUsd} paid</span>
                        </div>
                        {d.winners.map((w) => {
                          const isMe = address && w.address.toLowerCase() === address.toLowerCase();
                          const rankColor = RANK_COLORS[w.rank] ?? "#64748b";
                          return (
                            <div key={w.address} style={{
                              display: "grid",
                              gridTemplateColumns: isCompact ? "40px 1fr 90px 84px" : "34px 1fr 76px 74px",
                              alignItems: "center",
                              padding: isCompact ? "10px 12px" : "8px 10px",
                              borderRadius: 6,
                              marginBottom: 3,
                              background: isMe ? "rgba(86,164,203,0.10)" : "rgba(255,255,255,0.02)",
                              border: `1px solid ${isMe ? "rgba(86,164,203,0.35)" : "rgba(255,255,255,0.04)"}`,
                            }}>
                              <span style={{ fontSize: isCompact ? 14 : 12, fontWeight: 800, color: rankColor }}>
                                {w.rank === 1 ? "🥇" : w.rank === 2 ? "🥈" : w.rank === 3 ? "🥉" : `#${w.rank}`}
                              </span>
                              <span style={{ fontSize: isCompact ? 14 : 12, fontWeight: 700, color: isMe ? "#b9e7f4" : "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {usernames[w.address.toLowerCase()] || w.name || `${w.address.slice(0, 6)}…${w.address.slice(-4)}`}
                                {isMe && <span style={{ color: "#56a4cb", fontSize: 10, marginLeft: 6 }}>YOU</span>}
                              </span>
                              <span style={{ fontSize: isCompact ? 13 : 11, fontWeight: 700, color: "#94a3b8" }}>{w.points.toLocaleString()}</span>
                              {/* A paid prize links to the transaction that paid
                                  it. "We paid out $X" is a claim; a tx hash is
                                  something anyone can check. */}
                              {w.claimed && w.txHash ? (
                                <a
                                  href={`https://celoscan.io/tx/${w.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ fontSize: isCompact ? 13 : 11, fontWeight: 800, color: "#4ade80", textAlign: "right", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3 }}
                                >
                                  ${w.usd}
                                  <span className="material-icons" style={{ fontSize: isCompact ? 13 : 11, opacity: 0.75 }}>open_in_new</span>
                                </a>
                              ) : (
                                <span style={{ fontSize: isCompact ? 13 : 11, fontWeight: 800, color: w.claimed ? "#4ade80" : "#fbbf24", textAlign: "right" }}>
                                  ${w.usd}{w.claimed ? "" : "*"}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    <p style={{ textAlign: "center", fontSize: 10, color: "#334155", letterSpacing: 0.5, padding: "4px 0 12px" }}>
                      * awaiting claim · tap a paid prize to view it on Celoscan
                    </p>
                  </>
                )}
              </div>
            ) : (
            <>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              gap: 0,
              padding: isCompact ? "10px 20px" : "8px 16px",
              borderBottom: "1px solid #1e293b",
              marginBottom: 4,
            }}>
              {columns.map((col) => (
                <span key={col} style={{ fontSize: isCompact ? 13 : 9, fontWeight: 700, letterSpacing: 1.5, color: "#475569", textTransform: "uppercase" }}>{col}</span>
              ))}
            </div>

            {/* Table rows */}
            <div style={{ minHeight: isCompact ? 420 : 340, maxHeight: isCompact ? 420 : 340, overflowY: "auto" }}>
              {loading ? (
                <div>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: gridCols, gap: 0, padding: isCompact ? "14px 20px" : "12px 16px", borderBottom: "1px solid rgba(30,41,59,0.6)" }}>
                      {/* One bar per column, so the skeleton matches whichever
                          tab is loading instead of spilling onto a second row. */}
                      {columns.map((col, c) => (
                        <div
                          key={col}
                          style={{
                            width: c === 1 ? `${60 + (i % 3) * 12}%` : c === 0 ? 24 : 40,
                            height: 14,
                            borderRadius: 3,
                            background: "rgba(255,255,255,0.06)",
                            animation: "shimmer 1.4s ease-in-out infinite",
                            animationDelay: `${i * 0.08}s`,
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ) : fetchError ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 340, gap: 12 }}>
                  <span style={{ fontSize: 32 }}>⚠️</span>
                  <p style={{ fontSize: 13, color: "#f87171", letterSpacing: 1 }}>Failed to load leaderboard</p>
                  <button onClick={loadLeaderboard} style={{ background: "rgba(86,164,203,0.12)", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 6, padding: "8px 20px", color: "#56a4cb", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 1 }}>RETRY</button>
                </div>
              ) : players.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 340, gap: 12 }}>
                  <span className="material-icons" style={{ color: "#334155", fontSize: 48 }}>leaderboard</span>
                  <p style={{ fontSize: 13, color: "#475569", letterSpacing: 1, textTransform: "uppercase" }}>
                    {tab === "bounty" ? "No points scored today yet" : "No matches recorded yet"}
                  </p>
                  <p style={{ fontSize: 11, color: "#334155", letterSpacing: 0.5 }}>
                    {tab !== "bounty"
                      ? "Play a match to appear here"
                      : bountyPaused
                        ? "Play a match to take the top of today's board"
                        : `Reach ${BOUNTY_MIN_POINTS_TO_WIN.toLocaleString()} points to compete for $${BOUNTY_POOL_USD}`}
                  </p>
                </div>
              ) : (
                players.map((p) => {
                  const isMe = address && p.address.toLowerCase() === address.toLowerCase();
                  const rankColor = RANK_COLORS[p.rank];
                  return (
                    <div
                      key={p.address}
                      style={{
                        display: "grid",
                        gridTemplateColumns: gridCols,
                        gap: 0,
                        padding: isCompact ? "14px 20px" : "10px 16px",
                        borderBottom: "1px solid rgba(30,41,59,0.6)",
                        backgroundColor: isMe ? "rgba(86,164,203,0.1)" : "transparent",
                        borderLeft: isMe ? "2px solid #56a4cb" : "2px solid transparent",
                        transition: "background 0.2s",
                      }}
                    >
                      {/* Rank */}
                      <span style={{
                        fontSize: isCompact ? (rankColor ? 20 : 17) : (rankColor ? 15 : 13),
                        fontWeight: 800,
                        color: rankColor ?? "#475569",
                        textShadow: rankColor ? `0 0 8px ${rankColor}` : "none",
                      }}>
                        {p.rank <= 3 ? ["🥇", "🥈", "🥉"][p.rank - 1] : `#${p.rank}`}
                      </span>

                      {/* Name / Address */}
                      {(() => {
                        const displayName = usernames[p.address.toLowerCase()] ?? p.name;
                        return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{
                              fontSize: isCompact ? (displayName ? 17 : 15) : (displayName ? 13 : 12),
                              fontWeight: isMe ? 700 : 500,
                              color: isMe ? "#b9e7f4" : displayName ? "#e2e8f0" : "#94a3b8",
                              fontFamily: displayName ? "inherit" : "monospace",
                              letterSpacing: displayName ? 0.3 : 0.5,
                            }}>
                              {displayName ?? truncateAddress(p.address)}
                            </span>
                            {isMe && (
                              <span style={{ fontSize: isCompact ? 12 : 9, fontWeight: 700, letterSpacing: 1, color: "#56a4cb", textTransform: "uppercase", background: "rgba(86,164,203,0.15)", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 3, padding: isCompact ? "2px 7px" : "1px 5px" }}>
                                YOU
                              </span>
                            )}
                          </div>
                          {displayName && !isMp && (
                            <span style={{ fontSize: isCompact ? 13 : 10, color: "#475569", fontFamily: "monospace", letterSpacing: 0.3 }}>
                              {truncateAddress(p.address)}
                            </span>
                          )}
                        </div>
                        );
                      })()}

                      {/* Points — dimmed on the bounty board until they qualify,
                          so the cutoff is visible rather than just implied. */}
                      <span style={{
                        fontSize: isCompact ? 18 : 14,
                        fontWeight: 800,
                        color: tab === "bounty" && !bountyPaused && !p.qualified ? "#64748b" : "#f1f5f9",
                      }}>
                        {p.points.toLocaleString()}
                      </span>

                      {tab === "bounty" ? (
                        bountyPaused ? null : (p.totalUsd ?? 0) > 0 ? (
                          <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            <span style={{ fontSize: isCompact ? 17 : 13, fontWeight: 800, color: "#4ade80" }}>
                              ${p.totalUsd}
                            </span>
                            {/* G$ is what web players actually receive, so show
                                it rather than making them convert from dollars —
                                but never inside MiniPay. */}
                            {!isMp && (
                              <span style={{ fontSize: isCompact ? 11 : 9, color: "#475569", letterSpacing: 0.3 }}>
                                ≈{formatGdollar(p.totalUsd ?? 0)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span style={{ fontSize: isCompact ? 13 : 10, fontWeight: 600, color: "#475569", letterSpacing: 0.5 }}>
                            {p.qualified
                              ? "—"
                              : `${(BOUNTY_MIN_POINTS_TO_WIN - p.points).toLocaleString()} to qualify`}
                          </span>
                        )
                      ) : (
                        <>
                          {/* Wins */}
                          <span style={{ fontSize: isCompact ? 17 : 13, fontWeight: 600, color: "#4ade80" }}>{p.wins ?? 0}</span>

                          {/* Losses */}
                          <span style={{ fontSize: isCompact ? 17 : 13, fontWeight: 600, color: "#f87171" }}>{p.losses ?? 0}</span>

                          {/* Win % */}
                          <span style={{ fontSize: isCompact ? 17 : 13, fontWeight: 600, color: "#94a3b8" }}>{winPct(p.wins ?? 0, p.losses ?? 0)}</span>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            </>
            )}

            {/* Footer / back */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 20 }}>
              <div style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
              <button
                onClick={() => router.push("/")}
                className="ko-btn ko-btn-secondary"
                style={{ padding: "8px 16px" }}
              >
                <span className="material-icons ko-btn-icon" style={{ fontSize: 16, color: "rgba(255,255,255,0.9)" }}>arrow_back_ios</span>
                <span className="ko-btn-text" style={{ fontSize: 13, letterSpacing: 1.5, fontWeight: 700, color: "rgba(255,255,255,0.9)", textTransform: "uppercase" }}>Back</span>
              </button>
              <div style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
            </div>
          </div>
        </div>

        {/* Footer bar */}
        <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#4ade80" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", letterSpacing: 1.2, textTransform: "uppercase" }}>
            {isMp ? "ACTION ORDER" : "ACTION ORDER — CELO MAINNET"}
          </span>
        </div>

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
