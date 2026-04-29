"use client";

import { CSSProperties } from "react";
import { useGameStore } from "../lib/gameStore";
import { getNextOnboardingStep, getOnboardingCompletion, ONBOARDING_STEPS } from "../lib/onboarding";

export function OnboardingCoach({ style, accent = "#56a4cb" }: { style?: CSSProperties; accent?: string }) {
  const onboardingProgress = useGameStore((state) => state.onboardingProgress);
  const onboardingCoachHidden = useGameStore((state) => state.onboardingCoachHidden);
  const setOnboardingCoachHidden = useGameStore((state) => state.setOnboardingCoachHidden);
  const nextStep = getNextOnboardingStep(onboardingProgress);

  if (!nextStep || onboardingCoachHidden) return null;

  const complete = getOnboardingCompletion(onboardingProgress);
  const progressPct = (complete / ONBOARDING_STEPS.length) * 100;

  return (
    <div
      style={{
        width: 268,
        borderRadius: 10,
        padding: "14px 14px 12px",
        background: "rgba(7,12,22,0.92)",
        border: `1px solid ${accent}45`,
        boxShadow: `0 12px 28px ${accent}12`,
        backdropFilter: "blur(12px)",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: accent, textTransform: "uppercase" }}>First Match Coach</div>
          <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: "#e2e8f0" }}>{nextStep.title}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>{complete}/{ONBOARDING_STEPS.length}</div>
          <button
            onClick={() => setOnboardingCoachHidden(true)}
            style={{
              background: "transparent",
              border: "none",
              color: "#64748b",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Hide
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <div style={{ width: `${progressPct}%`, height: "100%", background: accent, boxShadow: `0 0 10px ${accent}` }} />
      </div>

      <p style={{ marginTop: 10, marginBottom: 10, fontSize: 12, color: "#cbd5e1", lineHeight: 1.45 }}>
        {nextStep.body}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {ONBOARDING_STEPS.map((step) => {
          const done = onboardingProgress[step.id];
          return (
            <div key={step.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="material-icons" style={{ fontSize: 14, color: done ? "#4ade80" : "rgba(148,163,184,0.7)" }}>
                {done ? "check_circle" : "radio_button_unchecked"}
              </span>
              <span style={{ fontSize: 11, color: done ? "#e2e8f0" : "#94a3b8", fontWeight: done ? 700 : 500 }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
