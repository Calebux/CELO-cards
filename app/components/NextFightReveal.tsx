"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";

const STORIES: Record<string, string[]> = {
  "kaira-kenji": [
    "Kaira's speed couldn't outlast your patience.",
    "You read every feint. Every surge. Every tell.",
    "Kenji is next — a veteran built on counters and timing.",
    "Stay calm. His rhythm is the trap. Break it early.",
  ],
  "kenji-riven": [
    "Kenji's discipline met its match in you today.",
    "Every counter he threw only sharpened your eye.",
    "Riven moves in shadows — fast, erratic, relentless.",
    "Trust your instincts. Speed answers speed.",
  ],
  "riven-zane": [
    "Riven's chaos only tightened your focus.",
    "You found the pattern underneath the unpredictable.",
    "Zane hits harder than anyone in the chamber.",
    "One opening. That's all. Make it count.",
  ],
  "zane-elara": [
    "You absorbed Zane's power and stood firm.",
    "Strength met precision — and precision won.",
    "Elara is the final guardian. She does not fall easily.",
    "This is what you've been building toward. Finish it.",
  ],
};

const FALLBACK_LINES = [
  "Another opponent falls.",
  "Your read was sharper. Your will was stronger.",
  "The next fighter waits.",
  "Prove it again.",
];

const KEYFRAMES = `
@keyframes nfFadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

type Props = {
  defeatedId: string;
  nextName: string;
  onComplete: () => void;
};

export function NextFightReveal({ defeatedId, nextName, onComplete }: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    const raf = requestAnimationFrame(() => setVisible(true));
    timerRef.current = setTimeout(onComplete, 12000);
    return () => {
      cancelAnimationFrame(raf);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleComplete = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onComplete();
  };

  if (!mounted) return null;

  const nextId = nextName.toLowerCase();
  const key = `${defeatedId}-${nextId}`;
  const lines = STORIES[key] ?? FALLBACK_LINES;

  return createPortal(
    <>
      <style>{KEYFRAMES}</style>

      {/* Full-screen overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "rgba(2,6,23,0.93)",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.6s ease",
          overflow: "hidden",
        }}
      >
        {/* SKIP button — top-right, above portrait */}
        <button
          onClick={handleComplete}
          style={{
            position: "absolute",
            top: "max(20px, env(safe-area-inset-top, 0px))",
            right: 24,
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.22)",
            color: "rgba(255,255,255,0.7)",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.1em",
            padding: "6px 14px",
            borderRadius: 6,
            cursor: "pointer",
            zIndex: 2,
          }}
        >
          SKIP
        </button>

        {/* Story text — centred, works in portrait and landscape */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1,
          }}
        >
          <div
            style={{
              boxSizing: "border-box",
              width: "min(560px, 88vw)",
              display: "flex",
              flexDirection: "column",
              gap: "clamp(10px, 2.5vh, 18px)",
              padding: "0 clamp(24px, 6vw, 48px)",
            }}
          >
            {lines.map((line, i) => (
              <p
                key={i}
                style={{
                  margin: 0,
                  color: i === lines.length - 1 ? "#e2e8f0" : "rgba(185,231,244,0.75)",
                  fontSize: "clamp(16px, 4.5vw, 22px)",
                  lineHeight: 1.55,
                  fontWeight: i === lines.length - 1 ? 700 : 400,
                  fontStyle: i === lines.length - 1 ? "normal" : "italic",
                  opacity: 0,
                  animation: "nfFadeUp 0.5s ease forwards",
                  animationDelay: `${0.4 + i * 0.35}s`,
                  textShadow: "0 1px 6px rgba(0,0,0,0.8)",
                }}
              >
                {line}
              </p>
            ))}

            {/* "NEXT OPPONENT" eyebrow */}
            <p
              style={{
                margin: 0,
                marginTop: "clamp(12px, 2.5vh, 24px)",
                color: "#56a4cb",
                fontSize: "clamp(11px, 3vw, 13px)",
                fontWeight: 700,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: 0,
                animation: "nfFadeUp 0.5s ease forwards",
                animationDelay: `${0.4 + lines.length * 0.35}s`,
              }}
            >
              Next opponent
            </p>

            {/* Fighter name */}
            <p
              style={{
                margin: 0,
                color: "#ffffff",
                fontSize: "clamp(28px, 8vw, 48px)",
                fontWeight: 800,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                opacity: 0,
                animation: "nfFadeUp 0.5s ease forwards",
                animationDelay: `${0.55 + lines.length * 0.35}s`,
                textShadow: "0 0 24px rgba(86,164,203,0.45)",
              }}
            >
              {nextName}
            </p>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
