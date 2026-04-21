"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { isMiniPay, formatAddress } from "../lib/minipay";

type BracketPlayer = { seed: number; address: string; points: number };
type MatchResult = { match: number; winner: "top" | "bottom" | null };
type BracketSlot = { top: BracketPlayer | null; bottom: BracketPlayer | null };
type TournamentState = {
  weekId: string;
  status: "registration" | "active" | "complete";
  registered: string[];
  maxPlayers: number;
  seeded: BracketPlayer[];
  results: { r16: MatchResult[]; qf: MatchResult[]; sf: MatchResult[]; final: MatchResult[] };
  champion: string | null;
  prizePool: string;
  payouts: Record<string, string>;
  slots: { r16: BracketSlot[]; qf: BracketSlot[]; sf: BracketSlot[]; final: BracketSlot[]; champion: BracketPlayer | null } | null;
};

const DESIGN_W = 1440;
const DESIGN_H = 823;
const DESIGN_CONTENT_H = 1540; // full page height including bracket

const SPOTS = 16;

function useCountdown() {
  const [time, setTime] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const next = new Date(now);
      // Find next Monday 00:00 UTC
      const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
      next.setUTCDate(now.getUTCDate() + daysUntilMonday);
      next.setUTCHours(0, 0, 0, 0);
      const diff = Math.max(0, next.getTime() - now.getTime());
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTime({ days: d, hours: h, minutes: m, seconds: s });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "PLAY RANKED MATCHES",
    body: "Every ranked match you win earns you Points. Beat higher-ranked opponents for bonus multipliers. Losses cost fewer points than wins reward.",
    icon: "⚔️",
    color: "#56a4cb",
  },
  {
    step: "02",
    title: "REGISTER YOUR WALLET",
    body: "Click Register on this page while registration is open. First 16 wallets get in. Bracket seeding is based on your ranked Points — more wins = better seed.",
    icon: "🏆",
    color: "#f59e0b",
  },
  {
    step: "03",
    title: "FIGHT IN THE BRACKET",
    body: "Qualified players are seeded into a single-elimination bracket. Matches run on Monday. Win your bracket match to advance — one loss and you're out.",
    icon: "🎯",
    color: "#a855f7",
  },
  {
    step: "04",
    title: "CLAIM YOUR PRIZE",
    body: `Prizes stream directly to your wallet in G$ (GoodDollar) via Superfluid — no claim needed. 1st gets 60%, 2nd 25%, 3rd and 4th split the remaining 15%.`,
    icon: "💰",
    color: "#4ade80",
  },
];

const RULES = [
  "Register your wallet — spots are first-come, first-served (max 16)",
  "Bracket is seeded from ranked points when registration closes",
  "Single-elimination, best-of-1 per match — one loss and you're out",
  "Matches are played live — failure to show forfeits the match",
  "Prize pool split: 1st 60% · 2nd 25% · 3rd–4th 7.5% each (paid in G$)",
  "Prizes stream directly to your wallet via Superfluid — no claim needed",
];

