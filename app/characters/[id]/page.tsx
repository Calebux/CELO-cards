"use client";

import { useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { CHARACTERS, CARDS } from "../../lib/gameData";
import { WalletSection } from "../../components/WalletSection";
import { useGameStore } from "../../lib/gameStore";

const DESIGN_W = 1440;
const DESIGN_H = 823;

const STAT_META = [
  { key: "knockStat" as const, label: "Knock", color: "#f87171", icon: "gavel", desc: "Raw damage output per winning slot" },
  { key: "priorityStat" as const, label: "Priority", color: "#60a5fa", icon: "speed", desc: "Speed advantage — wins ties in clash resolution" },
  { key: "drainStat" as const, label: "Drain", color: "#4ade80", icon: "bolt", desc: "Energy drain dealt to opponent per round" },
];

const CARD_TYPE_COLOR: Record<string, string> = {
  strike: "#f87171",
  defense: "#60a5fa",
  control: "#a855f7",
};

const ULTIMATE_EFFECT_LABEL: Record<string, string> = {
  guaranteed_crit: "Guaranteed Critical",
  double_knock: "Double Knock",
  full_dodge: "Full Dodge",
  drain_debuff: "Drain Debuff",
  priority_surge: "Priority Surge",
};

export default function CharacterDetailPage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { selectCharacter, startMatch, playerRole, matchId } = useGameStore();

  const char = CHARACTERS.find((c) => c.id === id);

  // Recommend top cards: pick 3 based on character archetype
  // High knock → strike cards; high priority → control; high drain → mixed
  const topCards = [...CARDS]
    .sort((a, b) => {
      if (!char) return 0;
      const aScore =
        (char.knockStat / 100) * (a.type === "strike" ? 2 : 0.5) +
        (char.priorityStat / 100) * (a.type === "control" ? 2 : 0.5) +
        (char.drainStat / 100) * (a.type === "defense" ? 1.5 : 0.5);
      const bScore =
        (char.knockStat / 100) * (b.type === "strike" ? 2 : 0.5) +
        (char.priorityStat / 100) * (b.type === "control" ? 2 : 0.5) +
        (char.drainStat / 100) * (b.type === "defense" ? 1.5 : 0.5);
      return bScore - aScore;
    })
    .slice(0, 4);

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

  if (!char) {
    return (
      <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#050505", color: "#94a3b8", fontFamily: "sans-serif" }}>
        Character not found.{" "}
        <button onClick={() => router.push("/select-character")} style={{ color: "#56a4cb", background: "none", border: "none", cursor: "pointer", marginLeft: 8 }}>
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#050505", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left" }}>

        {/* Background: character art blurred */}
        <img
          src={char.standingArt}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", filter: "blur(32px) saturate(0.4)", transform: "scale(1.1)", opacity: 0.25, pointerEvents: "none" }}
        />
        <div style={{ position: "absolute", inset: 0, background: "rgba(5,5,5,0.88)", pointerEvents: "none" }} />
        {/* Accent gradient from character color */}
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 30% 50%, ${char.color}12 0%, transparent 60%)`, pointerEvents: "none" }} />

        {/* Top bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <button onClick={() => router.push("/select-character")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
            <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase" }}>ACTION ORDER</span>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#9ca3af", textTransform: "uppercase" }}>Fighter Profile</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>|</span>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: char.color, textTransform: "uppercase" }}>{char.name}</span>
          </div>
          <WalletSection />
        </div>

        {/* Main layout: left portrait | right content */}
        <div style={{ position: "absolute", top: 68, left: 0, right: 0, bottom: 0, display: "flex" }}>

          {/* ── Left: Portrait ── */}
          <div style={{ width: 340, position: "relative", flexShrink: 0, overflow: "hidden" }}>
            <img
              src={char.standingArt}
              alt={char.name}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
            />
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to right, transparent 50%, #050505 100%)` }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #050505 0%, transparent 40%)" }} />

            {/* Class badge */}
            <div style={{ position: "absolute", top: 24, left: 24, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 3, height: 20, background: char.color, borderRadius: 2 }} />
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: char.color, textTransform: "uppercase" }}>{char.className}</span>
            </div>

            {/* Name bottom */}
            <div style={{ position: "absolute", bottom: 32, left: 24 }}>
              <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: -1.5, color: "#f1f5f9", lineHeight: 1, textTransform: "uppercase" }}>{char.name}</div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: `${char.color}cc`, textTransform: "uppercase", marginTop: 4 }}>{char.className} Class</div>
            </div>
          </div>

          {/* ── Right: Stats + Abilities + Cards ── */}
          <div style={{ flex: 1, minHeight: 0, padding: "32px 64px 32px 48px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 28 }}>

            {/* Stats */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 3, color: "#475569", textTransform: "uppercase", marginBottom: 16 }}>Base Stats</div>
              <div style={{ display: "flex", gap: 24 }}>
                {STAT_META.map((s) => {
                  const pct = char[s.key];
                  return (
                    <div key={s.key} style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "16px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: s.color, textTransform: "uppercase" }}>{s.label}</span>
                        <span style={{ fontSize: 22, fontWeight: 900, color: "#f1f5f9" }}>{pct}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: s.color, boxShadow: `0 0 8px ${s.color}80`, transition: "width 0.6s ease" }} />
                      </div>
                      <div style={{ fontSize: 10, color: "#475569", marginTop: 8, lineHeight: 1.4 }}>{s.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Passive + Ultimate */}
            <div style={{ display: "flex", gap: 16 }}>
              {/* Passive */}
              {char.passive && (
                <div style={{ flex: 1, background: `${char.color}08`, border: `1px solid ${char.color}30`, borderRadius: 8, padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: `${char.color}20`, border: `1px solid ${char.color}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span className="material-icons not-italic" style={{ fontSize: 14, color: char.color }}>auto_awesome</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: "#475569", textTransform: "uppercase" }}>Passive Ability</div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: char.color, letterSpacing: 0.5, textTransform: "uppercase" }}>{char.passive.name}</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>{char.passive.description}</p>
                  <div style={{ marginTop: 10, display: "inline-block", padding: "3px 8px", background: "rgba(255,255,255,0.05)", borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: "#64748b", textTransform: "uppercase" }}>
                    Always Active
                  </div>
                </div>
              )}

              {/* Ultimate */}
              {char.ultimate && (
                <div style={{ flex: 1, background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 8, padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span className="material-icons not-italic" style={{ fontSize: 14, color: "#fbbf24" }}>whatshot</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: "#475569", textTransform: "uppercase" }}>Ultimate Move</div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "#fbbf24", letterSpacing: 0.5, textTransform: "uppercase" }}>{char.ultimate.name}</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>{char.ultimate.description}</p>
                  <div style={{ marginTop: 10, display: "inline-block", padding: "3px 8px", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: "#fbbf24", textTransform: "uppercase" }}>
                    {ULTIMATE_EFFECT_LABEL[char.ultimate.effect] ?? char.ultimate.effect}
                  </div>
                </div>
              )}
            </div>

            {/* Recommended Cards */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 3, color: "#475569", textTransform: "uppercase", marginBottom: 14 }}>Recommended Cards</div>
              <div style={{ display: "flex", gap: 12 }}>
                {topCards.map((card) => (
                  <div
                    key={card.id}
                    style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: `1px solid ${CARD_TYPE_COLOR[card.type]}30`, borderRadius: 8, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: CARD_TYPE_COLOR[card.type], textTransform: "uppercase" }}>{card.type}</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#e2e8f0", letterSpacing: 0.3 }}>{card.name}</div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>P{card.priority}</span>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>K{card.knock}</span>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>{card.energyCost}E</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.4, marginTop: 2 }}>{card.effect}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Taunts */}
            {char.taunts && char.taunts.length > 0 && (
              <div>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 3, color: "#475569", textTransform: "uppercase", marginBottom: 14 }}>Arena Taunts</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {char.taunts.map((taunt, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6 }}>
                      <span style={{ fontSize: 10, color: `${char.color}80`, marginTop: 1, flexShrink: 0 }}>"{}</span>
                      <span style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic", lineHeight: 1.5 }}>{taunt}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA */}
            <div style={{ display: "flex", gap: 12, paddingBottom: 8 }}>
              <button
                onClick={async () => {
                  selectCharacter(char);
                  startMatch();
                  if (playerRole !== null && matchId) {
                    await fetch(`/api/match/${matchId}`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ role: playerRole, characterId: char.id }),
                    });
                  }
                  router.push("/lobby");
                }}
                style={{
                  flex: 2, height: 50,
                  background: `linear-gradient(135deg, ${char.color}25, ${char.color}10)`,
                  border: `1.5px solid ${char.color}`,
                  borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                  fontWeight: 900, fontSize: 13, letterSpacing: 2.5,
                  color: char.color, textTransform: "uppercase",
                }}
              >
                SELECT THIS FIGHTER
              </button>
              <button
                onClick={() => router.back()}
                style={{ flex: 1, height: 50, background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12, letterSpacing: 1, color: "#6b7280", textTransform: "uppercase" }}
              >
                ← BACK
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
