"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGameStore } from "../lib/gameStore";

const BG_IMAGE = "/new addition/gameplay landing page.webp";

const DESIGN_W = 1440;
const DESIGN_H = 823;

function JoinMatchContent() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const resetMatch = useGameStore((s) => s.resetMatch);
  const setMatchId = useGameStore((s) => s.setMatchId);
  const setPlayerRole = useGameStore((s) => s.setPlayerRole);

  const searchParams = useSearchParams();
  const [code, setCode] = useState(() => searchParams.get("id") ?? "");
  const [error, setError] = useState("");
  const [joining] = useState(false);

  useEffect(() => {
    const scale = () => {
      if (!wrapRef.current) return;
      const w = document.body.clientWidth;
      const h = document.body.clientHeight;
      const s = Math.min(w / DESIGN_W, h / DESIGN_H);
      wrapRef.current.style.transform = `scale(${s})`;
    };
    scale();
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, []);

  const handleJoin = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Paste a match link or code first.");
      return;
    }

    let matchCode = trimmed;
    try {
      const url = new URL(trimmed);
      const id = url.searchParams.get("id");
      if (id) matchCode = id;
    } catch {
      // not a URL — treat as bare code
    }

    if (!matchCode) {
      setError("Invalid match link.");
      return;
    }

    resetMatch();
    setMatchId(matchCode);
    setPlayerRole("joiner");
    router.push("/select-character");
  };

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, transformOrigin: "top left", position: "relative" }}>

        {/* Background */}
        <img src={BG_IMAGE} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />

        {/* Logo */}
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: -13, width: 350, height: 200, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 30, lineHeight: "1.1", letterSpacing: "-1px", color: "#b9e7f4", textAlign: "center", textShadow: "0 0 24px rgba(185,231,244,0.5)", textTransform: "uppercase" }}>ACTION<br/>ORDER</div>
        </div>

        {/* Cartridge Identity badge */}
        <div style={{
          position: "absolute", right: 50, top: 58,
          display: "flex", alignItems: "center",
          backgroundColor: "#b9e7f4", border: "1px solid #222f42",
          borderRadius: 8, padding: 9, backdropFilter: "blur(6px)", zIndex: 10,
        }}>
          <div style={{ textAlign: "right", marginRight: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#000", lineHeight: "10px" }}>
              Cartridge Identity
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#000", lineHeight: "20px" }}>
              Guest
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <div style={{ width: 40, height: 40, borderRadius: 4, border: "2px solid #222f42", overflow: "hidden", backgroundColor: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="material-icons" style={{ color: "#94a3b8", fontSize: 22 }}>person</span>
            </div>
            <div style={{ position: "absolute", bottom: -4, right: -4, width: 12, height: 12, borderRadius: "50%", backgroundColor: "#6b7280", border: "2px solid #0a060e" }} />
          </div>
        </div>

        {/* Central panel */}
        <div style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%, -50%)",
          marginTop: 54, width: 504,
        }}>
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
            backgroundColor: "rgba(15, 23, 42, 0.4)",
            border: "2.4px solid #b9e7f4", borderRadius: 6,
            backdropFilter: "blur(4.5px)", padding: "48px 48px 40px",
            position: "relative", overflow: "hidden",
            boxShadow: "0 0 20px rgba(185, 231, 244, 0.25)",
          }}>
            {/* Scanline */}
            <div style={{ position: "absolute", top: -2, left: -2, right: -2, height: 1.5, backgroundColor: "#56a4cb" }} />

            {/* Heading */}
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <h2 style={{ fontSize: 30, fontWeight: 700, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: -0.75, margin: 0, lineHeight: "36px" }}>
                Join Match
              </h2>
              <p style={{ fontSize: 14, color: "#94a3b8", margin: "8px 0 0", lineHeight: "20px" }}>
                Paste the match link or code sent by your opponent
              </p>
            </div>

            {/* Input */}
            <div style={{ position: "relative", marginBottom: 12 }}>
              <div style={{
                backgroundColor: "rgba(17, 10, 24, 0.5)",
                border: `1px solid ${error ? "#ef4444" : "#334155"}`,
                borderRadius: 8, padding: "16px 20px",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <span className="material-icons" style={{ color: "#56a4cb", fontSize: 18 }}>link</span>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && void handleJoin()}
                  placeholder="https://…/join?id=AO-XXXX  or  AO-XXXX"
                  style={{
                    background: "none", border: "none", outline: "none",
                    color: "#fff", fontSize: 13, width: "100%",
                    fontFamily: "inherit", letterSpacing: 0.5,
                  }}
                />
              </div>
              {error && (
                <p style={{ fontSize: 11, color: "#ef4444", marginTop: 6, letterSpacing: 0.5 }}>{error}</p>
              )}
            </div>

            {/* Info hint */}
            <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 28, letterSpacing: 0.3 }}>
              Your opponent shares this from the Ready screen after creating a match.
            </p>

            {/* Join button */}
            <button
              onClick={() => void handleJoin()}
                disabled={joining}
              className="ko-btn ko-btn-primary"
              style={{ width: "100%", padding: "15px 0" }}
            >
              <span className="material-icons ko-btn-icon" style={{ fontSize: 18 }}>sports_kabaddi</span>
              <span className="ko-btn-text" style={{ fontSize: 15, fontWeight: 700, textTransform: "uppercase", letterSpacing: 6, color: "#fff" }}>
                Enter Arena
              </span>
              <span className="material-icons ko-btn-icon" style={{ fontSize: 18 }}>arrow_forward_ios</span>
            </button>

            {/* Divider + back */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 28 }}>
              <div style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
              <button
                onClick={() => router.push("/")}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit" }}
              >
                ← Back to Menu
              </button>
              <div style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8, backgroundColor: "#0f1c23",
                border: "1px solid #0f1c23", display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 15px rgba(140, 37, 244, 0.4), inset 0 0 5px rgba(140, 37, 244, 0.2)",
              }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: "#8c25f4", letterSpacing: "-0.5px" }}>KO</span>
              </div>
              <div style={{ marginLeft: 12 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: -1.2, lineHeight: "32px", textShadow: "0 0 8px rgba(140, 37, 244, 0.8)" }}>
                  Action Order
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1.2, lineHeight: "16px" }}>
                  PvP Matchmaking
                </div>
              </div>
            </div>
            <div style={{
              backgroundColor: "#0f1c23", border: "1px solid #0f1c23",
              borderRadius: 9999, padding: "7px 13px",
              display: "flex", alignItems: "center",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#4ade80", marginRight: 8 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#cbd5e1", lineHeight: "16px" }}>
                ACTION ORDER — CELO MAINNET
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}


export default function JoinMatch() {
  return (
    <Suspense>
      <JoinMatchContent />
    </Suspense>
  );
}
