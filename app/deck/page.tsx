"use client";

import { useEffect, useRef, useState } from "react";

const BG_IMAGE = "https://www.figma.com/api/mcp/asset/60f4534e-dfd0-4160-983f-4af922ac1fcd";
const LOGO = "https://www.figma.com/api/mcp/asset/dbd2f1d0-de97-437b-97ac-4a5426213f9e";

// Card images
const S1 = "https://www.figma.com/api/mcp/asset/3025b152-3912-4e26-83b4-7314219322f0";
const S2 = "https://www.figma.com/api/mcp/asset/d818ab89-0996-4828-89be-45c53cccd5e6";
const S3 = "https://www.figma.com/api/mcp/asset/a86384bc-25b2-4878-961a-736ed32176f9";
const S4 = "https://www.figma.com/api/mcp/asset/b91e5913-ea5d-4144-a356-5c4aee146cf0";
const S5 = "https://www.figma.com/api/mcp/asset/88a11935-c709-4cc0-a2e7-cd472c6dc8cd";
const CTRL1 = "https://www.figma.com/api/mcp/asset/951456fa-c9dd-454e-88fe-2559e7f10102";
const CTRL2 = "https://www.figma.com/api/mcp/asset/d206dace-36c2-477a-81cd-eabd210e5de6";
const CTRL3 = "https://www.figma.com/api/mcp/asset/b0250ee3-a56c-488b-adcd-c59e00be9801";
const CTRL4 = "https://www.figma.com/api/mcp/asset/105fc89e-7c7a-4ad5-9160-bdaf9de82984";
const D1 = "https://www.figma.com/api/mcp/asset/3b1e737b-9d77-45d6-bfb3-82b520b44aa2";
const D2 = "https://www.figma.com/api/mcp/asset/18135017-4212-4c9f-8ba1-2a9e368ff72a";
const D3 = "https://www.figma.com/api/mcp/asset/c981a515-cd30-4778-be71-bce19aac7fef";


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
                <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: -3, width: 200, height: 114 }}>
                    <img src={LOGO} alt="Action Order" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
