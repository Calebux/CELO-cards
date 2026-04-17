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

  useEffect(() => {
    // Automatically transition to the gameplay screen after the animation finishes
    // Assuming the GIF takes about 3 seconds
    const timer = setTimeout(() => {
      router.push("/gameplay");
    }, 3000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#000", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, transformOrigin: "top left", position: "relative", display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
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
