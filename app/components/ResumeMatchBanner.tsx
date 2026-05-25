"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { hydrateActiveMatchResume, useActiveMatchResume } from "../lib/activeMatch";
import { useGameStore } from "../lib/gameStore";

export function ResumeMatchBanner({ isMiniPay }: { isMiniPay: boolean }) {
  const { address } = useAccount();
  const matchPhase = useGameStore((state) => state.matchPhase);
  const matchId = useGameStore((state) => state.matchId);
  const selectedCharacter = useGameStore((state) => state.selectedCharacter);
  const serverResumeMatch = useActiveMatchResume(address);

  const resumeRoute = useMemo(() => {
    if (!selectedCharacter && matchPhase !== "idle") return "/select-character";
    if (matchPhase === "combat" || matchPhase === "round-result") return "/gameplay";
    if (matchPhase === "loadout") return "/loadout";
    if (matchPhase === "lobby") return "/select-character";
    if (matchPhase === "waiting-for-opponent" && matchId) return "/select-character";
    return null;
  }, [matchId, matchPhase, selectedCharacter]);

  const effectiveResumeRoute = serverResumeMatch?.route ?? resumeRoute ?? null;

  if (!effectiveResumeRoute) return null;

  return (
    <button
      onClick={() => {
        if (serverResumeMatch) hydrateActiveMatchResume(serverResumeMatch);
        window.location.href = effectiveResumeRoute;
      }}
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        top: isMiniPay ? 126 : 118,
        zIndex: 16,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: isMiniPay ? "10px 18px" : "8px 16px",
        background: "linear-gradient(135deg, rgba(6,168,249,0.18), rgba(6,168,249,0.08))",
        border: "1px solid rgba(6,168,249,0.45)",
        borderRadius: 6,
        textDecoration: "none",
        boxShadow: "0 0 14px rgba(6,168,249,0.28)",
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: isMiniPay ? 12 : 11, fontWeight: 800, letterSpacing: 1.4, color: "#7dd3fc", textTransform: "uppercase" }}>Match in progress</span>
      <span style={{ fontSize: isMiniPay ? 12 : 11, fontWeight: 700, letterSpacing: 1.2, color: "#fff", textTransform: "uppercase" }}>Tap to Resume</span>
    </button>
  );
}
