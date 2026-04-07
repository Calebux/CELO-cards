"use client";

import { useEffect, useRef } from "react";

const BG_IMAGE = "https://www.figma.com/api/mcp/asset/e9b1584b-6919-44a5-a7af-7cc7c7b5645b";

const DESIGN_W = 1440;
const DESIGN_H = 823;

export default function GamePage() {
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const scale = () => {
            if (!wrapRef.current) return;
            const s = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
            wrapRef.current.style.transform = `scale(${s})`;
        };
        scale();
        window.addEventListener("resize", scale);
        return () => window.removeEventListener("resize", scale);
    }, []);

    return (
        <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#000" }}>
            <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, transformOrigin: "top left", position: "relative" }}>
                <img src={BG_IMAGE} alt="Battle background" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
            </div>
        </div>
    );
}
