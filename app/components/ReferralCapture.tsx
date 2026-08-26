"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";

/**
 * Turns a shared link into a referral.
 *
 * Someone arriving on `/?ref=abc12xyz` has not connected a wallet yet, so the
 * code cannot be applied on the spot. It is parked in storage and spent the
 * moment an address appears — which may be minutes later, after they have
 * played the free matches.
 *
 * Mounted from app/providers.tsx only, so it exists on web and mobile web and
 * never in the MiniPay tree, where referrals are deliberately switched off.
 */
const PENDING_KEY = "ao:pending-ref";
/** Long enough to survive verification and a first session, short enough that a
 *  stale code does not attach to a wallet months later. */
const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Pending = { code: string; at: number };

function readPending(): string | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Pending;
    if (!parsed?.code || Date.now() - parsed.at > PENDING_TTL_MS) {
      window.localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return parsed.code;
  } catch {
    return null;
  }
}

/**
 * Park whatever the link carried, then take it out of the URL so it is not
 * carried into shares, screenshots or the back button.
 *
 * Deliberately free of wagmi: shared links land on the landing page, which
 * mounts its wallet providers per-component rather than as a page-wide tree,
 * so a hook-based catcher would never run there. Reading a query string needs
 * none of that.
 */
export function parkReferralFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("ref")?.trim().toLowerCase();
    if (!code || code.length < 6 || code.length > 32) return;

    window.localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ code, at: Date.now() } satisfies Pending),
    );
    url.searchParams.delete("ref");
    window.history.replaceState({}, "", url.toString());
  } catch {
    // A blocked storage or an exotic URL is not worth breaking the page for.
  }
}

export function ReferralCapture() {
  const { address, isConnected } = useAccount();
  const claiming = useRef(false);

  // Spend it once a wallet shows up. Parking happens separately — see
  // parkReferralFromUrl, which the landing page calls.
  useEffect(() => {
    if (!isConnected || !address || claiming.current) return;
    const code = readPending();
    if (!code) return;

    claiming.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/referral", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, code }),
        });
        // Clear on success and on every refusal the server can give — a code
        // that is invalid, self-referring or already used will never succeed,
        // and retrying it on every page load helps nobody.
        if (res.ok || res.status === 409 || res.status === 400) {
          window.localStorage.removeItem(PENDING_KEY);
        }
      } catch {
        // Network blip: leave it parked and try again next mount.
      } finally {
        claiming.current = false;
      }
    })();
  }, [address, isConnected]);

  return null;
}
