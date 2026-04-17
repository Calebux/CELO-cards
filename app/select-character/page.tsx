"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "../lib/gameStore";
import { CHARACTERS } from "../lib/gameData";
import { WalletSection } from "../components/WalletSection";

const BG = "/new-assets/two-fighters-vs.png";

// Grey filler portraits for locked slots — use local assets so they never break
const GREY_PORTRAITS = [
  "/Characters standing/Whisk_19475fe609c83ad99cb4dd1553b8093edr.webp",
  "/Characters standing/Whisk_33ea37eab366d43891d436152d920497dr.webp",
  "/Characters standing/Whisk_gdzlldmlhtm3e2nh1ymmfwotadmjrtlkzmm20sy.webp",
  "/Characters standing/Whisk_9a87489a13c392485344f4c75994d511eg.webp",
  "/Characters standing/Whisk_7338ae2d54853d69dbd43da6240ebd8eeg.webp",
  "/characters/characters /Whisk_5edzhrtn5qtokzdotqwoxgtl4ydm00cn2cdmtqj 1.webp",
  "/Two fighters/standing 2.webp",
  "/characters/fighter.webp",
  "/Characters standing/Whisk_19475fe609c83ad99cb4dd1553b8093edr.webp",
  "/Characters standing/Whisk_33ea37eab366d43891d436152d920497dr.webp",
];

const STAT_META = [
  { key: "knockStat" as const, icon: "gavel", label: "Knock", color: "#f87171" },
  { key: "priorityStat" as const, icon: "speed", label: "Priority", color: "#60a5fa" },
  { key: "drainStat" as const, icon: "bolt", label: "Drain", color: "#4ade80" },
];

const DESIGN_W = 1440;
const DESIGN_H = 823;

