"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { clearParkedReferral, readParkedReferral } from "../lib/referralPark";

export function ReferralCapture() {
  const { address, isConnected } = useAccount();
  const claiming = useRef(false);

  // Spend it once a wallet shows up. Parking happens separately — see
  // parkReferralFromUrl, which the landing page calls.
  useEffect(() => {
    if (!isConnected || !address || claiming.current) return;
    const code = readParkedReferral();
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
          clearParkedReferral();
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
