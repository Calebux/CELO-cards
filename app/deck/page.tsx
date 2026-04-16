"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WalletSection } from "../components/WalletSection";

const BG_IMAGE = "/new addition/gameplay landing page.webp";

// Card images — local assets
const S1 = "/cards/phantom_break.webp";
const S2 = "/cards/storm_kick.webp";
const S3 = "/cards/power_punch.webp";
const S4 = "/cards/direct_impact.webp";
const S5 = "/cards/finisher.webp";
const CTRL1 = "/cards/mind_game.webp";
const CTRL2 = "/cards/evasion.webp";
const CTRL3 = "/cards/pressure_advance.webp";
const CTRL4 = "/cards/disrupt.webp";
const D1 = "/cards/guard_stance.webp";
const D2 = "/cards/stability.webp";
const D3 = "/cards/reversal_edge.webp";


const DESIGN_W = 1440;
const DESIGN_H = 823;

type Tab = "STRIKE" | "CONTROL" | "DEFENSE";

const STRIKE_CARDS = [S1, S2, S3, S4, S5];
const CONTROL_CARDS = [CTRL1, CTRL2, CTRL3, CTRL4];
const DEFENSE_CARDS = [D1, D2, D3];

export default function DeckPage() {
    const wrapRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Tab>("STRIKE");

    useEffect(() => {
        const scale = () => {
            if (!wrapRef.current) return;
            const s = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
            wrapRef.current.style.transform = `scale(${s})`;
        };
        scale();
        window.addEventListener("resize", scale);
        return () => window.removeEventListener("resize", scale);
    }, []);

    const cards = activeTab === "STRIKE" ? STRIKE_CARDS
        : activeTab === "CONTROL" ? CONTROL_CARDS
            : DEFENSE_CARDS;

    return (
        <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
            <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, transformOrigin: "top left", position: "relative" }}>
                {/* BG */}
                <img src={BG_IMAGE} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />

                {/* ── Top Bar ── */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
                  <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
                    <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
                    <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase" }}>ACTION ORDER</span>
                  </button>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#9ca3af", textTransform: "uppercase" }}>CARD GALLERY</div>
                  <WalletSection />
                </div>

                {/* Tabs */}
                <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 88, display: "flex", gap: "12px" }}>
                    {(["STRIKE", "CONTROL", "DEFENSE"] as Tab[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`ko-btn transition-all ${activeTab === tab ? "ko-btn-secondary active" : "ko-btn-secondary"}`}
                            style={{ padding: "10px 24px", minWidth: 160 }}
                        >
                            <span className="ko-btn-text" style={{
                                fontSize: "12px", fontWeight: 700, letterSpacing: "2px",
                                color: activeTab === tab ? "#06a8f9" : "rgba(255,255,255,0.7)",
                                textTransform: "uppercase",
                            }}>
                                {tab}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Card grid */}
                <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 148, display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", maxWidth: 800 }}>
                    {cards.map((img, i) => (
                        <div key={i} style={{ width: 130, height: 180, borderRadius: 6, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", position: "relative" }}>
                            <img src={img} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
