"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { DESIGN_H, DESIGN_W } from "./designConstants";

function readMobileViewportSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 1024px), (pointer: coarse)").matches;
}

export function useMobileViewportMode(): boolean {
  const [mobileViewport, setMobileViewport] = useState<boolean>(() => readMobileViewportSnapshot());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 1024px), (pointer: coarse)");
    const sync = () => setMobileViewport(media.matches);
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  return mobileViewport;
}

type GameFrameScaleOptions = {
  compactThreshold?: number;
  onCompactChange?: (compact: boolean) => void;
};

export function useGameFrameScale(
  wrapRef: RefObject<HTMLElement | null>,
  options: GameFrameScaleOptions = {},
): void {
  const { compactThreshold, onCompactChange } = options;
  const onCompactChangeRef = useRef(onCompactChange);

  useEffect(() => {
    onCompactChangeRef.current = onCompactChange;
  }, [onCompactChange]);

  useLayoutEffect(() => {
    const scale = () => {
      const el = wrapRef.current;
      if (!el) return;

      const viewport = window.visualViewport;
      const vw = viewport?.width ?? window.innerWidth;
      const vh = viewport?.height ?? window.innerHeight;
      onCompactChangeRef.current?.(Math.min(vw, vh) <= (compactThreshold ?? 430));

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
      el.style.transform = transform;
    };

    scale();
    const viewport = window.visualViewport;
    window.addEventListener("resize", scale);
    window.addEventListener("orientationchange", scale);
    viewport?.addEventListener("resize", scale);
    viewport?.addEventListener("scroll", scale);
    return () => {
      window.removeEventListener("resize", scale);
      window.removeEventListener("orientationchange", scale);
      viewport?.removeEventListener("resize", scale);
      viewport?.removeEventListener("scroll", scale);
    };
  }, [compactThreshold, wrapRef]);
}
