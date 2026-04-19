"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "../lib/gameStore";

const DESIGN_W = 1440;
const DESIGN_H = 823;

export default function GameAction() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  
  const { selectedCharacter, opponentCharacter } = useGameStore();

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

  useEffect(() => {
    // Automatically transition to the gameplay screen after the animation finishes
    // Assuming the GIF takes about 3 seconds
    const timer = setTimeout(() => {
      router.push("/gameplay");
    }, 3000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left", display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <img 
          src="/new addition/Game action.webp" 
          alt="VS Action" 
          style={{ 
            width: "100%", 
            height: "100%", 
            objectFit: "cover", 
            pointerEvents: "none" 
          }} 
        />
      </div>
    </div>
  );
}
