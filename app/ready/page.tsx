"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "../lib/gameStore";
import { WalletSection } from "../components/WalletSection";

const BG_IMAGE = "/new addition/gameplay landing page.webp";

const DESIGN_W = 1440;
const DESIGN_H = 823;

export default function ReadyYourDeck() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [linkShared, setLinkShared] = useState(false);
  const storeMatchId = useGameStore((s) => s.matchId);

  useEffect(() => {
    const scale = () => {
      if (!wrapRef.current) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const s = Math.min(w / DESIGN_W, h / DESIGN_H);
      const offsetX = (w - DESIGN_W * s) / 2;
      const offsetY = (h - DESIGN_H * s) / 2;
      wrapRef.current.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${s})`;
    };
    scale();
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, []);

  const matchId = storeMatchId ?? "AO-????-X";

  const handleCopyCode = () => {
    navigator.clipboard.writeText(matchId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleShareLink = () => {
    const link = `${window.location.origin}/join?id=${matchId}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: "Action Order", text: `Join my match! Code: ${matchId}`, url: link }).catch(() => {});
    } else {
      navigator.clipboard.writeText(link);
    }
    setLinkShared(true);
    setTimeout(() => setLinkShared(false), 2000);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#050505", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, transformOrigin: "top left", position: "relative" }}>

        {/* Background */}
        <img src={BG_IMAGE} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.3, pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(5,5,5,0.88) 0%, rgba(5,8,18,0.78) 50%, rgba(5,5,5,0.88) 100%)", pointerEvents: "none" }} />

        {/* ── Top Bar ── */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
            <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase" }}>ACTION ORDER</span>
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 16px", border: "1px solid rgba(86,164,203,0.2)", borderRadius: 4, background: "rgba(86,164,203,0.06)" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#9ca3af", textTransform: "uppercase" }}>MATCH READY</span>
          </div>

          <WalletSection />
        </div>

        {/* ── Central Panel ── */}
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -46%)", width: 504 }}>

          {/* Corner accents */}
          {[
            { top: -12, left: -12, borderLeft: "1.5px solid #56a4cb", borderTop: "1.5px solid #56a4cb" },
            { top: -12, right: -12, borderRight: "1.5px solid #56a4cb", borderTop: "1.5px solid #56a4cb" },
            { bottom: -12, left: -12, borderLeft: "1.5px solid #56a4cb", borderBottom: "1.5px solid #56a4cb" },
            { bottom: -12, right: -12, borderRight: "1.5px solid #56a4cb", borderBottom: "1.5px solid #56a4cb" },
          ].map((s, i) => (
            <div key={i} style={{ position: "absolute", width: 36, height: 36, ...s }} />
          ))}

          {/* Glass panel */}
          <div style={{ background: "rgba(10,15,28,0.85)", border: "1.5px solid rgba(86,164,203,0.35)", borderRadius: 8, backdropFilter: "blur(12px)", overflow: "hidden", boxShadow: "0 0 40px rgba(86,164,203,0.1)" }}>

            {/* Scanline */}
            <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #56a4cb, transparent)" }} />

            <div style={{ padding: "36px 40px 40px" }}>

              {/* Heading */}
              <div style={{ textAlign: "center", marginBottom: 32 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 4, color: "#56a4cb", textTransform: "uppercase", marginBottom: 8 }}>INVITE YOUR OPPONENT</div>
                <h2 style={{ fontSize: 30, fontWeight: 900, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: -1, margin: 0, lineHeight: 1 }}>
                  READY YOUR DECK
                </h2>
                <p style={{ fontSize: 13, color: "#6b7280", marginTop: 10, lineHeight: 1.6 }}>
                  Share your match code or link. Your opponent pastes it on the Join screen.
                </p>
              </div>

              {/* Match code display */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>MATCH CODE</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1, height: 52, background: "rgba(17,10,24,0.6)", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 22, fontWeight: 900, color: "#b9e7f4", letterSpacing: 3, fontVariantNumeric: "tabular-nums" }}>{matchId}</span>
                  </div>
                  <button
                    onClick={handleCopyCode}
                    style={{
                      width: 52, height: 52, flexShrink: 0,
                      background: copied ? "rgba(74,222,128,0.12)" : "rgba(86,164,203,0.1)",
                      border: `1px solid ${copied ? "rgba(74,222,128,0.4)" : "rgba(86,164,203,0.3)"}`,
                      borderRadius: 6, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.2s",
                    }}
                    title="Copy code"
                  >
                    <span className="material-icons" style={{ color: copied ? "#4ade80" : "#56a4cb", fontSize: 20 }}>
                      {copied ? "check" : "content_copy"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Share link button */}
              <button
                onClick={handleShareLink}
                className="ko-btn ko-btn-secondary"
                style={{ width: "100%", height: 48, marginBottom: 28 }}
              >
                <svg className="ko-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
                </svg>
                <span className="ko-btn-text" style={{ fontSize: 13, fontWeight: 700, color: "#b9e7f4", textTransform: "uppercase", letterSpacing: 2 }}>
                  {linkShared ? "Link Copied!" : "Share Match Link"}
                </span>
              </button>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: 2, textTransform: "uppercase" }}>OR</span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
              </div>

              {/* Solo play */}
              <button
                onClick={() => router.push("/select-character")}
                style={{
                  width: "100%", height: 52,
                  background: "linear-gradient(135deg, #1a3a52, #0f2233)",
                  border: "1.5px solid #56a4cb", borderRadius: 6,
                  cursor: "pointer", fontFamily: "inherit",
                  fontWeight: 900, fontSize: 15, letterSpacing: 2.5,
                  color: "#b9e7f4", textTransform: "uppercase",
                  clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)",
                  boxShadow: "0 0 20px rgba(86,164,203,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                }}
              >
                <span className="material-icons" style={{ fontSize: 20 }}>person</span>
                ENTER SOLO
                <span className="material-icons" style={{ fontSize: 18 }}>arrow_forward_ios</span>
              </button>

              {/* Waiting indicator */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 24 }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {[0, 0.3, 0.6].map((delay, i) => (
                    <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#56a4cb", animation: `waitPulse 1.2s ease-in-out ${delay}s infinite` }} />
                  ))}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: 2, textTransform: "uppercase" }}>
                  Waiting for opponent
                </span>
              </div>

            </div>
          </div>

          {/* Footer status */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: "#475569", letterSpacing: 1.5, textTransform: "uppercase" }}>ACTION ORDER — CELO MAINNET</span>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes waitPulse {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
