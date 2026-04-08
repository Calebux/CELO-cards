"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "../lib/gameStore";

const BG_IMAGE = "/new addition/kaira_lobby.webp";

const DESIGN_W = 1440;
const DESIGN_H = 823;

export default function Lobby() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { selectedCharacter, opponentCharacter, matchId } = useGameStore();
  const [p1Ready, setP1Ready] = useState(false);
  const [p2Ready, setP2Ready] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const player = selectedCharacter;
  const opponent = opponentCharacter;

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

  // AI auto-readies after a short delay
  useEffect(() => {
    const t = setTimeout(() => setP2Ready(true), 1500 + Math.random() * 1000);
    return () => clearTimeout(t);
  }, []);

  // Solo: auto-ready P1 after 3s; On-chain: P1 auto-readies (they committed by creating)
  useEffect(() => {
    const t = setTimeout(() => setP1Ready(true), 3000);
    return () => clearTimeout(t);
  }, []);

  // Countdown after both ready
  useEffect(() => {
    if (p1Ready && p2Ready && countdown === null) {
      setCountdown(3);
    }
  }, [p1Ready, p2Ready, countdown]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (countdown === 0) {
      router.push("/loadout");
    }
  }, [countdown, router]);

  const handleReady = () => {
    setP1Ready(true);
  };

  const statusText = !p1Ready
    ? "WAITING_FOR_PLAYERS..."
    : !p2Ready
      ? "OPPONENT_CONNECTING..."
      : countdown !== null && countdown > 0
        ? `MATCH_STARTS_IN_${countdown}...`
        : "LAUNCHING...";

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#050505", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, transformOrigin: "top left", position: "relative" }}>

        {/* Background */}
        <div className="absolute inset-0">
          <img src={BG_IMAGE} alt="" className="w-full h-full object-cover pointer-events-none" />
          <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.92)" }} />
        </div>

        {/* Logo */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center" style={{ top: "-2px", width: 200, height: 114 }}>
          <div style={{ fontWeight: 900, fontSize: 22, lineHeight: "1.1", letterSpacing: "-0.5px", color: "#b9e7f4", textAlign: "center", textShadow: "0 0 20px rgba(185,231,244,0.4)", textTransform: "uppercase" }}>ACTION<br/>ORDER</div>
        </div>

        {/* Header Top Bar */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-between border-b"
          style={{ top: 92, width: 1146, padding: "24px 32px 25px", backdropFilter: "blur(2px)", backgroundColor: "rgba(5,5,5,0.5)", borderColor: "rgba(255,255,255,0.05)" }}>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-[#06a8f9]" style={{ width: 8, height: 8 }} />
            <span style={{ fontSize: 14, letterSpacing: "1.4px", color: "#9ca3af", fontWeight: 500 }}>
              MATCH ID: <span style={{ color: "white" }}>{matchId ?? "AO-????-X"}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-icons" style={{ color: "#6b7280", fontSize: 14 }}>wifi</span>
            <span className="uppercase" style={{ fontSize: 12, letterSpacing: "1.2px", color: "#6b7280", fontWeight: 400 }}>Server: NAIJA O1</span>
          </div>
          <div className="flex items-center gap-4">
            <span style={{ fontSize: 14, letterSpacing: "1.4px", color: "#06a8f9", fontWeight: 500 }}>{statusText}</span>
            <div className={`rounded-full bg-[#06a8f9] ${p1Ready && p2Ready ? "animate-ping" : ""}`} style={{ width: 8, height: 8 }} />
          </div>
        </div>

        {/* Main Split Layout */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-start"
          style={{ top: 181, width: 960, height: 526.5, paddingTop: 60, paddingBottom: 30 }}>

          {/* Vertical Divider */}
          <div className="absolute top-0 bottom-0" style={{ left: "calc(50% - 0.375px)", width: "0.75px", background: "linear-gradient(to bottom, transparent, rgba(185,231,244,0.3) 20%, rgba(185,231,244,0.3) 80%, transparent)" }} />

          {/* Player 1 — Left */}
          <div className="flex-1 relative h-full">
            <div className="absolute flex items-center" style={{ inset: "-60px 36px 80px 36px", paddingLeft: 30 }}>
              <div className="relative flex-1 overflow-hidden" style={{ maxWidth: 384, height: 504, borderRadius: 12 }}>
                {player && (
                  <img src={player.standingArt} alt={player.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{
                      objectPosition: "top center",
                      filter: p1Ready ? "none" : "grayscale(1)",
                      transition: "all 0.5s ease"
                    }} />
                )}
              </div>
              {player && (
                <div className="absolute" style={{ left: 30, top: 30 }}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="rounded-sm px-1.5 py-0.5 bg-[#06a8f9]">
                      <span className="font-bold uppercase text-black" style={{ fontSize: 9 }}>P1</span>
                    </div>
                    <div className="rounded-sm px-1.5 py-0.5 border" style={{ borderColor: "rgba(6,168,249,0.3)" }}>
                      <span className="font-bold uppercase text-[#06a8f9]" style={{ fontSize: "7.5px", letterSpacing: "0.375px" }}>[{player.className}]</span>
                    </div>
                  </div>
                  <div className="font-bold uppercase text-white" style={{ fontSize: 45, lineHeight: "45px", letterSpacing: "-2.25px", textShadow: "0px 0px 7.5px rgba(6,168,249,0.5)", marginTop: 4 }}>
                    <div>{player.name}</div>
                  </div>
                  <div className="font-light uppercase" style={{ fontSize: 18, letterSpacing: "1.8px", color: "#6b7280", marginTop: 6 }}>
                    {player.className}
                  </div>
                </div>
              )}
            </div>
            {/* Ready Button P1 */}
            <div className="absolute flex items-center justify-center cursor-pointer"
              style={{ left: "50%", transform: "translateX(-50%)", top: 445, width: 300, opacity: p1Ready ? 0.5 : 1, pointerEvents: p1Ready ? "none" : "auto" }}>
              <button className="ko-btn ko-btn-primary w-full h-[54px]" onClick={handleReady}>
                <span className="ko-btn-text font-bold uppercase text-white" style={{ fontSize: 20, letterSpacing: "2px" }}>
                  {p1Ready ? "LOCKED IN" : "READY"}
                </span>
                <span className="material-icons ko-btn-icon text-white" style={{ fontSize: 24 }}>{p1Ready ? "check" : "arrow_forward_ios"}</span>
              </button>
            </div>
          </div>

          {/* Center VS */}
          <div className="absolute flex items-center justify-center"
            style={{ left: "50%", transform: "translateX(-50%)", top: "39.72%", bottom: "37.59%", width: 161 }}>
            <span className="font-bold select-none"
              style={{
                fontSize: countdown !== null && countdown > 0 ? 180 : 144,
                lineHeight: "144px",
                letterSpacing: "-7.2px",
                backgroundImage: "linear-gradient(to bottom, white 0%, #9ca3af 50%, #1f2937 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                filter: "drop-shadow(0px 18.75px 18.75px rgba(0,0,0,0.15))",
                transition: "all 0.3s ease",
              }}>
              {countdown !== null && countdown > 0 ? countdown : "VS"}
            </span>
          </div>

          {/* Player 2 — Right */}
          <div className="flex-1 relative h-full">
            <div className="absolute flex items-center justify-end" style={{ inset: "-60px 36px 80px 36px", paddingRight: 30 }}>
              <div className="relative flex-1 overflow-hidden" style={{ maxWidth: 384, height: 504, borderRadius: 12 }}>
                {opponent && (
                  <img src={opponent.standingArt} alt={opponent.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{
                      objectPosition: "top center",
                      filter: p2Ready ? "none" : "grayscale(1)",
                      transition: "all 0.5s ease"
                    }} />
                )}
              </div>
              {opponent && (
                <div className="absolute flex flex-col items-end" style={{ right: 6, top: 30 }}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="rounded-sm px-1.5 py-0.5 border" style={{ borderColor: "rgba(249,6,168,0.3)" }}>
                      <span className="font-bold uppercase text-right" style={{ fontSize: "7.5px", letterSpacing: "0.375px", color: opponent.color }}>[{opponent.className}]</span>
                    </div>
                    <div className="rounded-sm px-1.5 py-0.5" style={{ backgroundColor: opponent.color }}>
                      <span className="font-bold uppercase text-black" style={{ fontSize: 9 }}>P2</span>
                    </div>
                  </div>
                  <div className="font-bold uppercase text-white text-right" style={{ fontSize: 45, lineHeight: "45px", letterSpacing: "-2.25px", textShadow: `0px 0px 7.5px ${opponent.color}80`, marginTop: 4 }}>
                    <div>{opponent.name}</div>
                  </div>
                  <div className="font-light uppercase text-right" style={{ fontSize: 18, letterSpacing: "1.8px", color: "#6b7280", marginTop: 6 }}>
                    {opponent.className}
                  </div>
                </div>
              )}
            </div>
            {/* Ready Button P2 — auto-clicks */}
            <div className="absolute flex items-center justify-center"
              style={{ left: "50%", transform: "translateX(-50%)", top: 445, width: 300, opacity: p2Ready ? 0.5 : 1 }}>
              <button className="ko-btn ko-btn-primary w-full h-[54px]">
                <span className="ko-btn-text font-bold uppercase text-white" style={{ fontSize: 20, letterSpacing: "2px" }}>
                  {p2Ready ? "LOCKED IN" : "WAITING..."}
                </span>
                <span className="material-icons ko-btn-icon text-white" style={{ fontSize: 24 }}>{p2Ready ? "check" : "hourglass_empty"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
