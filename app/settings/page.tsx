"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WalletSection } from "../components/WalletSection";
import { isMuted, setMuted, getVolume, setVolume } from "../lib/soundManager";

const DESIGN_W = 1440;
const DESIGN_H = 823;

export default function SettingsPage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [muted, setMutedState] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [reducedEffects, setReducedEffects] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMutedState(isMuted());
    setVolumeState(getVolume());
    try { setReducedEffects(localStorage.getItem("ao-reducedEffects") === "1"); } catch { /* */ }
  }, []);

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

  const handleSave = () => {
    setMuted(muted);
    setVolume(volume);
    try { localStorage.setItem("ao-reducedEffects", reducedEffects ? "1" : "0"); } catch { /* */ }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>{label}</div>
          {sub && <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{sub}</div>}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#050505", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left" }}>

        <img src="/new addition/gameplay landing page.webp" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.3, pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "rgba(5,5,5,0.85)", pointerEvents: "none" }} />

        {/* Top bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
            <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase" }}>ACTION ORDER</span>
          </button>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#9ca3af", textTransform: "uppercase" }}>SETTINGS</div>
          <WalletSection />
        </div>

        {/* Content */}
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -46%)", width: 560 }}>

          {/* Corner accents */}
          {[
            { top: -12, left: -12, borderLeft: "1.5px solid #56a4cb", borderTop: "1.5px solid #56a4cb" },
            { top: -12, right: -12, borderRight: "1.5px solid #56a4cb", borderTop: "1.5px solid #56a4cb" },
            { bottom: -12, left: -12, borderLeft: "1.5px solid #56a4cb", borderBottom: "1.5px solid #56a4cb" },
            { bottom: -12, right: -12, borderRight: "1.5px solid #56a4cb", borderBottom: "1.5px solid #56a4cb" },
          ].map((s, i) => (
            <div key={i} style={{ position: "absolute", width: 36, height: 36, ...s }} />
          ))}

          <div style={{ background: "rgba(10,15,28,0.92)", border: "1.5px solid rgba(86,164,203,0.35)", borderRadius: 8, backdropFilter: "blur(12px)", overflow: "hidden", boxShadow: "0 0 40px rgba(86,164,203,0.08)" }}>
            <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #56a4cb, transparent)" }} />
            <div style={{ padding: "36px 44px 40px" }}>

              <h2 style={{ fontSize: 26, fontWeight: 900, color: "#f1f5f9", letterSpacing: -0.5, textTransform: "uppercase", margin: "0 0 4px" }}>Settings</h2>
              <p style={{ fontSize: 12, color: "#475569", margin: "0 0 32px", letterSpacing: 0.5 }}>Audio & display preferences</p>

              {/* Mute toggle */}
              <Row label="Mute All Sound" sub="Silences all game sounds and music">
                <button
                  onClick={() => setMutedState(!muted)}
                  style={{
                    width: 56, height: 28, borderRadius: 14,
                    background: muted ? "rgba(239,68,68,0.2)" : "rgba(86,164,203,0.2)",
                    border: `2px solid ${muted ? "#ef4444" : "#56a4cb"}`,
                    cursor: "pointer", position: "relative", transition: "all 0.2s",
                  }}
                >
                  <div style={{
                    position: "absolute", top: 2, left: muted ? 26 : 2,
                    width: 20, height: 20, borderRadius: "50%",
                    background: muted ? "#ef4444" : "#56a4cb",
                    transition: "left 0.2s",
                  }} />
                </button>
              </Row>

              {/* Volume */}
              <Row label="Master Volume" sub={`${Math.round(volume * 100)}%`}>
                <input
                  type="range"
                  min="0" max="1" step="0.05"
                  value={volume}
                  onChange={(e) => setVolumeState(parseFloat(e.target.value))}
                  disabled={muted}
                  style={{ width: 160, accentColor: "#56a4cb", opacity: muted ? 0.4 : 1, cursor: muted ? "default" : "pointer" }}
                />
              </Row>

              {/* Reduced effects */}
              <Row label="Reduce Visual Effects" sub="Disables flash animations, combo banners, and cinematic overlays">
                <button
                  onClick={() => setReducedEffects(!reducedEffects)}
                  style={{
                    width: 56, height: 28, borderRadius: 14,
                    background: reducedEffects ? "rgba(86,164,203,0.2)" : "rgba(255,255,255,0.05)",
                    border: `2px solid ${reducedEffects ? "#56a4cb" : "rgba(255,255,255,0.12)"}`,
                    cursor: "pointer", position: "relative", transition: "all 0.2s",
                  }}
                >
                  <div style={{
                    position: "absolute", top: 2, left: reducedEffects ? 26 : 2,
                    width: 20, height: 20, borderRadius: "50%",
                    background: reducedEffects ? "#56a4cb" : "rgba(255,255,255,0.2)",
                    transition: "left 0.2s",
                  }} />
                </button>
              </Row>

              {/* Save button */}
              <div style={{ marginTop: 32, display: "flex", gap: 12 }}>
                <button
                  onClick={handleSave}
                  style={{
                    flex: 2, height: 50,
                    background: saved ? "rgba(74,222,128,0.15)" : "linear-gradient(135deg, #1a3a52, #0f2233)",
                    border: `1.5px solid ${saved ? "#4ade80" : "#56a4cb"}`,
                    borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                    fontWeight: 900, fontSize: 14, letterSpacing: 2.5,
                    color: saved ? "#4ade80" : "#b9e7f4", textTransform: "uppercase",
                    transition: "all 0.2s",
                  }}
                >
                  {saved ? "✓ SAVED" : "SAVE SETTINGS"}
                </button>
                <button
                  onClick={() => router.push("/")}
                  style={{ flex: 1, height: 50, background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13, letterSpacing: 1, color: "#6b7280", textTransform: "uppercase" }}
                >
                  ← BACK
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
