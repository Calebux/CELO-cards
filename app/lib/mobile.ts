"use client";

import { useEffect, useState } from "react";

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
