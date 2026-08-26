// Parking a referral code from a shared link.
//
// Deliberately free of wagmi and of React. A link lands on the landing page,
// which is the entry point for every surface including ones where bundle size
// is watched closely, and reading a query string needs no wallet library. The
// half that spends the code lives in components/ReferralCapture.tsx, which does
// need wagmi and is mounted only in the web app tree.

/** Where the parked code is kept for the browser half to find. */
export const PENDING_KEY = "ao:pending-ref";

/** Cookie name, so the server can finish the job if the browser does not. */
export const REFERRAL_COOKIE = "ao_ref";

/** Long enough to survive verification and a first session, short enough that a
 *  stale code does not attach to a wallet months later. */
export const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingReferral = { code: string; at: number };

/** A code has to be plausible before it is worth keeping. */
function looksLikeCode(code: string | null | undefined): code is string {
  return Boolean(code && code.length >= 6 && code.length <= 32);
}

export function readParkedReferral(): string | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingReferral;
    if (!parsed?.code || Date.now() - parsed.at > PENDING_TTL_MS) {
      window.localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return parsed.code;
  } catch {
    return null;
  }
}

export function clearParkedReferral(): void {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage can be blocked; the cookie path still finishes the job.
  }
}

/**
 * Park whatever the link carried, then take it out of the URL so it is not
 * carried into shares, screenshots or the back button.
 */
export function parkReferralFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("ref")?.trim().toLowerCase();
    if (!looksLikeCode(code)) return;

    window.localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ code, at: Date.now() } satisfies PendingReferral),
    );
    // Also as a cookie, so the server can finish the job on its own — the
    // browser half only runs where ReferralCapture is mounted.
    document.cookie = `${REFERRAL_COOKIE}=${encodeURIComponent(code)}; path=/; max-age=${PENDING_TTL_MS / 1000}; samesite=lax`;

    url.searchParams.delete("ref");
    window.history.replaceState({}, "", url.toString());
  } catch {
    // A blocked storage or an exotic URL is not worth breaking the page for.
  }
}