export default function SelectCharacter() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [timer, setTimer] = useState(44);
  const router = useRouter();
  const { selectCharacter, startMatch, playerAddress, playerRole, matchId } = useGameStore();

  const activeChar = CHARACTERS[selectedIdx] || CHARACTERS[0];

  // Build the 15-slot grid: 5 real characters + 10 grey locked
  const gridSlots = [
    ...CHARACTERS.map((c, i) => ({ src: c.portrait, grey: false, charIdx: i, isLocked: c.isLocked })),
    ...GREY_PORTRAITS.map((src) => ({ src, grey: true, charIdx: -1, isLocked: true })),
  ];

  useEffect(() => {
    const scale = () => {
      if (!wrapRef.current) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const s = Math.min(w / DESIGN_W, h / DESIGN_H);
      const offsetX = Math.max(0, (w - DESIGN_W * s) / 2);
      wrapRef.current.style.transform = `translateX(${offsetX}px) scale(${s})`;
    };
    scale();
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (timer <= 0) return;
    const t = setInterval(() => setTimer((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, [timer]);

  const handleLock = async () => {
    selectCharacter(activeChar);
    startMatch();
    if (playerRole !== null && matchId) {
      await fetch(`/api/match/${matchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: playerRole, characterId: activeChar.id }),
      });
    }
    router.push("/lobby");
  };

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#050505", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, transformOrigin: "top left", position: "relative" }}>

        {/* Background */}
        <div className="absolute inset-0">
          <img src={BG} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
          <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.8)" }} />
        </div>


        {/* ── Top Bar ── */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(86,164,203,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,5,5,0.7)", zIndex: 10 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
            <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #56a4cb, #b9e7f4)", borderRadius: 2 }} />
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#b9e7f4", textTransform: "uppercase", fontFamily: "var(--font-space-grotesk), sans-serif" }}>ACTION ORDER</span>
          </button>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#9ca3af", textTransform: "uppercase" }}>SELECT FIGHTER</div>
          <WalletSection />
        </div>

        {/* ── Left: Player Preview Panel ───────────────────────── */}
        <div className="absolute flex flex-col gap-[16.875px]"
          style={{ left: "7.15%", right: "78%", top: "calc(50% - 8.6px)", transform: "translateY(-50%)", height: 623.8 }}>

          {/* Character portrait card — shows standing art */}
          <style>{`
            @keyframes charStandIn {
              from { opacity: 0; transform: translateY(28px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0px) scale(1); }
            }
            @keyframes selGlow {
              0%,100% { box-shadow: 0 0 16px 2px var(--sc-color, #b9e7f4), 0 0 4px 0 var(--sc-color, #b9e7f4); }
              50%     { box-shadow: 0 0 28px 6px var(--sc-color, #b9e7f4), 0 0 8px 2px var(--sc-color, #b9e7f4); }
            }
            .sc-card { transition: transform 0.15s ease, box-shadow 0.15s ease; }
            .sc-card:hover:not([disabled]) { transform: scale(1.06); }
            .sc-card-selected { animation: selGlow 1.8s ease-in-out infinite; }
          `}</style>
          <div className="relative flex-1 overflow-hidden rounded-[8.438px] border-[1.406px] p-[1.406px]"
            style={{ borderColor: activeChar.color, boxShadow: `0 0 24px ${activeChar.color}40`, transition: "border-color 0.3s ease, box-shadow 0.3s ease" }}>
            <div className="absolute inset-0" style={{ backgroundColor: "#0a060e" }} />
            <img
              key={selectedIdx}
              src={activeChar.standingArt}
              alt={activeChar.name}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{
                objectFit: "cover",
                objectPosition: "center top",
                animation: "charStandIn 0.45s cubic-bezier(0.22,1,0.36,1) forwards",
              }}
            />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, #0a060e 0%, rgba(10,6,14,0.2) 40%, transparent 70%)" }} />
            <div className="absolute left-[16.88px] right-[16.88px] bottom-[16.88px]">
              <p className="font-bold uppercase" style={{ fontSize: 8.438, letterSpacing: 2.53, color: activeChar.color }}>{activeChar.className} Class</p>
              <p className="font-bold text-[#f1f5f9]" style={{ fontSize: 25.3, letterSpacing: -1.27, lineHeight: "28px" }}>{activeChar.name}</p>
            </div>
          </div>

          {/* Passive module */}
          {activeChar.passive && (
            <div className="rounded-[8.438px] border-[0.703px] shrink-0 p-[11.953px] flex flex-col gap-[5.625px]"
              style={{ backgroundColor: "#1a0f2e", borderColor: `${activeChar.color}40` }}>
              <div className="flex items-center gap-[5.625px]">
                <span className="material-icons not-italic" style={{ fontSize: 8.438, color: activeChar.color }}>auto_awesome</span>
                <span className="font-bold uppercase" style={{ fontSize: 7.5, letterSpacing: 1.5, color: activeChar.color }}>{activeChar.passive.name}</span>
                <span className="font-bold uppercase" style={{ fontSize: 6.5, letterSpacing: 1, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>PASSIVE</span>
              </div>
              <span style={{ fontSize: 7.5, color: "rgba(255,255,255,0.55)", lineHeight: "11px" }}>{activeChar.passive.description}</span>
            </div>
          )}

          {/* Stats module — dynamic */}
          <div className="rounded-[8.438px] border-[0.703px] border-[rgba(185,231,244,0.1)] shrink-0 p-[11.953px] flex flex-col gap-[11.25px]" style={{ backgroundColor: "#222f42" }}>
            {STAT_META.map((s) => {
              const pct = activeChar[s.key];
              return (
                <div key={s.label} className="flex flex-col gap-[2.813px]">
                  <div className="flex items-center justify-between" style={{ height: 11.25 }}>
                    <div className="flex items-center gap-[2.813px]">
                      <span className="material-icons not-italic" style={{ fontSize: 8.438, color: s.color, lineHeight: "11.25px" }}>{s.icon}</span>
                      <span className="font-bold uppercase" style={{ fontSize: 8.438, color: s.color, letterSpacing: 0.84 }}>{s.label}</span>
                    </div>
                    <span className="font-bold uppercase text-[#f1f5f9]" style={{ fontSize: 8.438, letterSpacing: 0.84 }}>{pct}%</span>
                  </div>
                  <div className="relative rounded-full overflow-hidden" style={{ height: 4.219, backgroundColor: "rgba(255,255,255,0.05)" }}>
                    <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: activeChar.color, boxShadow: `0px 0px 5.625px 0px ${activeChar.color}80` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Centre: Character Grid ───────────────────────────── */}
        <div className="absolute flex flex-col gap-[0.007px] items-center justify-center"
          style={{ left: "calc(50% - 14.5px)", transform: "translateX(-50%)", top: 91, bottom: 108, width: 637, zIndex: 2 }}>

          <div className="relative overflow-hidden rounded-[11.25px] border-[0.703px] border-[rgba(255,255,255,0.05)] shrink-0"
            style={{ width: "100%", height: 491, backgroundColor: "rgba(25,16,34,0.3)" }}>
            <div className="absolute" style={{ inset: "0.13px -71.44px 0.46px 0.03px", opacity: 0.2, background: "radial-gradient(ellipse at center, rgba(140,37,244,0.4) 0%, transparent 70%)" }} />

            <div className="absolute grid gap-[11.25px] p-[16.88px]"
              style={{ gridTemplateColumns: "repeat(5, 107px)", gridTemplateRows: "repeat(3, 141px)", top: 0, left: 0 }}>
              {gridSlots.map((c, i) => {
                const isSel = selectedIdx === c.charIdx && !c.isLocked;
                return (
                  <button
                    key={i}
                    onClick={() => !c.isLocked && setSelectedIdx(c.charIdx)}
                    className={`relative overflow-hidden rounded-[5.625px] border-[1.406px] cursor-pointer sc-card${isSel ? " sc-card-selected" : ""}`}
                    style={{
                      width: 107, height: 141,
                      borderColor: isSel ? activeChar.color : "transparent",
                      backgroundColor: isSel ? "rgba(255,255,255,0)" : "#222f42",
                      // @ts-expect-error css custom property
                      "--sc-color": activeChar.color,
                      padding: 1.406,
                      opacity: c.isLocked ? 0.4 : 1,
                      pointerEvents: c.isLocked ? "none" : "auto",
                    }}
                  >
                    <img
                      src={c.src}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                      style={{ filter: c.isLocked ? "grayscale(1)" : "none" }}
                    />
                    <div className="absolute inset-0" style={{ backgroundColor: isSel ? "rgba(185,231,244,0.2)" : "rgba(0,0,0,0.4)", mixBlendMode: isSel ? "overlay" : "normal" }} />
                    {isSel && (
                      <span className="material-icons absolute not-italic text-[#b9e7f4]" style={{ fontSize: 12.656, top: 5.63, right: 5.17 }}>
                        check_circle
                      </span>
                    )}
                    {c.isLocked && (
                      <span className="material-icons absolute not-italic text-white/30" style={{ fontSize: 18, top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
                        lock
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Awaiting Status */}
          <div className="flex flex-col items-center gap-[5.625px] pt-[22.5px]">
            <span className="font-bold uppercase text-center" style={{ fontSize: 7.031, letterSpacing: 2.8125, color: "rgba(255,255,255,0.4)" }}>
              Select Your Fighter
            </span>
            <div className="flex gap-[5.625px] items-center">
              <div className="rounded-full bg-[#b9e7f4]" style={{ width: 4.219, height: 4.219 }} />
              <div className="rounded-full bg-[#b9e7f4]" style={{ width: 4.219, height: 4.219 }} />
              <div className="rounded-full" style={{ width: 4.219, height: 4.219, backgroundColor: "rgba(185,231,244,0.3)" }} />
            </div>
          </div>
        </div>

        {/* ── Right: Opponent Status Panel ─────────────────────── */}
        <div className="absolute overflow-hidden rounded-[8.438px] border-[0.703px] border-[rgba(255,255,255,0.1)]"
          style={{ left: "75.49%", right: "9.67%", top: "calc(50% - 8.6px)", transform: "translateY(-50%)", height: 623.8 }}>
          <div className="absolute" style={{ inset: "-77.8px -26.54px", background: "radial-gradient(ellipse at center, rgba(86,164,203,0.15) 0%, transparent 70%)" }} />
          <div className="absolute inset-0" style={{ backdropFilter: "blur(4.219px)", backgroundColor: "rgba(185,231,244,0.05)" }} />

          <div className="absolute flex items-center gap-[5.625px]" style={{ top: 11.25, right: 11.25 }}>
            <span className="font-bold uppercase" style={{ fontSize: 7.031, letterSpacing: 0.703, color: "rgba(255,255,255,0.6)" }}>Latency</span>
            <span className="font-bold text-[#b9e7f4]" style={{ fontSize: 7.031 }}>24ms</span>
          </div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ marginTop: -5.63 }}>
            <span className="font-bold uppercase tracking-[1.6875px] text-center" style={{ fontSize: 16.875, color: "rgba(255,255,255,0.9)" }}>
              Selecting...
            </span>
          </div>

          <div className="absolute flex items-center justify-center" style={{ left: 78.05, top: 221.2, width: 56.25, height: 56.25 }}>
            <span className="material-icons not-italic text-[#b9e7f4]" style={{ fontSize: 25.313 }}>visibility_off</span>
          </div>

          <div className="absolute" style={{ left: 39.52, top: 316.82 }}>
            <span className="font-bold uppercase text-[#b9e7f4]" style={{ fontSize: 8.438, letterSpacing: 0.844 }}>
              Opponent: Waiting...
            </span>
          </div>

          <div className="absolute flex flex-col gap-[8.438px]" style={{ left: 38.67, top: 333.7 + 33.75, opacity: 0.3 }}>
            {[135, 101.25, 112.5].map((w, i) => (
              <div key={i} className="rounded-full" style={{ height: 5.625, width: w, backgroundColor: "rgba(255,255,255,0.1)" }} />
            ))}
          </div>
        </div>

        {/* ── Footer Action Bar ────────────────────────────────── */}
        <div className="absolute flex items-center border-t"
          style={{
            top: 732, left: "calc(50% - 17.5px)", transform: "translateX(-50%)",
            width: 1197, height: 83,
            backgroundColor: "#222f42",
            backdropFilter: "blur(12px)",
            borderColor: "rgba(140,37,244,0.2)",
          }}>

          <div className="absolute" style={{ left: 192, right: 192, top: "50%", transform: "translateY(-50%)", height: 91.753 }}>

            {/* Left: step + selected unit */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center gap-3">
              <div className="flex items-center justify-center rounded-full border border-[#b9e7f4] shrink-0" style={{ width: 32, height: 32 }}>
                <span className="font-bold text-[#b9e7f4] text-center" style={{ fontSize: 12 }}>1</span>
              </div>
              <div className="flex flex-col">
                <span className="font-bold uppercase" style={{ fontSize: 10, letterSpacing: 1, color: "rgba(255,255,255,0.5)" }}>Selected Unit</span>
                <span className="font-bold text-[#f1f5f9]" style={{ fontSize: 14, letterSpacing: -0.35 }}>{activeChar.name}</span>
              </div>
            </div>

            {/* Centre: Lock Selection button */}
            <div className="absolute" style={{ left: 256, top: "50%", transform: "translateY(-50%)", width: 300 }}>
              <button className="ko-btn ko-btn-primary w-full h-[54px]" onClick={() => void handleLock()}>
                <span className="ko-btn-text font-bold uppercase text-white" style={{ fontSize: 20, letterSpacing: 2 }}>Lock Selection</span>
                <span className="material-icons ko-btn-icon not-italic text-white" style={{ fontSize: 24 }}>arrow_forward_ios</span>
              </button>
            </div>

            {/* Right: timer */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="font-bold uppercase text-right" style={{ fontSize: 10, letterSpacing: 1, color: "rgba(255,255,255,0.5)" }}>Time Remaining</span>
                <span className="font-bold text-[#b9e7f4] text-right" style={{ fontSize: 20, fontFamily: "monospace" }}>00:{timer.toString().padStart(2, "0")}</span>
              </div>
              <div className="flex items-center justify-center rounded-full border border-[#b9e7f4] shrink-0" style={{ width: 32, height: 32 }}>
                <span className="material-icons not-italic text-[#b9e7f4] text-right" style={{ fontSize: 14 }}>timer</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
