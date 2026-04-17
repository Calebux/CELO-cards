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
            const scaledW = DESIGN_W * s;
            const scaledH = DESIGN_H * s;
            wrapRef.current.style.transform = `translate(${(w - scaledW) / 2}px, ${(h - scaledH) / 2}px) scale(${s})`;
        };
        scale();
        window.addEventListener("resize", scale);
        return () => window.removeEventListener("resize", scale);
    }, []);

    return (
        <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#000" }}>
            <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left" }}>
                <img src={BG_IMAGE} alt="Battle background" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
            </div>
        </div>
    );
}
