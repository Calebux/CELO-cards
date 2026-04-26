"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { getVolume, isMuted, playSound, setMuted, setVolume } from "../lib/soundManager";

interface SoundSettingsProps {
  /** Called when the modal closes */
  onClose: () => void;
}

export function SoundSettings({ onClose }: SoundSettingsProps) {
  const [muted, setMutedState] = useState(false);
  const [volume, setVolumeState] = useState(100);

  useEffect(() => {
    const sync = () => {
      setMutedState(isMuted());
      setVolumeState(Math.round(getVolume() * 100));
    };

    const handleSoundChange = (event: Event) => {
      const detail = (event as CustomEvent<{ muted?: boolean; volume?: number }>).detail;
      if (typeof detail?.muted === "boolean") setMutedState(detail.muted);
      if (typeof detail?.volume === "number") setVolumeState(Math.round(detail.volume * 100));
    };

    sync();
    window.addEventListener("ao-sound-change", handleSoundChange);
    return () => window.removeEventListener("ao-sound-change", handleSoundChange);
  }, []);

  const handleMuteToggle = () => {
    const next = !muted;
    setMuted(next);
    if (!next) {
      playSound("click");
    }
  };

  const handleVolume = (v: number) => {
    setVolume(v / 100);
    if (!muted) {
      playSound("click");
    }
  };

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "rgba(10,15,25,0.95)", border: "1.5px solid rgba(86,164,203,0.35)", borderRadius: 14, padding: "32px 36px", width: 320, display: "flex", flexDirection: "column", gap: 24, boxShadow: "0 0 40px rgba(86,164,203,0.15)", position: "relative" }}
      >
        {/* Top scan line */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: "linear-gradient(90deg, transparent, #56a4cb, transparent)", borderRadius: "14px 14px 0 0" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2.5, color: "#b9e7f4", textTransform: "uppercase" }}>Sound Settings</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Mute toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>Sound</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{muted ? "All audio muted" : "Audio enabled"}</div>
          </div>
          <button
            onClick={handleMuteToggle}
            style={{
              width: 52, height: 28, borderRadius: 14, border: `1px solid ${muted ? "rgba(248,113,113,0.4)" : "rgba(74,222,128,0.4)"}`, cursor: "pointer",
              background: muted ? "rgba(248,113,113,0.2)" : "rgba(74,222,128,0.2)",
              display: "flex", alignItems: "center",
              padding: "0 4px",
              transition: "all 0.2s",
            } as React.CSSProperties}
          >
            <div style={{
              width: 20, height: 20, borderRadius: "50%",
              background: muted ? "#f87171" : "#4ade80",
              transform: muted ? "translateX(0)" : "translateX(24px)",
              transition: "all 0.2s",
              boxShadow: `0 0 8px ${muted ? "#f87171" : "#4ade80"}80`,
            }} />
          </button>
        </div>

        {/* Volume slider */}
        <div style={{ opacity: muted ? 0.4 : 1, transition: "opacity 0.2s" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>Volume</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#56a4cb" }}>{volume}%</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14, color: "#475569" }}>🔈</span>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              disabled={muted}
              onChange={(e) => handleVolume(Number(e.target.value))}
              style={{ flex: 1, accentColor: "#56a4cb", cursor: muted ? "not-allowed" : "pointer" }}
            />
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{ background: "linear-gradient(135deg, #56a4cb22, #b9e7f422)", border: "1px solid rgba(86,164,203,0.3)", borderRadius: 8, padding: "10px", color: "#56a4cb", fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: 1.5, textTransform: "uppercase" }}
        >
          DONE
        </button>
      </div>
    </div>,
    document.body
  );
}
