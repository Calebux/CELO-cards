"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { WalletSection } from "../components/WalletSection";
import { GDOLLAR_COLOR } from "../lib/gooddollar";

const DESIGN_W = 1440;
const DESIGN_H = 823;

type Challenge = {
  id: string;
  title: string;
  description: string;
  rewardPoints: number;
  rewardGDollar: string;
  icon: string;
  color: string;
  progress: number;
  goal: number;
  isClaimed: boolean;
  eligible: boolean;
};

export default function ChallengesPage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { address } = useAccount();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimedMsg, setClaimedMsg] = useState<Record<string, string>>({});

  useEffect(() => {
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
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, []);

  const fetchChallenges = () => {
    const url = address ? `/api/challenges?address=${address}` : "/api/challenges";
    fetch(url)
      .then((r) => r.json())
      .then((d: { challenges: Challenge[] }) => setChallenges(d.challenges ?? []))
      .catch(() => {});
  };

  useEffect(() => { fetchChallenges(); }, [address]);

  const handleClaim = async (challengeId: string) => {
    if (!address || claimingId) return;
    setClaimingId(challengeId);
    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, challengeId }),
      });
      const data = await res.json() as { ok?: boolean; pointsAwarded?: number; gdollarReward?: string; error?: string };
      if (data.ok) {
        setClaimedMsg((prev) => ({
          ...prev,
          [challengeId]: `+${data.pointsAwarded} pts · ${data.gdollarReward} G$ credited`,
        }));
        fetchChallenges();
      }
    } catch {
      // ignore
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#050505", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left" }}>

        {/* Background */}
        <img src="/new addition/gameplay landing page.webp" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.25, pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(5,5,5,0.92) 0%, rgba(5,8,18,0.85) 100%)", pointerEvents: "none" }} />

        {/* Top bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
            <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase" }}>ACTION ORDER</span>
          </button>

          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, padding: "5px 16px", border: "1px solid rgba(0,197,142,0.3)", borderRadius: 4, background: "rgba(0,197,142,0.07)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: GDOLLAR_COLOR, textTransform: "uppercase" }}>DAILY CHALLENGES</span>
          </div>

          <WalletSection />
        </div>

        {/* Content */}
        <div style={{ position: "absolute", top: 68, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 32 }}>

          {/* Header */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 4, color: GDOLLAR_COLOR, textTransform: "uppercase", marginBottom: 10 }}>
              RESETS AT MIDNIGHT UTC
            </div>
            <h1 style={{ fontSize: 48, fontWeight: 900, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: -2, margin: 0, lineHeight: 1 }}>
              DAILY CHALLENGES
            </h1>
            <p style={{ fontSize: 14, color: "#6b7280", marginTop: 10, maxWidth: 500 }}>
              Complete challenges to earn Points and G$ rewards. All rewards credited instantly.
            </p>
          </div>

          {/* Challenge cards */}
          <div style={{ display: "flex", gap: 24 }}>
            {challenges.length === 0 && (
              <div style={{ color: "#475569", fontSize: 14 }}>Loading challenges…</div>
            )}
            {challenges.map((c) => (
              <div
                key={c.id}
                style={{
                  width: 360,
                  background: c.isClaimed ? "rgba(74,222,128,0.04)" : "rgba(10,15,28,0.85)",
                  border: `1.5px solid ${c.isClaimed ? "rgba(74,222,128,0.3)" : c.eligible ? c.color : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 12,
                  padding: "28px 28px 24px",
                  backdropFilter: "blur(12px)",
                  boxShadow: c.eligible ? `0 0 24px ${c.color}20` : "none",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Top accent line */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${c.isClaimed ? "#4ade80" : c.color}, transparent)` }} />

                <div style={{ fontSize: 32, marginBottom: 12 }}>{c.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: c.isClaimed ? "#4ade80" : c.color, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>
                  {c.isClaimed ? "✓ CLAIMED" : c.eligible ? "READY TO CLAIM" : "IN PROGRESS"}
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#f1f5f9", letterSpacing: -0.5, marginBottom: 8 }}>{c.title}</div>
                <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6, margin: "0 0 20px" }}>{c.description}</p>

                {/* Progress bar */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Progress</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: c.progress >= c.goal ? "#4ade80" : "#b9e7f4" }}>
                      {c.progress} / {c.goal}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.min(100, (c.progress / c.goal) * 100)}%`,
                      background: c.isClaimed ? "#4ade80" : c.color,
                      borderRadius: 3,
                      transition: "width 0.4s ease",
                      boxShadow: c.progress >= c.goal ? `0 0 8px ${c.isClaimed ? "#4ade80" : c.color}` : "none",
                    }} />
                  </div>
                </div>

                {/* Rewards */}
                <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                  <div style={{ flex: 1, padding: "10px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Points</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#56a4cb" }}>+{c.rewardPoints}</div>
                  </div>
                  <div style={{ flex: 1, padding: "10px 12px", background: "rgba(0,197,142,0.06)", borderRadius: 6, border: "1px solid rgba(0,197,142,0.15)", textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>G$ Reward</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: GDOLLAR_COLOR }}>+{c.rewardGDollar}</div>
                  </div>
                </div>

                {/* Claim success message */}
                {claimedMsg[c.id] && (
                  <div style={{ fontSize: 11, color: "#4ade80", fontWeight: 700, marginBottom: 8, textAlign: "center" }}>
                    ✓ {claimedMsg[c.id]}
                  </div>
                )}

                {/* Claim button */}
                <button
                  onClick={() => handleClaim(c.id)}
                  disabled={!address || !c.eligible || c.isClaimed || claimingId === c.id}
                  style={{
                    width: "100%", height: 48,
                    background: c.isClaimed
                      ? "rgba(74,222,128,0.08)"
                      : c.eligible
                      ? `linear-gradient(135deg, ${c.color}30, ${c.color}18)`
                      : "rgba(255,255,255,0.04)",
                    border: `1.5px solid ${c.isClaimed ? "rgba(74,222,128,0.3)" : c.eligible ? c.color : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 8,
                    cursor: c.eligible && !c.isClaimed && address ? "pointer" : "default",
                    fontFamily: "inherit", fontWeight: 800, fontSize: 13, letterSpacing: 2,
                    color: c.isClaimed ? "#4ade80" : c.eligible ? "#f1f5f9" : "#475569",
                    textTransform: "uppercase",
                    opacity: !address && !c.isClaimed ? 0.6 : 1,
                    transition: "all 0.2s ease",
                  }}
                >
                  {claimingId === c.id
                    ? "Claiming…"
                    : c.isClaimed
                    ? "✓ Claimed"
                    : c.eligible
                    ? "Claim Reward"
                    : !address
                    ? "Connect Wallet"
                    : "Not Yet Complete"}
                </button>
              </div>
            ))}
          </div>

          {/* Note */}
          <p style={{ fontSize: 11, color: "#334155", letterSpacing: 1, textTransform: "uppercase" }}>
            G$ rewards added to your wallet · Points boost your leaderboard rank
          </p>
        </div>
      </div>
    </div>
  );
}
