"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "../lib/gameStore";
import { WalletSection } from "../components/WalletSection";
import { CARDS } from "../lib/gameData";
import {
  useWriteContract,
  useSendTransaction,
  useAccount,
} from "wagmi";
import { GDOLLAR_CONTRACT, GDOLLAR_ABI, GDOLLAR_COLOR } from "../lib/gooddollar";
import { parseUnits } from "viem";

const DESIGN_W = 1440;
const DESIGN_H = 823;

// Treasury wallet that receives Black Market payments
const TREASURY = "0xBa37dd0890AFc659a25331871319f66E7EBA3522" as `0x${string}`;

// Price: pts / 1000 = CELO (e.g. 2000pts→2 CELO, 10000pts→10 CELO)
function ptsToOnchain(pts: number) {
  return parseUnits((pts / 1000).toFixed(6), 18);
}
function ptsDisplay(pts: number, currency: "celo" | "gdollar") {
  const val = pts / 1000;
  const formatted = val % 1 === 0 ? val.toString() : val.toFixed(1);
  return currency === "gdollar" ? `${formatted} G$` : `${formatted} CELO`;
}

type BuyCurrency = "celo" | "gdollar";

export default function BlackMarket() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { address } = useAccount();

  const { unlockedPremiumCards } = useGameStore();
  const unlockCard = useGameStore((s) => s.purchaseCard);

  const [buyCurrency, setBuyCurrency] = useState<BuyCurrency>("celo");
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string>("");

  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const marketCards = CARDS.filter((c) => c.isPremium);

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

  const handleBuy = async (id: string, price: number) => {
    if (!address) { setBuyError("Connect your wallet first."); return; }
    setBuyingId(id);
    setBuyError("");
    const amt = ptsToOnchain(price);
    try {
      if (buyCurrency === "gdollar") {
        await writeContractAsync({
          address: GDOLLAR_CONTRACT,
          abi: GDOLLAR_ABI,
          functionName: "transfer",
          args: [TREASURY, amt],
        });
      } else {
        // CELO — native transfer
        await sendTransactionAsync({ to: TREASURY, value: amt });
      }
      // Unlock locally (store + localStorage). Pass 0 so points are untouched.
      unlockCard(id, 0);
    } catch (e) {
      setBuyError(e instanceof Error ? e.message.slice(0, 100) : "Transaction failed.");
    } finally {
      setBuyingId(null);
    }
  };

  const ACCENT = "#ef4444";

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#020202", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left" }}>

        {/* Background */}
        <img src="/new addition/gameplay landing page.webp" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.15, pointerEvents: "none", filter: "hue-rotate(-20deg) saturate(1.5)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(86,0,0,0.1) 0%, rgba(0,0,0,0.95) 100%)", pointerEvents: "none" }} />

        {/* Top bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(255,0,0,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,0,0,0.8)", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: 1, color: "#f87171", textTransform: "uppercase" }}>BACK</span>
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #ef4444, #f87171)", borderRadius: 2 }} />
              <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#f87171", textTransform: "uppercase", opacity: 0.8 }}>ACTION ORDER</span>
            </div>
          </div>

          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, padding: "5px 16px", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, background: "rgba(239,68,68,0.1)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#fca5a5", textTransform: "uppercase" }}>BLACK MARKET</span>
          </div>

          <WalletSection />
        </div>

        {/* Content */}
        <div style={{ position: "absolute", top: 68, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: 32, gap: 28 }}>

          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 52, fontWeight: 900, color: ACCENT, textTransform: "uppercase", letterSpacing: -2, margin: 0, lineHeight: 1, textShadow: "0 0 40px rgba(239,68,68,0.4)" }}>
              BLACK MARKET
            </h1>
            <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 10, maxWidth: 560, marginInline: "auto" }}>
              Acquire rare, devastating cards with CELO or G$. Once unlocked they appear randomly in your deck.
            </p>
          </div>

          {/* Currency selector */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#6b7280", textTransform: "uppercase" }}>Pay with:</span>
            {([
              { key: "celo" as BuyCurrency,    label: "CELO",  color: "#f9c846" },
              { key: "gdollar" as BuyCurrency, label: "G$",    color: GDOLLAR_COLOR },
            ]).map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setBuyCurrency(key)}
                style={{
                  padding: "6px 18px",
                  background: buyCurrency === key ? `${color}20` : "rgba(255,255,255,0.04)",
                  border: `1.5px solid ${buyCurrency === key ? color : "#334155"}`,
                  borderRadius: 6, cursor: "pointer",
                  fontSize: 12, fontWeight: 800, color: buyCurrency === key ? color : "#6b7280",
                  letterSpacing: 1.5, textTransform: "uppercase",
                  fontFamily: "inherit", transition: "all 0.15s",
                  boxShadow: buyCurrency === key ? `0 0 12px ${color}30` : "none",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Error banner */}
          {buyError && (
            <div style={{ padding: "8px 20px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 6 }}>
              <span style={{ fontSize: 12, color: "#f87171" }}>{buyError}</span>
            </div>
          )}

          {/* Cards Grid */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 24, maxWidth: 1200, padding: "0 20px", overflowY: "auto", paddingBottom: 60 }}>
            {marketCards.map((c) => {
              const isOwned = unlockedPremiumCards.includes(c.id);
              const price = c.price ?? 3000;
              const isBuying = buyingId === c.id;
              const currColor = buyCurrency === "gdollar" ? GDOLLAR_COLOR : "#f9c846";

              return (
                <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                  <div style={{
                    width: 170, height: 236, borderRadius: 10, position: "relative", overflow: "hidden",
                    border: `2px solid ${c.color}`, boxShadow: isOwned ? `0 0 20px ${c.color}40` : "none",
                    opacity: isOwned ? 1 : 0.85,
                    transition: "transform 0.2s ease",
                    transform: isBuying ? "scale(1.05)" : "scale(1)",
                  }}>
                    <img src={c.image} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 40%, transparent 100%)" }} />

                    <div style={{ position: "absolute", bottom: 12, left: 12, right: 12, textAlign: "center" }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: c.color, letterSpacing: 1.5, textTransform: "uppercase" }}>{c.type}</div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "white", textTransform: "uppercase" }}>{c.name}</div>
                    </div>

                    <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.8)", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${c.color}` }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: c.color }}>{c.knock}</span>
                    </div>
                    <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.8)", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #94a3b8" }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#9ca3af" }}>{c.priority}</span>
                    </div>

                    {isOwned && (
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(74,222,128,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span className="material-icons" style={{ fontSize: 36, color: "#4ade80", opacity: 0.8 }}>check_circle</span>
                      </div>
                    )}
                  </div>

                  <div style={{ width: 170, textAlign: "center", fontSize: 10, color: "#9ca3af", lineHeight: 1.4, height: 44, overflow: "hidden" }}>
                    {c.effect}
                  </div>

                  {isOwned ? (
                    <button disabled style={{ width: "100%", padding: "10px", background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 6, color: "#4ade80", fontSize: 11, fontWeight: 800, cursor: "default", letterSpacing: 2 }}>
                      OWNED
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleBuy(c.id, price)}
                      disabled={isBuying || !address}
                      style={{
                        width: "100%", padding: "10px",
                        background: isBuying ? `${currColor}20` : `linear-gradient(135deg, ${currColor}28, ${currColor}10)`,
                        border: `1.5px solid ${isBuying ? currColor : c.color}`,
                        borderRadius: 6,
                        color: "white",
                        fontSize: 11, fontWeight: 800,
                        cursor: isBuying || !address ? "not-allowed" : "pointer",
                        letterSpacing: 1,
                        transition: "all 0.2s ease",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        opacity: !address ? 0.5 : 1,
                      }}
                    >
                      <span className="material-icons" style={{ fontSize: 13, color: isBuying ? currColor : c.color }}>
                        {isBuying ? "hourglass_empty" : buyCurrency === "gdollar" ? "stream" : "toll"}
                      </span>
                      {isBuying ? "BUYING…" : ptsDisplay(price, buyCurrency)}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
