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
  enabled?: boolean;
  onCompactChange?: (compact: boolean) => void;
};

/**
 * Marks an element that already maps design coordinates onto the screen.
 *
 * The transform is what makes the game look landscape on a portrait phone, and
 * it must be applied exactly once between the viewport and the content. A
 * modal rendered inside the gameplay canvas is already carrying its ancestor's
 * transform, so applying its own on top rotates it a further 90° — upside down
 * — and squares the scale. The same modal opened on its own still needs one.
 * So the question is never "does this component scale", it is "has an ancestor
 * scaled already", and this attribute is how an element answers it.
 */
export const FRAME_ATTR = "data-ao-frame";

export function useGameFrameScale(
  wrapRef: RefObject<HTMLElement | null>,
  options: GameFrameScaleOptions = {},
): void {
  const { compactThreshold, enabled = true, onCompactChange } = options;
  const onCompactChangeRef = useRef(onCompactChange);

  useEffect(() => {
    onCompactChangeRef.current = onCompactChange;
  }, [onCompactChange]);

  useLayoutEffect(() => {
    if (!enabled) return;

    // Read from the parent so the element's own marker does not match. The
    // DOM position of a frame does not change while it is mounted, so this is
    // settled once rather than on every resize.
    const nested = Boolean(
      wrapRef.current?.parentElement?.closest(`[${FRAME_ATTR}]`),
    );
    wrapRef.current?.setAttribute(FRAME_ATTR, "");

    const scale = () => {
      const el = wrapRef.current;
      if (!el) return;

      const viewport = window.visualViewport;
      const vw = viewport?.width ?? window.innerWidth;
      const vh = viewport?.height ?? window.innerHeight;
      onCompactChangeRef.current?.(Math.min(vw, vh) <= (compactThreshold ?? 430));

      // Still worth reporting the compact flag above — that is a fact about the
      // viewport, not about this element's ancestry — but the transform itself
      // belongs to the ancestor that already applied it.
      if (nested) {
        el.style.transform = "";
        return;
      }

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
  }, [compactThreshold, enabled, wrapRef]);
}
