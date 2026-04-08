"use client";

import { useEffect, useRef, useState } from "react"; // useState kept for copied
import { useRouter } from "next/navigation";
import { useGameStore } from "../lib/gameStore";
import { useAccount } from "wagmi";
import { formatAddress } from "../lib/minipay";

// ── Figma assets ─────────────────────────────────────────────────
const BG_IMAGE = "/new addition/gameplay landing page.webp";

const DESIGN_W = 1440;
const DESIGN_H = 823;

export default function ReadyYourDeck() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [challengeUser, setChallengeUser] = useState("");
  const [challenged, setChallenged] = useState(false);
  const [linkShared, setLinkShared] = useState(false);
  const storeMatchId = useGameStore((s) => s.matchId);
  const { address } = useAccount();
  const playerLabel = address ? formatAddress(address) : "Guest";

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

  const matchId = storeMatchId ?? "AO-????-X";

  const handleCopy = () => {
    navigator.clipboard.writeText(matchId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleChallenge = () => {
    if (!challengeUser.trim()) return;
    // Copy a deep-link the opponent can paste into the Join screen
    const link = `${window.location.origin}/join?id=${matchId}`;
    navigator.clipboard.writeText(link);
    setChallenged(true);
    setTimeout(() => setChallenged(false), 2000);
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
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, transformOrigin: "top left", position: "relative" }}>

        {/* Background */}
        <img src={BG_IMAGE} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />

        {/* Logo */}
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: -13, width: 350, height: 200, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 30, lineHeight: "1.1", letterSpacing: "-1px", color: "#b9e7f4", textAlign: "center", textShadow: "0 0 24px rgba(185,231,244,0.5)", textTransform: "uppercase" }}>ACTION<br/>ORDER</div>
        </div>

        {/* Cartridge Identity badge — top right */}
        <div style={{
          position: "absolute", right: 50, top: 58,
          display: "flex", alignItems: "center",
          backgroundColor: "#b9e7f4", border: "1px solid #222f42",
          borderRadius: 8, padding: 9, backdropFilter: "blur(6px)",
          zIndex: 10,
        }}>
          <div style={{ textAlign: "right", marginRight: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#000", lineHeight: "10px" }}>
              Cartridge Identity
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#000", lineHeight: "20px" }}>
              {playerLabel}
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <div style={{ width: 40, height: 40, borderRadius: 4, border: "2px solid #222f42", overflow: "hidden", backgroundColor: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="material-icons" style={{ color: "#94a3b8", fontSize: 22 }}>person</span>
            </div>
            {/* Online dot */}
            <div style={{
              position: "absolute", bottom: -4, right: -4,
              width: 12, height: 12, borderRadius: "50%",
              backgroundColor: "#8c25f4", border: "2px solid #0a060e",
            }} />
          </div>
        </div>

        {/* ── Central Panel ─────────────────────────────────────────── */}
        <div style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%, -50%)",
          marginTop: 54,
          width: 504,
        }}>
          {/* Corner accents */}
          <div style={{ position: "absolute", top: -12, left: -12, width: 36, height: 36, borderLeft: "1.5px solid #b9e7f4", borderTop: "1.5px solid #b9e7f4" }} />
          <div style={{ position: "absolute", top: -12, right: -12, width: 36, height: 36, borderRight: "1.5px solid #b9e7f4", borderTop: "1.5px solid #b9e7f4" }} />
          <div style={{ position: "absolute", bottom: -12, left: -12, width: 36, height: 36, borderLeft: "1.5px solid #b9e7f4", borderBottom: "1.5px solid #b9e7f4" }} />
          <div style={{ position: "absolute", bottom: -12, right: -12, width: 36, height: 36, borderRight: "1.5px solid #b9e7f4", borderBottom: "1.5px solid #b9e7f4" }} />

          {/* Glassmorphism panel */}
          <div style={{
            backgroundColor: "rgba(15, 23, 42, 0.4)",
            border: "2.4px solid #b9e7f4",
            borderRadius: 6,
            backdropFilter: "blur(4.5px)",
            padding: "38px 38px",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 0 20px rgba(185, 231, 244, 0.25)",
          }}>
            {/* Holographic scanline */}
            <div style={{ position: "absolute", top: -2, left: -2, right: -2, height: 1.5, backgroundColor: "#56a4cb" }} />

            {/* Heading */}
            <div style={{ textAlign: "center", marginBottom: 30 }}>
              <h2 style={{
                fontSize: 30, fontWeight: 700, color: "#f1f5f9",
                textTransform: "uppercase", letterSpacing: -0.75,
                margin: 0, lineHeight: "36px",
              }}>
                Ready Your Deck
              </h2>
              <p style={{
                fontSize: 14, color: "#94a3b8", margin: "8px 0 0",
                lineHeight: "20px",
              }}>
                Challenge an opponent to enter the arena
              </p>
            </div>

            {/* Two-column: Direct Challenge | OR | Share Match Link */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>

              {/* Section 1: Direct Challenge */}
              <div style={{ width: 197, flexShrink: 0, display: "flex", flexDirection: "column" }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: "#fff",
                  textTransform: "uppercase", letterSpacing: 1.2,
                  lineHeight: "16px", marginBottom: 10,
                }}>
                  Direct Challenge
                </div>
                <p style={{ fontSize: 11, color: "#6b7280", lineHeight: "16px", marginBottom: 10 }}>
                  Enter your opponent&apos;s Cartridge username to send a match invite link.
                </p>
                {/* Username input */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
                  backgroundColor: "rgba(17,10,24,0.5)",
                  border: "1px solid #334155", borderRadius: 8,
                  padding: "8px 12px",
                }}>
                  <span className="material-icons" style={{ color: "#56a4cb", fontSize: 15 }}>person</span>
                  <input
                    type="text"
                    value={challengeUser}
                    onChange={(e) => setChallengeUser(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleChallenge()}
                    placeholder="@cartridge_user"
                    style={{
                      background: "none", border: "none", outline: "none",
                      color: "#fff", fontSize: 12, width: "100%",
                      fontFamily: "inherit", letterSpacing: 0.4,
                    }}
                  />
                </div>
                {/* Send Challenge button */}
                <button
                  onClick={handleChallenge}
                  className="ko-btn ko-btn-primary"
                  style={{ width: "100%", padding: "10px 0", marginBottom: 10, opacity: challengeUser.trim() ? 1 : 0.5 }}
                >
                  <span className="material-icons ko-btn-icon" style={{ fontSize: 15 }}>{challenged ? "check" : "send"}</span>
                  <span className="ko-btn-text" style={{ fontSize: 12, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: 0.7 }}>
                    {challenged ? "Link Copied!" : "Send Challenge"}
                  </span>
                </button>
                {/* Solo fallback */}
                <button
                  onClick={() => router.push("/select-character")}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#56a4cb", fontFamily: "inherit", letterSpacing: 0.5, textAlign: "left", padding: 0 }}
                >
                  → Enter arena solo
                </button>
              </div>

              {/* OR Divider */}
              <div style={{
                width: 32, flexShrink: 0,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                height: 135,
              }}>
                <div style={{ flex: 1, width: 1, background: "linear-gradient(to bottom, transparent, rgba(185,231,244,0.3) 30%, rgba(185,231,244,0.3) 70%, transparent)" }} />
                <div style={{ padding: "16px 0" }}>
                  <div style={{
                    width: 32, height: 23,
                    backgroundColor: "#110a18",
                    border: "1px solid #334155",
                    borderRadius: 9999, display: "flex",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#f5f5f5" }}>OR</span>
                  </div>
                </div>
                <div style={{ flex: 1, width: 1, background: "linear-gradient(to bottom, transparent, rgba(185,231,244,0.3) 30%, rgba(185,231,244,0.3) 70%, transparent)" }} />
              </div>

              {/* Section 2: Share Match Link */}
              <div style={{ width: 184, flexShrink: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: "#fff",
                  textTransform: "uppercase", letterSpacing: 1.2,
                  lineHeight: "16px", marginBottom: 16,
                }}>
                  Share Match Link
                </div>

                {/* Match ID + Copy */}
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <div style={{
                    width: 128, height: 43,
                    backgroundColor: "rgba(17, 10, 24, 0.5)",
                    border: "1px solid #334155", borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: "#fff",
                      letterSpacing: 1.6, textAlign: "center",
                    }}>
                      {matchId}
                    </span>
                  </div>
                  <button
                    onClick={handleCopy}
                    style={{
                      width: 43, height: 43,
                      backgroundColor: "#1e293b",
                      border: "1px solid #334155",
                      borderRadius: 8, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 13,
                    }}
                  >
                    <span className="material-icons" style={{ color: "#94a3b8", fontSize: 18 }}>content_copy</span>
                  </button>
                </div>


                {/* Share Link button */}
                <button
                  onClick={handleShareLink}
                  className="ko-btn ko-btn-secondary"
                  style={{ width: 181, height: 44 }}
                >
                  <svg className="ko-btn-icon" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" /></svg>
                  <span className="ko-btn-text" style={{
                    fontSize: 14, fontWeight: 700, color: "#cbd5e1",
                    textTransform: "uppercase", letterSpacing: 0.7,
                  }}>
                    {linkShared ? "Copied!" : "Share Link"}
                  </span>
                </button>
              </div>
            </div>

            {/* Info text */}
            <div style={{
              fontSize: 10, color: "#fff", textAlign: "center",
              lineHeight: "16.25px", marginTop: 24,
            }}>
              Share this session ID with a friend. They can join the<br />
              match instantly by entering it in their lobby.
            </div>

            {/* Status Footer */}
            <div style={{
              borderTop: "1px solid #b9e7f4",
              marginTop: 24, paddingTop: 41,
              display: "flex", flexDirection: "column", alignItems: "center",
            }}>
              {/* Waiting status */}
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#0f1c23" }} />
                  <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#b9e7f4" }} />
                  <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#334155" }} />
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 500, color: "#fff",
                  textTransform: "uppercase", letterSpacing: 2.4,
                  marginLeft: 12,
                }}>
                  Waiting for opponent...
                </span>
              </div>

              {/* Player slots */}
              <div style={{ display: "flex", gap: 16, marginTop: 32 }}>
                {/* Player 1 — filled */}
                <div style={{
                  width: 48, height: 64, borderRadius: 8,
                  backgroundColor: "#b9e7f4",
                  border: "1px solid #334155",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden", position: "relative",
                }}>
                  <span className="material-icons" style={{ color: "#222f42", fontSize: 20 }}>person</span>
                  <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(140, 37, 244, 0.05)" }} />
                </div>
                {/* Player 2 — filled */}
                <div style={{
                  width: 48, height: 64, borderRadius: 8,
                  backgroundColor: "#b9e7f4",
                  border: "1px solid #334155",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden", position: "relative",
                }}>
                  <span className="material-icons" style={{ color: "#222f42", fontSize: 20 }}>person</span>
                  <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(140, 37, 244, 0.05)" }} />
                </div>
                {/* Player 3 — empty */}
                <div style={{
                  width: 48, height: 64, borderRadius: 8,
                  border: "2px dashed #334155",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span className="material-icons" style={{ color: "#334155", fontSize: 18 }}>add</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginTop: 24, width: "100%",
          }}>
            {/* Left: Action Order branding */}
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8,
                backgroundColor: "#0f1c23",
                border: "1px solid #0f1c23",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 15px rgba(140, 37, 244, 0.4), inset 0 0 5px rgba(140, 37, 244, 0.2)",
              }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: "#8c25f4", letterSpacing: "-0.5px" }}>KO</span>
              </div>
              <div style={{ marginLeft: 12 }}>
                <div style={{
                  fontSize: 24, fontWeight: 700, color: "#f1f5f9",
                  textTransform: "uppercase", letterSpacing: -1.2,
                  lineHeight: "32px",
                  textShadow: "0 0 8px rgba(140, 37, 244, 0.8)",
                }}>
                  Action Order
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 500, color: "#0f1c23",
                  textTransform: "uppercase", letterSpacing: 1.2,
                  lineHeight: "16px", opacity: 0.8,
                }}>
                  PvP Matchmaking
                </div>
              </div>
            </div>

            {/* Right: Cartridge ID pill */}
            <div style={{
              backgroundColor: "#0f1c23",
              border: "1px solid #0f1c23",
              borderRadius: 9999,
              padding: "7px 13px",
              display: "flex", alignItems: "center",
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                backgroundColor: "#22c55e", marginRight: 8,
              }} />
              <span style={{
                fontSize: 12, fontWeight: 600, color: "#cbd5e1",
                lineHeight: "16px",
              }}>
                CELO: {playerLabel.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
