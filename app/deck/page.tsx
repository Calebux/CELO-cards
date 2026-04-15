"use client";

import { useEffect, useRef, useState } from "react";

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

                {/* Logo */}
                <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: -3, width: 200, height: 114, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ fontWeight: 900, fontSize: 22, lineHeight: "1.1", letterSpacing: "-0.5px", color: "#b9e7f4", textAlign: "center", textShadow: "0 0 20px rgba(185,231,244,0.4)", textTransform: "uppercase" }}>ACTION<br/>ORDER</div>
                </div>

                {/* Tabs */}
                <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 120, display: "flex", gap: "12px" }}>
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
                <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 180, display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", maxWidth: 800 }}>
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
