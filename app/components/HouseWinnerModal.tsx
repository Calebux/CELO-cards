"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { MiniPayImage } from "./MiniPayImage";
import { DESIGN_H, DESIGN_W } from "../lib/designConstants";

type Props = {
  rewardCode: string;
  rewardUsd: number;
  isMiniPay?: boolean;
  onClose: () => void;
};

const CONFETTI = Array.from({ length: 26 }, (_, i) => ({
  id: i,
  left: `${4 + ((i * 7) % 92)}%`,
  delay: `${(i % 7) * 0.18}s`,
  duration: `${3.2 + (i % 5) * 0.45}s`,
  color: ["#fbbf24", "#4ade80", "#56a4cb", "#fb7185"][i % 4],
  rotate: `${(i % 9) * 18}deg`,
}));

export function HouseWinnerModal({ rewardCode, rewardUsd, isMiniPay = false, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const copyCode = () => {
    void navigator.clipboard.writeText(rewardCode).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !mounted) return;
    const scale = () => {
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
      el.style.transform = transform;
    };
    scale();
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, [mounted]);

  const cardW = isMiniPay ? 220 : 188;
  const cardH = isMiniPay ? 324 : 280;

  if (!mounted) return null;

  return createPortal((
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(2, 6, 23, 0.86)",
        backdropFilter: "blur(10px)",
        overflow: "hidden",
      }}
    >
      <div
        ref={wrapRef}
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          position: "absolute",
          top: 0,
          left: 0,
          transformOrigin: "top left",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {CONFETTI.map((piece) => (
          <span
            key={piece.id}
            style={{
              position: "absolute",
              top: -20,
              left: piece.left,
              width: 10,
              height: 18,
              borderRadius: 3,
              background: piece.color,
              opacity: 0.9,
              transform: `rotate(${piece.rotate})`,
              animation: `house-confetti ${piece.duration} linear ${piece.delay} infinite`,
            }}
          />
        ))}

        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            width: isMiniPay ? 620 : 620,
            position: "relative",
            background: "rgba(10,15,28,0.97)",
            border: "2px solid rgba(251,191,36,0.34)",
            borderRadius: 12,
            padding: isMiniPay ? "34px 34px 28px" : "28px 30px 24px",
            boxShadow: "0 0 40px rgba(251,191,36,0.18), 0 20px 60px rgba(0,0,0,0.8)",
            fontFamily: "var(--font-space-grotesk), sans-serif",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, #fbbf24, #4ade80, #56a4cb)" }} />

          <button
            aria-label="Close house winner modal"
            onClick={onClose}
            style={{
              position: "absolute",
              top: 14,
              right: 16,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#64748b",
              fontSize: isMiniPay ? 26 : 18,
              lineHeight: 1,
              padding: isMiniPay ? 12 : 0,
            }}
          >
            ✕
          </button>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMiniPay ? "1fr" : `${cardW}px 1fr`,
              gap: isMiniPay ? 18 : 18,
              alignItems: isMiniPay ? "stretch" : "center",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div
                style={{
                  width: cardW,
                  height: cardH,
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "2px solid rgba(251,191,36,0.62)",
                  boxShadow: "0 0 28px rgba(251,191,36,0.22)",
                  position: "relative",
                  background: "linear-gradient(180deg, rgba(8,11,24,1), rgba(17,24,39,1))",
                }}
              >
                <MiniPayImage
                  src="/cards/finisher.webp"
                  alt="House Winner card"
                  minipayWidth={420}
                  minipayQuality={76}
                  style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6 }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 10,
                    right: 10,
                    bottom: 10,
                    borderRadius: 10,
                    padding: "10px 12px 9px",
                    background: "linear-gradient(180deg, rgba(5,8,18,0.12), rgba(5,8,18,0.96))",
                    border: "1px solid rgba(251,191,36,0.22)",
                    backdropFilter: "blur(6px)",
                  }}
                >
                  <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 2.1, color: "#fbbf24", textTransform: "uppercase", marginBottom: 4 }}>
                    Action Order
                  </div>
                  <div style={{ fontSize: isMiniPay ? 20 : 16, fontWeight: 900, color: "#fff", letterSpacing: -0.3, lineHeight: 1 }}>
                    House Winner
                  </div>
                  <div style={{ fontSize: 9, color: "#cbd5e1", marginTop: 4, letterSpacing: 1.2, textTransform: "uppercase" }}>
                    Final Mirror Cleared
                  </div>
                </div>
              </div>
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: isMiniPay ? 11 : 10, fontWeight: 800, letterSpacing: 3, color: "#fbbf24", textTransform: "uppercase", marginBottom: 8 }}>
                House Winner
              </div>
              <div style={{ fontSize: isMiniPay ? 34 : 28, fontWeight: 900, color: "#fff", letterSpacing: -0.8, marginBottom: 8, lineHeight: 1 }}>
                5 / 5 COMPLETE
              </div>
              <div style={{ fontSize: isMiniPay ? 15 : 13, lineHeight: 1.68, color: "#94a3b8", marginBottom: 16 }}>
                You cleared the full House streak. This run is worth <span style={{ color: "#4ade80", fontWeight: 800 }}>${rewardUsd}</span>. Copy your code and claim in <span style={{ color: "#fbbf24", fontWeight: 700 }}>Bounty Corner</span> inside the Action Order Telegram.
              </div>

              <div
                style={{
                  borderRadius: 10,
                  border: "1px solid rgba(86,164,203,0.24)",
                  background: "rgba(86,164,203,0.07)",
                  padding: isMiniPay ? "14px 16px" : "12px 14px",
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.1, color: "#56a4cb", textTransform: "uppercase", marginBottom: 8 }}>
                  Verification Code
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontSize: isMiniPay ? 24 : 20, fontWeight: 900, letterSpacing: 2, color: "#e2e8f0", fontFamily: "monospace", lineHeight: 1.1, minWidth: 0 }}>
                    {rewardCode}
                  </div>
                  <button
                    aria-label="Copy verification code"
                    onClick={copyCode}
                    style={{
                      width: isMiniPay ? 44 : 36,
                      height: isMiniPay ? 44 : 36,
                      flexShrink: 0,
                      borderRadius: 9,
                      border: "1.5px solid #56a4cb",
                      background: "linear-gradient(135deg, rgba(86,164,203,0.18), rgba(86,164,203,0.08))",
                      color: "#b9e7f4",
                      fontSize: isMiniPay ? 18 : 15,
                      cursor: "pointer",
                    }}
                    title={copied ? "Code copied" : "Copy code"}
                  >
                    {copied ? "✓" : "⧉"}
                  </button>
                </div>
                <div style={{ fontSize: isMiniPay ? 11 : 10, color: "#94a3b8", marginTop: 8, lineHeight: 1.55 }}>
                  Ops can verify this directly from House telemetry before paying the reward.
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <a
                  href="https://t.me/actionorder"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: isMiniPay ? 48 : 40,
                    padding: "0 14px",
                    borderRadius: 8,
                    border: "1.5px solid #4ade80",
                    background: "linear-gradient(135deg, rgba(74,222,128,0.2), rgba(74,222,128,0.08))",
                    color: "#4ade80",
                    fontFamily: "inherit",
                    fontSize: isMiniPay ? 12 : 11,
                    fontWeight: 900,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  Claim In Bounty Corner
                </a>
                <button
                  onClick={onClose}
                  style={{
                    width: "100%",
                    height: isMiniPay ? 48 : 40,
                    padding: "0 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(251,191,36,0.28)",
                    background: "rgba(255,255,255,0.03)",
                    color: "#fbbf24",
                    fontFamily: "inherit",
                    fontSize: isMiniPay ? 12 : 11,
                    fontWeight: 800,
                    letterSpacing: 1.3,
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>

          <style>{`
            @keyframes house-confetti {
              0% { transform: translateY(-18px) rotate(0deg); opacity: 0; }
              8% { opacity: 1; }
              100% { transform: translateY(120vh) rotate(540deg); opacity: 0; }
            }
          `}</style>
        </div>
      </div>
    </div>
  ), document.body);
}
