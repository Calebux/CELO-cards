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
      let s: number;
      let transform: string;
      if (isPortrait) {
        s = Math.min(vh / DESIGN_W, vw / DESIGN_H);
        transform = `translate(-50%, -50%) rotate(90deg) scale(${s})`;
      } else {
        s = Math.min(vw / DESIGN_W, vh / DESIGN_H);
        transform = `translate(-50%, -50%) scale(${s})`;
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
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "fixed", top: "50%", left: "50%", transformOrigin: "center center", display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
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
