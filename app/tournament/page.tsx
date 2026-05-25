"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { MiniPayImage } from "../components/MiniPayImage";
import { WalletSection } from "../components/WalletSection";
import { useGameStore } from "../lib/gameStore";
import { DESIGN_H, DESIGN_W } from "../lib/designConstants";
import { useMobileViewportMode } from "../lib/mobile";
import { useMiniPayMode } from "../lib/premiumPayments";

type WinnerRow = {
  rank: number;
  playerAddress: string;
  playerName: string | null;
  playerCharacterId: string;
  opponentCharacterId: string;
  rewardCode: string;
  rewardUsd: number;
  verifiedAt: number;
};

type HouseWinnerResponse = {
  recentWinners: WinnerRow[];
  totalWinners: number;
  claimedUsd: number;
  poolPrizeUsd: number;
  poolRemainingUsd: number;
};

function fallbackName(address: string, isMiniPay: boolean) {
  return isMiniPay
    ? `Player ${address.slice(-4).toUpperCase()}`
    : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function HouseBossChallengePage() {
  const isMp = useMiniPayMode();
  const isMobileViewport = useMobileViewportMode();
  const outerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { address } = useAccount();
  const { resetMatch, setVsBot, setWager, setMatchMode } = useGameStore();

  const [data, setData] = useState<HouseWinnerResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const challengeSteps = [
    {
      step: "01",
      title: "ENTER VS HOUSE",
      body: "Open VS House and start the 5-fight Upper Chamber run. The last two fights are now boss-tier difficulty.",
      icon: "⚔️",
      color: "#56a4cb",
    },
    {
      step: "02",
      title: "CLEAR ALL 5 FIGHTS",
      body: "You only qualify if you beat the full 5/5 streak, including the final mirror fight against your own fighter.",
      icon: "🏆",
      color: "#fbbf24",
    },
    {
      step: "03",
      title: "COPY YOUR WINNER CODE",
      body: "After a verified 5/5 win, the House Winner modal gives you a reward code tied directly to telemetry for that run.",
      icon: "🧾",
      color: "#4ade80",
    },
    {
      step: "04",
      title: "CLAIM IN BOUNTY CORNER",
      body: "Post your code in Bounty Corner inside t.me/actionorder. Ops can verify the win and release your reward from the pool.",
      icon: "💬",
      color: "#a855f7",
    },
  ];

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
      } else {
        const s = Math.min(vw / DESIGN_W, vh / DESIGN_H);
        const tx = (vw - DESIGN_W * s) / 2;
        const ty = (vh - DESIGN_H * s) / 2;
        wrapRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      }
    };
    scale();
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, [isMp]);

  const fetchChallenge = useCallback(() => {
    setLoading(true);
    fetch("/api/house-winner", { cache: "no-store" })
      .then((r) => r.json())
      .then((next: HouseWinnerResponse) => setData(next))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchChallenge();
  }, [fetchChallenge]);

  const playVsHouse = () => {
    resetMatch();
    setVsBot(true);
    setMatchMode("vshouse");
    setWager(false, null, "cusd");
    router.push("/create");
  };

  const poolPrizeDisplay = `${data?.poolPrizeUsd ?? 100} USDT`;
  const poolRemainingDisplay = `${Math.max(0, data?.poolRemainingUsd ?? 100).toFixed(0)} USDT`;
  const totalWinners = data?.totalWinners ?? 0;

  return (
    <div ref={outerRef} style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#050505", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        {isMp || isMobileViewport ? (
          <MiniPayImage
            src="/new-assets/landing-hero.webp"
            alt=""
            minipayWidth={960}
            minipayQuality={48}
            priority
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.14 }}
          />
        ) : (
          <video autoPlay loop muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.10 }}>
            <source src="/new-assets/lobby-vs-scene.webm" type="video/webm" />
          </video>
        )}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 38%, rgba(86,164,203,0.05) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(5,5,5,0.72) 0%, rgba(5,5,5,0.46) 40%, rgba(5,5,5,0.88) 100%)" }} />
      </div>

      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left", zIndex: 1, transform: "var(--ao-tr)" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <button onClick={() => router.back()} className="ko-btn ko-btn-secondary" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px" }}>
              <span className="material-icons ko-btn-icon" style={{ fontSize: 16, color: "rgba(255,255,255,0.9)" }}>arrow_back_ios</span>
              <span className="ko-btn-text" style={{ fontSize: 13, letterSpacing: 1.5, fontWeight: 700, color: "rgba(255,255,255,0.9)", textTransform: "uppercase" }}>Back</span>
            </button>
            <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
              <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
              <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase" }}>ACTION ORDER</span>
            </button>
          </div>

          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, padding: "6px 18px", border: "1px solid rgba(251,204,92,0.3)", borderRadius: 4, background: "rgba(251,204,92,0.07)" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", boxShadow: "0 0 8px #f59e0b", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#f59e0b", textTransform: "uppercase" }}>HOUSE BOSS EVENT · LIVE</span>
          </div>

          <WalletSection />
        </div>

        <div style={{ position: "absolute", top: 84, left: 0, right: 0, height: 252, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 4, color: "#56a4cb", textTransform: "uppercase" }}>SEASON 2 · RISE OF THE AGENTS</div>
          <div style={{ fontSize: 68, fontWeight: 900, letterSpacing: "-3px", color: "white", textTransform: "uppercase", textAlign: "center", lineHeight: 1, textShadow: "0 0 40px rgba(251,204,92,0.25)" }}>
            HOUSE BOSS CHALLENGE
          </div>
          <div style={{ fontSize: 15, color: "#9ca3af", letterSpacing: 0.5, textAlign: "center", maxWidth: 640, lineHeight: 1.6 }}>
            Beat our House AI through the full 5/5 Upper Chamber streak. Clear the final mirror fight, get your verified winner code, and claim from the {poolPrizeDisplay} pool prize.
          </div>

          <div style={{ display: "flex", gap: 40, marginTop: 6, alignItems: "flex-start" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: "#6b7280", textTransform: "uppercase" }}>POOL PRIZE</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: "#4ade80", letterSpacing: -1, marginTop: 2, textShadow: "0 0 20px rgba(74,222,128,0.4)" }}>
                {poolPrizeDisplay}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: "#6b7280", textTransform: "uppercase" }}>POOL LEFT</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#f59e0b", letterSpacing: -1, marginTop: 2 }}>
                {poolRemainingDisplay}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: "#6b7280", textTransform: "uppercase" }}>VERIFIED WINNERS</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#b9e7f4", letterSpacing: -1, marginTop: 2 }}>
                {totalWinners}
              </div>
            </div>
            {address && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: "#6b7280", textTransform: "uppercase" }}>CLAIM CHANNEL</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#fbbf24", letterSpacing: 0.4, marginTop: 6 }}>
                  BOUNTY CORNER
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ position: "absolute", top: 350, left: 64, right: 52, bottom: 24, display: "flex", gap: 20, alignItems: "flex-start", overflowY: "auto", overflowX: "hidden", paddingRight: 12 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(86,164,203,0.15)", borderRadius: 8, overflow: "hidden", maxHeight: 480, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(86,164,203,0.1)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#6b7280", textTransform: "uppercase" }}>RECENT VERIFIED WINNERS</div>
                <div style={{ fontSize: 10, color: "#475569", letterSpacing: 1 }}>TELEMETRY VERIFIED</div>
              </div>

              <div style={{ overflowY: "auto", flex: 1 }}>
                {loading ? (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {[...Array(5)].map((_, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.05)", animation: "pulse 1.5s infinite" }} />
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ width: "40%", height: 12, background: "rgba(255,255,255,0.06)", borderRadius: 4, animation: "pulse 1.5s infinite" }} />
                          <div style={{ width: "25%", height: 8, background: "rgba(255,255,255,0.04)", borderRadius: 4, animation: "pulse 1.5s infinite" }} />
                        </div>
                        <div style={{ width: 40, height: 16, background: "rgba(255,255,255,0.05)", borderRadius: 4, animation: "pulse 1.5s infinite" }} />
                      </div>
                    ))}
                  </div>
                ) : !data || data.recentWinners.length === 0 ? (
                  <div style={{ padding: "34px 20px", textAlign: "center", color: "#334155", fontSize: 12 }}>
                    No verified 5/5 House winners yet. Be the first to clear the final mirror fight.
                  </div>
                ) : (
                  <div>
                    {data.recentWinners.map((winner, index) => (
                      <div key={`${winner.playerAddress}-${winner.rewardCode}`} style={{
                        display: "flex", alignItems: "center", gap: 14, padding: "13px 20px",
                        background: index === 0 ? "rgba(251,204,92,0.04)" : "transparent",
                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                      }}>
                        <div style={{ width: 28, textAlign: "center", fontSize: index === 0 ? 18 : 13, fontWeight: 900, color: index === 0 ? "#f59e0b" : "#475569", flexShrink: 0 }}>
                          {index === 0 ? "👑" : `#${winner.rank}`}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {winner.playerName || fallbackName(winner.playerAddress, isMp)}
                          </div>
                          <div style={{ fontSize: 10, color: "#475569", marginTop: 1, fontFamily: "monospace" }}>
                            {winner.rewardCode}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 16, alignItems: "center", flexShrink: 0 }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: "#4ade80" }}>${winner.rewardUsd.toFixed(0)}</div>
                            <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1 }}>REWARD</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#b9e7f4" }}>
                              {new Date(winner.verifiedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </div>
                            <div style={{ fontSize: 9, color: "#475569" }}>VERIFIED</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#6b7280", textTransform: "uppercase", marginBottom: 14 }}>HOW IT WORKS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                {challengeSteps.map((item) => (
                  <div key={item.step} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${item.color}28`, borderRadius: 8, padding: "16px 14px", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: -6, right: 10, fontSize: 48, fontWeight: 900, color: `${item.color}0d`, letterSpacing: -2, lineHeight: 1, userSelect: "none" }}>{item.step}</div>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{item.icon}</div>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: item.color, textTransform: "uppercase", marginBottom: 4 }}>{item.step} · {item.title}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>{item.body}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ width: 340, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(86,164,203,0.18)", borderRadius: 8, padding: "16px 18px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#6b7280", textTransform: "uppercase", marginBottom: 10 }}>EVENT RULE</div>
              <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.65 }}>
                This is not a ranked leaderboard race. The prize is for players who beat the full House 5/5 streak and get a verified winner code from the final match.
              </div>
            </div>

            <div style={{ background: "rgba(251,204,92,0.05)", border: "1px solid rgba(251,204,92,0.24)", borderRadius: 8, padding: "16px 18px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#6b7280", textTransform: "uppercase", marginBottom: 10 }}>CLAIM FLOW</div>
              <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.65 }}>
                Win the final mirror fight, copy the code from the House Winner modal, then post it in <span style={{ color: "#fbbf24", fontWeight: 700 }}>Bounty Corner</span> at <span style={{ color: "#b9e7f4", fontWeight: 700 }}>t.me/actionorder</span>.
              </div>
            </div>

            <button
              onClick={playVsHouse}
              style={{ width: "100%", height: 52, background: "linear-gradient(135deg, #1a3a52, #0f2233)", border: "1.5px solid #56a4cb", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 15, letterSpacing: 2.5, color: "#b9e7f4", textTransform: "uppercase", clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)", boxShadow: "0 0 20px rgba(86,164,203,0.2)" }}
            >
              PLAY VS HOUSE ▸
            </button>
            <button
              onClick={() => window.open("https://t.me/actionorder", "_blank", "noopener,noreferrer")}
              style={{ width: "100%", height: 44, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13, letterSpacing: 2, color: "#6b7280", textTransform: "uppercase" }}
            >
              OPEN BOUNTY CORNER
            </button>
          </div>
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
