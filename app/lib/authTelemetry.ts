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
  /** How long the attempt took. The resume competes with the user's patience. */
  durationMs?: number;
};

/**
 * Report how long a session resume took, including successful ones.
 *
 * The complaint is not that resume fails — it is that it finishes after the
 * user has already given up and tapped SIGN IN. Only timings on real devices
 * can say whether that gap is two seconds or twelve, and therefore whether
 * shaving the SDK download is enough or the approach has to change.
 */
export function reportResumeTiming(ok: boolean, durationMs: number): void {
  postReport({
    stage: "resume",
    reason: ok ? "resume-ok" : "resume-gave-up",
    device: deviceClass(),
    redirectMode: isRedirectModeDevice(),
    durationMs: Math.max(0, Math.round(durationMs)),
  });
}

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
  // Must come before the network test: a plan/subscription rejection often
  // surfaces as "could not fetch ...", and calling that a network fault sends
  // you debugging connectivity when the real fix is in the Web3Auth dashboard.
  // Requesting a sessionTime the Base plan does not allow failed exactly this
  // way (error 1003) and reached users as "can't fetch Google API".
  if (/1003|subscription|plan |not allowed|unauthorized client/.test(message)) return "subscription";
  // Must also precede the network test. googleapis.com being unreachable is a
  // specific, actionable failure — the user can sign in with email instead —
  // and it looks nothing like a general connectivity problem in the fix it needs.
  if (/googleapis|googleusercontent|accounts\.google/.test(message)) return "google-unreachable";
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
  const reason = classifyAuthError(err);
  // User cancellation is a choice, not a fault — recording it would drown the
  // real failures.
  if (reason === "user-cancelled") return;
  postReport({
    stage,
    reason,
    device: deviceClass(),
    redirectMode: isRedirectModeDevice(),
  });
}

function postReport(body: AuthFailureReport): void {
  try {
    if (typeof window === "undefined") return;
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
