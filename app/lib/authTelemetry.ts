// Client-side reporting of sign-in failures.
//
// Every auth bug so far has been diagnosed by reading code and guessing, because
// a failed sign-in leaves no trace anywhere — the user just says "it didn't
// work". This records enough to tell failure modes apart (which step, what
// error, what kind of device) without collecting anything about the person:
// no wallet address, no email, no raw user-agent.

export type AuthFailureStage =
  | "sign-in"        // user tapped SIGN IN and it failed
  | "resume"         // restoring a session after an OAuth redirect
  | "init";          // the SDK itself failed to load or initialise

export type AuthFailureReport = {
  stage: AuthFailureStage;
  /** Normalised reason, not the raw message — see classifyAuthError. */
  reason: string;
  device: string;
  /** Redirect vs popup decides which whole code path ran. */
  redirectMode: boolean;
};

/** Coarse device class. Deliberately not the full UA string. */
export function deviceClass(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (touchMac) return "ios-desktop-mode"; // iPad, or iPhone requesting desktop
  if (/iPhone|iPod/.test(ua)) return "iphone";
  if (/iPad/.test(ua)) return "ipad";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh/.test(ua)) return "mac";
  if (/Windows/.test(ua)) return "windows";
  return "other";
}

export function isRedirectModeDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(ua) || touchMac;
}

/**
 * Bucket an error into a comparable reason. Raw messages vary by browser and
 * SDK version, so counting them directly makes every failure look unique.
 */
export function classifyAuthError(err: unknown): string {
  const message = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (!message) return "unknown";
  if (/timeout/.test(message)) return "init-timeout";
  if (/reject|denied|cancel/.test(message)) return "user-cancelled";
  if (/popup/.test(message)) return "popup-blocked";
  if (/network|fetch|load|chunk/.test(message)) return "network";
  if (/not available in minipay/.test(message)) return "minipay-unsupported";
  if (/client_?id|not configured/.test(message)) return "misconfigured";
  if (/already|pending|progress/.test(message)) return "connector-busy";
  return "other";
}

/**
 * Fire-and-forget. Never throws and never blocks a sign-in path — telemetry
 * failing must not become another reason someone can't log in.
 */
export function reportAuthFailure(stage: AuthFailureStage, err: unknown): void {
  try {
    if (typeof window === "undefined") return;
    const body: AuthFailureReport = {
      stage,
      reason: classifyAuthError(err),
      device: deviceClass(),
      redirectMode: isRedirectModeDevice(),
    };
    // User cancellation is a choice, not a fault — recording it would drown the
    // real failures.
    if (body.reason === "user-cancelled") return;

    const payload = JSON.stringify(body);
    // sendBeacon survives the page navigating away, which matters because the
    // redirect flow is exactly when this fires.
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/auth-telemetry", new Blob([payload], { type: "application/json" }));
      return;
    }
    void fetch("/api/auth-telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never let reporting break sign-in.
  }
}
