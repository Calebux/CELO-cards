"use client";

import { useEffect, useState } from "react";

type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function scheduleIdle(callback: () => void, timeout = 1200): () => void {
  if (typeof window === "undefined") return () => {};

  const idleWindow = window as IdleWindow;
  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(() => callback(), { timeout });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, Math.min(timeout, 900));
  return () => window.clearTimeout(handle);
}

function readPageVisibleSnapshot(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

export function usePageVisibility(): boolean {
  const [visible, setVisible] = useState<boolean>(() => readPageVisibleSnapshot());

  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => setVisible(readPageVisibleSnapshot());
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
    };
  }, []);

  return visible;
}

export function useIdleReady(enabled = true, timeout = 1200): boolean {
  const [ready, setReady] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }
    setReady(false);
    return scheduleIdle(() => setReady(true), timeout);
  }, [enabled, timeout]);

  return ready;
}
