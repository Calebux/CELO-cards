"use client";

import { useEffect, useState } from "react";

// Critical assets to warm up before showing the home page.
// Portraits + hero images cover the first things the player sees.
// Card images are handled later by MatchLoadingScreen during the match wait.
const ASSETS = [
  "/new-assets/landing-hero.webp",
  "/new-assets/fighters-energy-sm.webp",
  "/characters/characters%20/Adobe%20Express%20-%20file%20(4).webp",
  "/characters/characters%20/Adobe%20Express%20-%20file%20(6).webp",
  "/characters/characters%20/zane_portrait.webp",
  "/Characters%20standing/Whisk_9a87489a13c392485344f4c75994d511eg.webp",
  "/Characters%20standing/Whisk_7338ae2d54853d69dbd43da6240ebd8eeg.webp",
  "/cards/storm_kick.webp",
  "/cards/power_punch.webp",
  "/cards/finisher.webp",
  "/cards/guard_stance.webp",
  "/cards/evasion.webp",
];

const MIN_MS = 2200;

interface Props {
  onDone: () => void;
}

export function GameLoadingScreen({ onDone }: Props) {
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);

  // Track viewport so we can rotate to landscape inside portrait viewports (MiniPay)
  useEffect(() => {
    const update = () => { setVw(window.innerWidth); setVh(window.innerHeight); };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  useEffect(() => {
    const total = ASSETS.length;
    let loaded = 0;
    const start = Date.now();

    const tick = () => {
      loaded++;
      setProgress(Math.round((loaded / total) * 100));
      if (loaded === total) {
        const wait = Math.max(0, MIN_MS - (Date.now() - start));
        setTimeout(() => {
          setFading(true);
          setTimeout(onDone, 450);
        }, wait);
      }
    };

    ASSETS.forEach((src) => {
      const img = new Image();
      img.onload = img.onerror = tick;
      img.src = src;
    });
  }, [onDone]);

  // In portrait mode rotate the loading screen to landscape — same orientation as the game canvas.
  // zIndex 9998 keeps us BELOW PortraitOverlay (9999) so "Rotate your device" shows on top.
  const isPortrait = vh > vw && vw > 0;
  // Portrait: rotate the loading screen to landscape, matching the game canvas direction.
  // Element is sized (vh × vw) so after rotate(90deg) it fills the portrait viewport.
  // translate(vw, 0) shifts it back into view after rotation around top-left.
  const outerStyle: React.CSSProperties = isPortrait
    ? {
        position: "fixed",
        top: 0,
        left: 0,
        width: vh,       // landscape width = portrait height
        height: vw,      // landscape height = portrait width
        transformOrigin: "top left",
        transform: `translate(${vw}px, 0px) rotate(90deg)`,
        zIndex: 9998,
        opacity: fading ? 0 : 1,
        transition: "opacity 0.45s ease",
      }
    : {
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        opacity: fading ? 0 : 1,
        transition: "opacity 0.45s ease",
      };

  return (
    <div style={{
      ...outerStyle,
      background: "linear-gradient(160deg, #050810 0%, #0a1428 55%, #060c1e 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-space-grotesk), sans-serif",
    }}>
      <style>{`
        @keyframes gl-pulse { 0%,100%{opacity:1}50%{opacity:0.35} }
        @keyframes gl-bar-shine {
          0%{background-position:200% center}
          100%{background-position:-200% center}
        }
        @keyframes gl-float {
          0%,100%{transform:translateY(0)}
          50%{transform:translateY(-6px)}
        }
      `}</style>

      {/* Corner accent lines */}
      {([
        { top: 24, left: 24, borderTop: "1.5px solid rgba(86,164,203,0.3)", borderLeft: "1.5px solid rgba(86,164,203,0.3)" },
        { top: 24, right: 24, borderTop: "1.5px solid rgba(86,164,203,0.3)", borderRight: "1.5px solid rgba(86,164,203,0.3)" },
        { bottom: 24, left: 24, borderBottom: "1.5px solid rgba(86,164,203,0.3)", borderLeft: "1.5px solid rgba(86,164,203,0.3)" },
        { bottom: 24, right: 24, borderBottom: "1.5px solid rgba(86,164,203,0.3)", borderRight: "1.5px solid rgba(86,164,203,0.3)" },
      ] as React.CSSProperties[]).map((s, i) => (
        <div key={i} style={{ position: "absolute", width: 40, height: 40, ...s }} />
      ))}

      {/* Logo block */}
      <div style={{ textAlign: "center", marginBottom: "6vh", animation: "gl-float 3s ease-in-out infinite" }}>
        {/* Accent bars */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginBottom: 16 }}>
          <div style={{ width: 4, height: "5vh", minHeight: 32, maxHeight: 56, background: "linear-gradient(to bottom, transparent, #56a4cb)", borderRadius: 2 }} />
          <div style={{ width: 6, height: "7vh", minHeight: 44, maxHeight: 70, background: "#56a4cb", borderRadius: 3, boxShadow: "0 0 20px #56a4cb, 0 0 40px rgba(86,164,203,0.4)" }} />
          <div style={{ width: 4, height: "5vh", minHeight: 32, maxHeight: 56, background: "linear-gradient(to bottom, #56a4cb, transparent)", borderRadius: 2 }} />
        </div>

        <div style={{ fontSize: "clamp(22px, 5vw, 38px)", fontWeight: 900, letterSpacing: "0.18em", color: "#ffffff", textTransform: "uppercase", lineHeight: 1, textShadow: "0 0 30px rgba(86,164,203,0.5)" }}>
          ACTION ORDER
        </div>
        <div style={{ fontSize: "clamp(9px, 2vw, 12px)", fontWeight: 700, letterSpacing: "0.3em", color: "rgba(185,231,244,0.45)", textTransform: "uppercase", marginTop: 6 }}>
          On-Chain Fighting Game · Celo
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ width: "min(300px, 70vw)", marginBottom: 14 }}>
        <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 2,
            background: "linear-gradient(90deg, #2d7aad, #56a4cb, #b9e7f4, #56a4cb, #2d7aad)",
            backgroundSize: "200% auto",
            width: `${progress}%`,
            transition: "width 0.25s ease",
            boxShadow: "0 0 10px rgba(86,164,203,0.7)",
            animation: progress > 0 ? "gl-bar-shine 1.8s linear infinite" : "none",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "rgba(185,231,244,0.3)", textTransform: "uppercase" }}>Loading assets</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: "rgba(86,164,203,0.6)", fontVariantNumeric: "tabular-nums" }}>{progress}%</span>
        </div>
      </div>

      {/* Pulsing label */}
      <p style={{
        fontSize: "clamp(9px, 2vw, 11px)", fontWeight: 700, letterSpacing: "0.3em",
        color: "rgba(185,231,244,0.3)", textTransform: "uppercase",
        animation: "gl-pulse 1.6s ease-in-out infinite",
        margin: 0,
      }}>
        Loading Game…
      </p>
    </div>
  );
}
