"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useGameStore } from "../lib/gameStore";

const DESIGN_W = 1440;
const DESIGN_H = 823;

export function TutorialModal() {
  const { address } = useAccount();
  const hasSeenTutorial = useGameStore((s) => s.hasSeenTutorial);
  const setHasSeenTutorial = useGameStore((s) => s.setHasSeenTutorial);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [show, setShow] = useState(false);
  const [slide, setSlide] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && address && !hasSeenTutorial) {
      setShow(true);
    } else {
      setShow(false);
    }
  }, [mounted, address, hasSeenTutorial]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !show) return;
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
  }, [show]);

  if (!show || !mounted) return null;

  const slides = [
    {
      title: "THE ARENA",
      icon: "swords",
      content: "Draft 5 cards in order. The highest total Knock wins the round. First to win 3 rounds takes the match.",
      color: "#f87171"
    },
    {
      title: "ELEMENTS & SYNERGY",
      icon: "water_drop",
      content: "Rock-paper-scissors mechanics. Use cards that counter your opponent's element. Matching your character's class gives a bonus.",
      color: "#60a5fa"
    },
    {
      title: "ENERGY & ULTIMATES",
      icon: "bolt",
      content: "Manage your energy budget. Build up your gauge to unleash powerful, rule-breaking Ultimate abilities.",
      color: "#fbbf24"
    }
  ];

  const currentSlide = slides[slide];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400,
      backgroundColor: "rgba(5,5,16,0.92)",
      backdropFilter: "blur(12px)",
      overflow: "hidden",
    }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          position: "relative", width: 500,
          background: "rgba(12,18,36,0.97)",
          border: `2px solid ${currentSlide.color}50`,
          borderRadius: 12,
          padding: "50px 40px 40px",
          boxShadow: `0 0 80px ${currentSlide.color}30`,
          fontFamily: "var(--font-space-grotesk), sans-serif",
          transition: "all 0.4s ease",
          textAlign: "center"
        }}>
          {/* Scanline */}
          <div style={{ position: "absolute", top: -1, left: -1, right: -1, height: 2, background: `linear-gradient(90deg, transparent, ${currentSlide.color}, transparent)`, transition: "background 0.4s ease" }} />

          {/* Dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: 8, position: "absolute", top: 20, left: 0, right: 0 }}>
            {slides.map((_, i) => (
              <div key={i} style={{
                width: 8, height: 8, borderRadius: "50%",
                background: i === slide ? currentSlide.color : "rgba(255,255,255,0.2)",
                transition: "all 0.3s ease",
                boxShadow: i === slide ? `0 0 10px ${currentSlide.color}` : "none"
              }} />
            ))}
          </div>

          <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <span className="material-icons" style={{ fontSize: 56, color: currentSlide.color, transition: "color 0.4s ease" }}>
              {currentSlide.icon}
            </span>
          </div>

          <h2 style={{ fontSize: 28, fontWeight: 900, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 16px" }}>
            {currentSlide.title}
          </h2>

          <p style={{ fontSize: 16, color: "#9ca3af", margin: "0 0 36px", lineHeight: 1.6 }}>
            {currentSlide.content}
          </p>

          <div style={{ display: "flex", gap: 16 }}>
            {slide > 0 && (
              <button
                onClick={() => setSlide(s => s - 1)}
                style={{
                  flex: 1, padding: "14px 0",
                  background: "transparent",
                  border: "1.5px solid rgba(255,255,255,0.1)",
                  borderRadius: 6, cursor: "pointer",
                  color: "#f1f5f9", fontSize: 14, fontWeight: 800, textTransform: "uppercase",
                  letterSpacing: 2, fontFamily: "inherit"
                }}
              >
                Back
              </button>
            )}
            
            <button
              onClick={() => {
                if (slide < slides.length - 1) {
                  setSlide(s => s + 1);
                } else {
                  setHasSeenTutorial(true);
                  setShow(false);
                }
              }}
              style={{
                flex: slide > 0 ? 2 : 1, padding: "14px 0",
                background: `linear-gradient(135deg, ${currentSlide.color}40, ${currentSlide.color}10)`,
                border: `1.5px solid ${currentSlide.color}`,
                borderRadius: 6, cursor: "pointer",
                color: "#fff", fontSize: 14, fontWeight: 800, textTransform: "uppercase",
                letterSpacing: 2, fontFamily: "inherit",
                transition: "all 0.3s ease",
                boxShadow: `0 0 20px ${currentSlide.color}20`
              }}
            >
              {slide < slides.length - 1 ? "Next" : "Let's Battle"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
