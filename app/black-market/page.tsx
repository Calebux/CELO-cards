"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "../lib/gameStore";
import { WalletSection } from "../components/WalletSection";
import { CARDS } from "../lib/gameData";

const DESIGN_W = 1440;
const DESIGN_H = 823;

export default function BlackMarket() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { playerPoints, unlockedPremiumCards, purchaseCard } = useGameStore();
  const [buyingId, setBuyingId] = useState<string | null>(null);

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

  const handleBuy = (id: string, price: number) => {
    if (playerPoints < price) return;
    setBuyingId(id);
    setTimeout(() => {
      purchaseCard(id, price);
      setBuyingId(null);
    }, 600);
  };

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

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "rgba(10,10,10,0.6)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)" }}>
              <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 700, letterSpacing: 1 }}>PTS</span>
              <span style={{ fontSize: 16, color: "#4ade80", fontWeight: 900 }}>{playerPoints.toLocaleString()}</span>
            </div>
            <WalletSection />
          </div>
        </div>

        {/* Content */}
        <div style={{ position: "absolute", top: 68, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: 40, gap: 40 }}>

          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 56, fontWeight: 900, color: "#ef4444", textTransform: "uppercase", letterSpacing: -2, margin: 0, lineHeight: 1, textShadow: "0 0 40px rgba(239,68,68,0.4)" }}>
              BLACK MARKET
            </h1>
            <p style={{ fontSize: 14, color: "#9ca3af", marginTop: 12, maxWidth: 600, marginInline: "auto" }}>
              Spend your hard-earned points to unlock rare, devastating cards. Once unlocked, these cards can appear randomly when drawing your deck.
            </p>
          </div>

          {/* Cards Grid */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 24, maxWidth: 1200, padding: "0 20px", overflowY: "auto", paddingBottom: 60 }}>
            {marketCards.map((c) => {
              const isOwned = unlockedPremiumCards.includes(c.id);
              const price = c.price ?? 999;
              const canAfford = playerPoints >= price;
              const isBuying = buyingId === c.id;

              return (
                <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                  <div style={{
                    width: 170, height: 236, borderRadius: 10, position: "relative", overflow: "hidden",
                    border: `2px solid ${c.color}`, boxShadow: isOwned ? `0 0 20px ${c.color}40` : "none",
                    opacity: isOwned ? 1 : 0.8,
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
                      onClick={() => handleBuy(c.id, price)}
                      disabled={!canAfford || isBuying}
                      style={{
                        width: "100%", padding: "10px",
                        background: canAfford ? `linear-gradient(135deg, ${c.color}30, ${c.color}10)` : "rgba(255,255,255,0.05)",
                        border: `1px solid ${canAfford ? c.color : "rgba(255,255,255,0.1)"}`,
                        borderRadius: 6,
                        color: canAfford ? "white" : "#6b7280",
                        fontSize: 11, fontWeight: 800,
                        cursor: canAfford && !isBuying ? "pointer" : "default",
                        letterSpacing: 1,
                        transition: "all 0.2s ease",
                      }}
                    >
                      {isBuying ? "BUYING..." : `${price} PTS`}
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