function WalletSection() {
  const { address, isConnected } = useAccount();
  const base: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10,
    border: "1.5px solid #56a4cb", borderRadius: 6, padding: "8px 18px",
    backdropFilter: "blur(10px)",
    clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)",
    boxShadow: "0 0 16px rgba(86,164,203,0.3), inset 0 0 20px rgba(86,164,203,0.07)",
  };

  if (isMiniPay() && isConnected && address) {
    return (
      <div style={{ ...base, background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(86,164,203,0.18))" }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
        <div>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: "#56a4cb", textTransform: "uppercase", lineHeight: 1 }}>CELO WALLET</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#b9e7f4", letterSpacing: 1, lineHeight: 1.5 }}>{formatAddress(address)}</div>
        </div>
      </div>
    );
  }

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
        if (!mounted) return null;
        const connected = !!(account && chain);
        return (
          <button onClick={connected ? openAccountModal : openConnectModal} style={{
            ...base, cursor: "pointer", fontFamily: "inherit",
            background: connected
              ? "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(86,164,203,0.18))"
              : "linear-gradient(135deg, rgba(34,47,66,0.95), rgba(86,164,203,0.28))",
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#4ade80" : "#56a4cb", boxShadow: `0 0 6px ${connected ? "#4ade80" : "#56a4cb"}` }} />
            <div>
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: "#56a4cb", textTransform: "uppercase", lineHeight: 1 }}>
                {connected ? "CELO WALLET" : "CONNECT"}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#b9e7f4", letterSpacing: 1, lineHeight: 1.5 }}>
                {connected ? (account.displayName ?? formatAddress(account.address)) : "SIGN IN"}
              </div>
            </div>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

export default function TournamentPage() {
  const outerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { address } = useAccount();
  const [rank, setRank] = useState<number | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [bracketPlayers, setBracketPlayers] = useState<{ address: string; points: number }[]>([]);
  const [tournament, setTournament] = useState<TournamentState | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const countdown = useCountdown();

  useEffect(() => {
    const scale = () => {
      if (!wrapRef.current || !outerRef.current) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isPortrait = vh > vw;
      if (isPortrait) {
        const s = Math.min(vw / DESIGN_H, vh / DESIGN_W);
        const tx = vw / 2 + (DESIGN_H * s) / 2;
        const ty = vh / 2 - (DESIGN_W * s) / 2;
        wrapRef.current.style.transform = `translate(${tx}px, ${ty}px) rotate(90deg) scale(${s})`;
        outerRef.current.style.height = `${vh}px`;
      } else {
        // Scale to fit width; let height scroll
        const s = vw / DESIGN_W;
        const tx = (vw - DESIGN_W * s) / 2;
        wrapRef.current.style.transform = `translate(${tx}px, 0px) scale(${s})`;
        outerRef.current.style.height = `${DESIGN_CONTENT_H * s}px`;
      }
    };
    scale();
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, []);

  // Fetch top 16 for bracket seeding (used when no active tournament)
  useEffect(() => {
    fetch("/api/leaderboard?tab=ranked&limit=16")
      .then((r) => r.json())
      .then((data: { players: { address: string; points: number }[] }) => {
        setBracketPlayers(data.players ?? []);
      })
      .catch(() => { /* ignore */ });
  }, []);

  // Fetch current tournament bracket state
  const fetchTournament = useCallback(() => {
    fetch("/api/tournament")
      .then((r) => r.json())
      .then((data: TournamentState) => setTournament(data))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchTournament(); }, [fetchTournament]);

  // Check if current address is already registered
  useEffect(() => {
    if (!address || !tournament) return;
    setRegistered(tournament.registered?.includes(address.toLowerCase()) ?? false);
  }, [address, tournament]);

  // Register player for the tournament
  const handleRegister = useCallback(async () => {
    if (!address) return;
    setRegistering(true);
    try {
      const res = await fetch("/api/tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register", address: address.toLowerCase() }),
      });
      if (res.ok) {
        setRegistered(true);
        fetchTournament();
      }
    } finally {
      setRegistering(false);
    }
  }, [address, fetchTournament]);

  // Seed bracket from current leaderboard top 16 (admin action)
  const seedBracket = useCallback(async () => {
    if (bracketPlayers.length === 0) return;
    setSeeding(true);
    try {
      const res = await fetch("/api/tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed", players: bracketPlayers }),
      });
      if (res.ok) {
        const data = await res.json() as TournamentState;
        setTournament(data);
      }
    } finally {
      setSeeding(false);
    }
  }, [bracketPlayers]);

  // Fetch the player's current rank if connected
  useEffect(() => {
    if (!address) return;
    fetch("/api/leaderboard?type=ranked&limit=200")
      .then((r) => r.json())
      .then((data: { players: { address: string; points: number }[] }) => {
        const idx = data.players?.findIndex(
          (p) => p.address.toLowerCase() === address.toLowerCase()
        );
        if (idx !== -1 && idx !== undefined) {
          setRank(idx + 1);
          setPoints(data.players[idx].points);
        }
      })
      .catch(() => {});
  }, [address]);

  const qualified = rank !== null && rank <= SPOTS;

  return (
    <div ref={outerRef} style={{ width: "100vw", overflowX: "hidden", overflowY: "auto", position: "relative", backgroundColor: "#050505", fontFamily: "var(--font-space-grotesk), sans-serif" }}>

      {/* Background */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <video autoPlay loop muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.12 }}>
          <source src="/new-assets/lobby-vs-scene.webm" type="video/webm" />
        </video>
        {/* gradient overlays */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(86,164,203,0.06) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(5,5,5,0.7) 0%, rgba(5,5,5,0.4) 40%, rgba(5,5,5,0.85) 100%)" }} />
      </div>

      <div ref={wrapRef} style={{ width: DESIGN_W, minHeight: DESIGN_H, height: "auto", position: "absolute", top: 0, left: 0, transformOrigin: "top left", zIndex: 1 }}>

        {/* ── Top Bar ──────────────────────────────────────────────────── */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          {/* Logo */}
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
            <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase" }}>ACTION ORDER</span>
          </button>

          {/* Center tag */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 18px", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 4, background: "rgba(86,164,203,0.08)" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", boxShadow: "0 0 8px #f59e0b", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#f59e0b", textTransform: "uppercase" }}>WEEKLY TOURNAMENT</span>
          </div>

          {/* Nav + Wallet */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={() => router.push("/leaderboard")} style={{ background: "none", border: "1px solid rgba(86,164,203,0.25)", borderRadius: 4, padding: "7px 16px", cursor: "pointer", color: "#9ca3af", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "inherit" }}>
              RANKINGS
            </button>
            <WalletSection />
          </div>
        </div>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div style={{ position: "absolute", top: 84, left: 0, right: 0, height: 210, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 4, color: "#56a4cb", textTransform: "uppercase" }}>SEASON 1 · ORDER ASCENSION</div>
          <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: "-3.5px", color: "white", textTransform: "uppercase", textAlign: "center", lineHeight: 1, textShadow: "0 0 40px rgba(86,164,203,0.35)" }}>
            THE TOURNAMENT
          </div>
          <div style={{ fontSize: 15, color: "#9ca3af", letterSpacing: 0.5, textAlign: "center", maxWidth: 560, lineHeight: 1.6 }}>
            Every week the top 16 ranked players clash in a live bracket for glory and a prize pool paid out on-chain. No sign-up. No luck. Just skill.
          </div>

          {/* Key stats row */}
          <div style={{ display: "flex", gap: 32, marginTop: 8, alignItems: "flex-start" }}>
            {[
              {
                label: "PRIZE POOL",
                value: tournament?.prizePool && tournament.prizePool !== "0"
                  ? `${(Number(BigInt(tournament.prizePool)) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 })} G$`
                  : "120,000 G$",
                color: "#4ade80",
              },
              {
                label: "REGISTERED",
                value: tournament ? `${tournament.registered?.length ?? 0} / ${tournament.maxPlayers ?? SPOTS}` : `0 / ${SPOTS}`,
                color: "#56a4cb",
              },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: "#6b7280", textTransform: "uppercase" }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color, letterSpacing: 0.5, marginTop: 2 }}>{value}</div>
              </div>
            ))}
            {/* Live countdown */}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: "#6b7280", textTransform: "uppercase", marginBottom: 2 }}>NEXT BRACKET IN</div>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                {[
                  { v: countdown.days, label: "D" },
                  { v: countdown.hours, label: "H" },
                  { v: countdown.minutes, label: "M" },
                  { v: countdown.seconds, label: "S" },
                ].map(({ v, label }) => (
                  <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "#f59e0b", letterSpacing: -1, lineHeight: 1, minWidth: 28, textAlign: "center" }}>
                      {String(v).padStart(2, "0")}
                    </div>
                    <div style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", letterSpacing: 1 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── How It Works ─────────────────────────────────────────────── */}
        <div style={{ position: "absolute", top: 306, left: 64, right: 64 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#6b7280", textTransform: "uppercase", marginBottom: 14 }}>HOW IT WORKS</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${item.color}28`, borderRadius: 8, padding: "18px 16px", position: "relative", overflow: "hidden" }}>
                {/* step number watermark */}
                <div style={{ position: "absolute", top: -6, right: 10, fontSize: 56, fontWeight: 900, color: `${item.color}0d`, letterSpacing: -2, lineHeight: 1, userSelect: "none" }}>{item.step}</div>
                <div style={{ fontSize: 22, marginBottom: 8 }}>{item.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: item.color, textTransform: "uppercase", marginBottom: 6 }}>{item.step} · {item.title}</div>
                <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.7 }}>{item.body}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Rules + Status row ───────────────────────────────────────── */}
        <div style={{ position: "absolute", top: 562, left: 64, right: 64, display: "flex", gap: 20, alignItems: "flex-start" }}>

          {/* Rules */}
          <div style={{ flex: 1, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "18px 20px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#6b7280", textTransform: "uppercase", marginBottom: 12 }}>TOURNAMENT RULES</div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {RULES.map((rule, i) => (
                <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 12, color: "#9ca3af", lineHeight: 1.5 }}>
                  <span style={{ color: "#56a4cb", fontWeight: 700, flexShrink: 0, marginTop: 1 }}>▸</span>
                  {rule}
                </li>
              ))}
            </ul>
          </div>

          {/* Player status + CTA */}
          <div style={{ width: 340, display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Qualification status card */}
            <div style={{ background: address ? (qualified ? "rgba(74,222,128,0.06)" : "rgba(86,164,203,0.06)") : "rgba(255,255,255,0.02)", border: `1px solid ${address ? (qualified ? "rgba(74,222,128,0.25)" : "rgba(86,164,203,0.25)") : "rgba(255,255,255,0.07)"}`, borderRadius: 8, padding: "18px 20px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#6b7280", textTransform: "uppercase", marginBottom: 10 }}>YOUR STATUS</div>

              {!address ? (
                <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6 }}>
                  Connect your wallet to see your current rank and whether you&apos;ve qualified for this week&apos;s tournament.
                </div>
              ) : rank === null ? (
                <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6 }}>
                  You haven&apos;t played any ranked matches yet. Jump in — every win moves you up the board.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Rank</span>
                    <span style={{ fontSize: 22, fontWeight: 900, color: rank <= 3 ? "#f59e0b" : qualified ? "#4ade80" : "#b9e7f4", letterSpacing: -1 }}>#{rank}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Points</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#b9e7f4" }}>{points?.toLocaleString()}</span>
                  </div>
                  <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "4px 0" }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: qualified ? "#4ade80" : "#f59e0b", letterSpacing: 0.5 }}>
                    {qualified
                      ? `✓ You qualify! Hold your spot until Monday.`
                      : `${SPOTS - rank < 0 ? "Outside" : `${rank - SPOTS} rank${rank - SPOTS > 1 ? "s" : ""} outside`} the top ${SPOTS} — keep playing.`}
                  </div>
                </div>
              )}
            </div>

            {/* CTA buttons */}
            {tournament?.status === "registration" && address && (
              <button
                onClick={() => void handleRegister()}
                disabled={registering || registered}
                style={{
                  width: "100%", height: 52,
                  background: registered ? "rgba(74,222,128,0.1)" : "linear-gradient(135deg, #1a4a2a, #0f2a18)",
                  border: `1.5px solid ${registered ? "#4ade80" : "#4ade80"}`,
                  borderRadius: 6, cursor: registered ? "default" : "pointer",
                  fontFamily: "inherit", fontWeight: 800, fontSize: 15, letterSpacing: 2.5,
                  color: "#4ade80", textTransform: "uppercase",
                  clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)",
                  boxShadow: "0 0 20px rgba(74,222,128,0.2)",
                  opacity: registering ? 0.6 : 1,
                }}
              >
                {registered ? "✓ REGISTERED" : registering ? "REGISTERING…" : "REGISTER NOW ▸"}
              </button>
            )}
            <button
              onClick={() => router.push("/select-character")}
              style={{ width: "100%", height: 52, background: "linear-gradient(135deg, #1a3a52, #0f2233)", border: "1.5px solid #56a4cb", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 15, letterSpacing: 2.5, color: "#b9e7f4", textTransform: "uppercase", clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)", boxShadow: "0 0 20px rgba(86,164,203,0.25)" }}
            >
              PLAY RANKED NOW ▸
            </button>
            <button
              onClick={() => router.push("/leaderboard")}
              style={{ width: "100%", height: 44, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13, letterSpacing: 2, color: "#6b7280", textTransform: "uppercase" }}
            >
              VIEW FULL LEADERBOARD
            </button>
          </div>
        </div>

      {/* ── Bracket Section ── */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 836, padding: "0 80px 80px" }}>
        {/* Section header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: "rgba(86,164,203,0.15)" }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: "#56a4cb", textTransform: "uppercase" }}>THIS WEEK&apos;S BRACKET</div>
          <div style={{ flex: 1, height: 1, background: "rgba(86,164,203,0.15)" }} />
        </div>

        {/* Bracket controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#475569" }}>
            {tournament?.status === "registration" && `Week ${tournament.weekId} · Registration open — ${tournament.registered?.length ?? 0}/${tournament.maxPlayers ?? SPOTS} signed up`}
            {tournament?.status === "active" && `Week ${tournament.weekId} · Active`}
            {tournament?.status === "complete" && `Week ${tournament.weekId} · Champion crowned`}
            {!tournament && "No tournament open yet"}
          </div>
          {tournament?.status === "registration" && (
            <button
              onClick={seedBracket}
              disabled={seeding || bracketPlayers.length === 0}
              style={{ background: seeding ? "rgba(86,164,203,0.1)" : "rgba(86,164,203,0.15)", border: "1px solid #56a4cb", borderRadius: 5, padding: "7px 18px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 11, letterSpacing: 1.5, color: "#b9e7f4", textTransform: "uppercase", opacity: seeding ? 0.6 : 1 }}
            >
              {seeding ? "SEEDING…" : "LOCK & SEED BRACKET"}
            </button>
          )}
          {tournament?.champion && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(251,204,92,0.08)", border: "1px solid rgba(251,204,92,0.3)", borderRadius: 6, padding: "8px 16px" }}>
              <span style={{ fontSize: 16 }}>🏆</span>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#f59e0b", textTransform: "uppercase" }}>CHAMPION</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace" }}>
                  {tournament.champion.slice(0, 6)}…{tournament.champion.slice(-4)}
                  {address && tournament.champion.toLowerCase() === address.toLowerCase() && " 👑 YOU"}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Round labels */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr 24px 1fr 24px 1fr", gap: 0, marginBottom: 10 }}>
          {["ROUND OF 16", "", "QUARTERFINALS", "", "SEMIFINALS", "", "FINAL"].map((label, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, letterSpacing: 2, color: label ? "#475569" : "transparent", textTransform: "uppercase" }}>{label || "·"}</div>
          ))}
        </div>

        {/* Bracket grid */}
        <div style={{ display: "flex", gap: 0, alignItems: "stretch", paddingBottom: 8 }}>
          {/* Helper to render a match slot */}
          {(() => {
            const isMe = (p: BracketPlayer | null) => address && p && p.address.toLowerCase() === address.toLowerCase();

            function matchSlot(slot: BracketSlot | undefined, result: MatchResult | undefined, gold = false) {
              const topWon = result?.winner === "top";
              const botWon = result?.winner === "bottom";
              return (
                <div style={{ background: gold ? "rgba(251,204,92,0.06)" : "rgba(15,23,42,0.6)", border: `1px solid ${gold ? "rgba(251,204,92,0.25)" : "rgba(86,164,203,0.15)"}`, borderRadius: 6, overflow: "hidden" }}>
                  {(["top", "bottom"] as const).map((side, j) => {
                    const p = side === "top" ? slot?.top : slot?.bottom;
                    const won = side === "top" ? topWon : botWon;
                    const lost = result?.winner !== null && !won;
                    return (
                      <div key={side} style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "7px 10px",
                        background: won ? "rgba(74,222,128,0.08)" : isMe(p ?? null) ? "rgba(86,164,203,0.1)" : "transparent",
                        borderBottom: j === 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
                        opacity: lost ? 0.4 : 1,
                      }}>
                        {p?.seed && <span style={{ fontSize: 9, fontWeight: 700, color: "#56a4cb", width: 18, textAlign: "right", flexShrink: 0 }}>#{p.seed}</span>}
                        <span style={{ fontSize: 10, fontWeight: 600, color: won ? "#4ade80" : p ? "#94a3b8" : "#334155", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                          {p ? `${p.address.slice(0, 6)}…${p.address.slice(-4)}` : "TBD"}
                        </span>
                        {won && <span style={{ fontSize: 9, color: "#4ade80" }}>✓</span>}
                        {isMe(p ?? null) && <span style={{ fontSize: 7, fontWeight: 800, color: "#4ade80", letterSpacing: 0.5 }}>YOU</span>}
                      </div>
                    );
                  })}
                </div>
              );
            }

            const slots = tournament?.slots;
            const results = tournament?.results;

            // Derive r16 fallback from bracketPlayers when no tournament is seeded
            const r16Fallback: BracketSlot[] = Array.from({ length: 8 }, (_, i) => ({
              top: bracketPlayers[i] ? { seed: i + 1, ...bracketPlayers[i] } : null,
              bottom: bracketPlayers[15 - i] ? { seed: 16 - i, ...bracketPlayers[15 - i] } : null,
            }));

            const r16 = slots?.r16 ?? r16Fallback;
            const qf  = slots?.qf  ?? Array.from({ length: 4 }, () => ({ top: null, bottom: null }));
            const sf  = slots?.sf  ?? Array.from({ length: 2 }, () => ({ top: null, bottom: null }));
            const fin = slots?.final ?? [{ top: null, bottom: null }];

            return (
              <>
                {/* R16 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                  {r16.map((slot, i) => matchSlot(slot, results?.r16[i]))}
                </div>

                <div style={{ width: 24, display: "flex", alignItems: "center", justifyContent: "center", color: "#334155", fontSize: 16 }}>›</div>

                {/* QF */}
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", flex: 1 }}>
                  {qf.map((slot, i) => matchSlot(slot, results?.qf[i]))}
                </div>

                <div style={{ width: 24, display: "flex", alignItems: "center", justifyContent: "center", color: "#334155", fontSize: 16 }}>›</div>

                {/* SF */}
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", flex: 1 }}>
                  {sf.map((slot, i) => matchSlot(slot, results?.sf[i]))}
                </div>

                <div style={{ width: 24, display: "flex", alignItems: "center", justifyContent: "center", color: "#334155", fontSize: 16 }}>›</div>

                {/* Final */}
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
                  {fin.map((slot, i) => matchSlot(slot, results?.final[i], true))}
                </div>
              </>
            );
          })()}
        </div>

        {bracketPlayers.length === 0 && !tournament?.seeded.length && (
          <div style={{ textAlign: "center", padding: "24px", color: "#334155", fontSize: 12 }}>
            No ranked matches yet — bracket forms when players compete.
          </div>
        )}
      </div>

      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
