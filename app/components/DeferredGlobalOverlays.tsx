"use client";

import { useEffect, useState } from "react";

type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function DeferredGlobalOverlays({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const idleWindow = window as IdleWindow;

    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(() => setReady(true), { timeout: 1200 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }

    const timeout = window.setTimeout(() => setReady(true), 900);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!ready) return null;

  return <>{children}</>;
}
