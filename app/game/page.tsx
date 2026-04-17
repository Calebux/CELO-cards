"use client";

import { useEffect, useRef } from "react";

const BG_IMAGE = "/new addition/gameplay landing page.webp";

const DESIGN_W = 1440;
const DESIGN_H = 823;

export default function GamePage() {
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const scale = () => {
            if (!wrapRef.current) return;
            const w = window.innerWidth;
            const h = window.innerHeight;
            const s = Math.min(w / DESIGN_W, h / DESIGN_H);
            wrapRef.current.style.transform = `scale(${s})`;
        };
        scale();
        window.addEventListener("resize", scale);
        return () => window.removeEventListener("resize", scale);
    }, []);

    return (
        <div style={{ width: "100vw", height: "100vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
            <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, transformOrigin: "center", flexShrink: 0, position: "relative" }}>
                <img src={BG_IMAGE} alt="Battle background" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
            </div>
        </div>
    );
}
