"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { MiniPayImage } from "../components/MiniPayImage";
import { useGameStore } from "../lib/gameStore";
import { DESIGN_W, DESIGN_H } from "../lib/designConstants";
import { useGameFrameScale } from "../lib/mobile";

export default function GameAction() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  
  const { selectedCharacter, opponentCharacter } = useGameStore();

  useGameFrameScale(wrapRef);

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
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left", display: 'flex', justifyContent: 'center', alignItems: 'center', transform: "var(--ao-tr)" }}>
        <MiniPayImage 
          src="/new-assets/game-action-lite.webp" 
          alt="VS Action" 
          minipayWidth={1280}
          minipayQuality={48}
          priority
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
