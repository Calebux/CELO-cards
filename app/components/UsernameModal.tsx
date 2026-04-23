"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useGameStore } from "../lib/gameStore";

const DESIGN_W = 1440;
const DESIGN_H = 823;

export function UsernameModal() {
  const { address } = useAccount();
  const playerName = useGameStore((s) => s.playerName);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [show, setShow] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  // Track which address we've already checked so we don't re-prompt on re-renders
  const checkedRef = useRef<string>("");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
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

  // When a wallet connects, check if they already have a username
  useEffect(() => {
    if (!address) { checkedRef.current = ""; setShow(false); return; }
    if (checkedRef.current === address) return;
    checkedRef.current = address;

    void fetch(`/api/username?address=${address.toLowerCase()}&t=${Date.now()}`)
      .then((r) => r.json())
      .then((d: { username?: string | null }) => {
        if (d.username) {
          // Already has a username — sync it to the store and stay hidden
          setPlayerName(d.username);
        } else if (!playerName) {
          // No username anywhere — prompt them
          setShow(true);
        }
      })
      .catch(() => {
        // On network error just stay hidden — don't block the user
      });
  }, [address, playerName, setPlayerName]);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || trimmed.length < 2) { setError("Min 2 characters"); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { setError("Letters, numbers, underscores only"); return; }
    if (!address) return;

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, username: trimmed }),
      });
      const data = await res.json() as { ok?: boolean; username?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to save username");
      } else {
        setPlayerName(data.username ?? trimmed);
        setSuccess(true);
        setTimeout(() => setShow(false), 900);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  const ACCENT = "#56a4cb";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300,
      backgroundColor: "rgba(5,5,16,0.88)",
      backdropFilter: "blur(10px)",
      overflow: "hidden",
    }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          position: "relative", width: 420,
          background: "rgba(12,18,36,0.97)",
          border: `2px solid ${ACCENT}`,
          borderRadius: 10,
          padding: "44px 44px 36px",
          boxShadow: `0 0 60px ${ACCENT}40, 0 0 120px ${ACCENT}18`,
          fontFamily: "var(--font-space-grotesk), sans-serif",
        }}>
          {/* Scanline */}
          <div style={{ position: "absolute", top: -1, left: -1, right: -1, height: 2, background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)` }} />
          {/* Corner accents */}
          {[
            { top: -10, left: -10, borderLeft: `1.5px solid ${ACCENT}`, borderTop: `1.5px solid ${ACCENT}` },
            { top: -10, right: -10, borderRight: `1.5px solid ${ACCENT}`, borderTop: `1.5px solid ${ACCENT}` },
            { bottom: -10, left: -10, borderLeft: `1.5px solid ${ACCENT}`, borderBottom: `1.5px solid ${ACCENT}` },
            { bottom: -10, right: -10, borderRight: `1.5px solid ${ACCENT}`, borderBottom: `1.5px solid ${ACCENT}` },
          ].map((s, i) => (
            <div key={i} style={{ position: "absolute", width: 24, height: 24, ...s }} />
          ))}

          {/* Icon */}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <span className="material-icons" style={{ fontSize: 40, color: ACCENT }}>person</span>
          </div>

          {/* Heading */}
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 4, color: ACCENT, textTransform: "uppercase", marginBottom: 8, textAlign: "center" }}>
            Welcome, Fighter
          </p>
          <h2 style={{ fontSize: 26, fontWeight: 900, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: -0.5, margin: "0 0 8px", textAlign: "center" }}>
            Choose Your Name
          </h2>
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 28px", lineHeight: 1.6, textAlign: "center" }}>
            This is how opponents and the leaderboard will see you.
          </p>

          {/* Input */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>
              Username
            </div>
            <div style={{ display: "flex", alignItems: "center", border: `1.5px solid ${error ? "#f87171" : ACCENT}`, borderRadius: 6, overflow: "hidden", transition: "border-color 0.2s" }}>
              <span className="material-icons" style={{ padding: "0 12px", fontSize: 18, color: "#475569" }}>alternate_email</span>
              <input
                type="text"
                maxLength={20}
                value={input}
                onChange={(e) => { setInput(e.target.value); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); }}
                placeholder="e.g. ShadowKnight"
                autoFocus
                style={{
                  flex: 1, padding: "12px 14px 12px 0",
                  background: "rgba(0,0,0,0.4)",
                  border: "none", outline: "none",
                  fontSize: 16, fontWeight: 700, color: "#f1f5f9",
                  fontFamily: "inherit",
                }}
              />
              <span style={{ padding: "0 12px", fontSize: 11, color: "#334155" }}>{input.length}/20</span>
            </div>
            <p style={{ fontSize: 10, color: "#475569", margin: "6px 0 0" }}>
              Letters, numbers, underscores only · 2–20 chars
            </p>
          </div>

          {/* Error / success */}
          {error && (
            <p style={{ fontSize: 11, color: "#f87171", textAlign: "center", marginBottom: 12 }}>{error}</p>
          )}
          {success && (
            <p style={{ fontSize: 12, color: "#4ade80", textAlign: "center", marginBottom: 12, fontWeight: 700 }}>
              ✓ Username saved!
            </p>
          )}

          {/* Submit */}
          <button
            onClick={() => void handleSubmit()}
            disabled={loading || success || input.trim().length < 2}
            style={{
              width: "100%", padding: "14px 0", marginBottom: 12,
              background: loading || success ? `${ACCENT}30` : `linear-gradient(135deg, ${ACCENT}28, ${ACCENT}10)`,
              border: `1.5px solid ${ACCENT}`,
              borderRadius: 6, cursor: (loading || success || input.trim().length < 2) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              transition: "all 0.2s",
              boxShadow: loading ? "none" : `0 0 20px ${ACCENT}30`,
              clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
              fontFamily: "inherit",
            }}
          >
            <span className="material-icons" style={{ fontSize: 18, color: ACCENT }}>
              {loading ? "hourglass_empty" : success ? "check_circle" : "person_add"}
            </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: 3 }}>
              {loading ? "Saving…" : success ? "Saved!" : "Save Username"}
            </span>
          </button>

          {/* Skip */}
          <button
            onClick={() => setShow(false)}
            disabled={loading}
            style={{
              width: "100%", padding: "10px 0",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 5, cursor: loading ? "not-allowed" : "pointer",
              fontSize: 11, fontWeight: 700, color: "#475569",
              letterSpacing: 2, textTransform: "uppercase",
              fontFamily: "inherit",
            }}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
