"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { isMiniPay } from "../lib/minipay";
import { useGoodDollarStatus } from "../lib/useGoodDollarStatus";
import { VerifyButton } from "./VerifyButton";

const SNOOZE_KEY = "ao:reverify-snoozed-at";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const ACCENT = "#00C58E";

/**
 * Tells a player whose G$ Verification has lapsed that they need to renew it.
 *
 * Distinct from VerifyPromptModal, which pitches verification to someone who has
 * never done it. A lapsed player already knows what verification is and already
 * had the benefits — they need to hear that they lost them and that renewing is
 * one tap, not a first-time sales pitch about free G$.
 *
 * Unlike the twin case (already verified on another wallet, where re-verifying
 * can only fail), renewing after expiry is the normal supported flow, so the
 * ordinary VerifyButton is the right CTA here.
 *
 * Snoozed rather than permanently dismissed: while lapsed they cannot claim
 * daily G$ or their winnings, so it is worth asking again in a few days.
 */
export function ReverifyModal() {
  const { address, isConnected } = useAccount();
  const status = useGoodDollarStatus();
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // MiniPay has no verify/claim step — same carve-out as VerifyPromptModal.
    if (isMiniPay()) return;
    if (!isConnected || !address) return;
    if (status?.status !== "expired") return;
    try {
      const snoozedAt = Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0);
      if (snoozedAt && Date.now() - snoozedAt < SNOOZE_MS) return;
    } catch {}

    const timer = window.setTimeout(() => setShow(true), 1200);
    return () => window.clearTimeout(timer);
  }, [address, isConnected, status?.status]);

  // Renewing navigates away and back; if they return verified, stop asking.
  useEffect(() => {
    if (status?.status === "verified") setShow(false);
  }, [status?.status]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {}
    setShow(false);
  };

  if (!show) return null;

  // Only shown when it is genuinely in the past. Some wallets carry an
  // authentication record with an expiry still ahead of them — a verification
  // that never completed reads the same as a lapsed one — and telling those
  // players they "expired" on a future date would be nonsense.
  const expiredOn =
    status?.expiresAt && status.expiresAt < Date.now()
      ? new Date(status.expiresAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      : null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 320,
        backgroundColor: "rgba(5,5,16,0.88)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        style={{
          width: "min(430px, 92vw)",
          background: "linear-gradient(180deg, #0b1220 0%, #050510 100%)",
          border: `1.5px solid ${ACCENT}55`,
          borderRadius: 12,
          padding: "30px 28px 24px",
          fontFamily: "var(--font-space-grotesk), sans-serif",
          boxShadow: `0 0 40px ${ACCENT}22`,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.5, color: ACCENT, textTransform: "uppercase", marginBottom: 8 }}>
          Verification expired
        </div>
        <h2 style={{ margin: 0, fontSize: 25, fontWeight: 900, color: "#fff", lineHeight: 1.2 }}>
          Time to renew
        </h2>
        <p style={{ margin: "10px 0 16px", fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>
          Your <strong style={{ color: ACCENT }}>G$ Verified</strong> status has run out
          {expiredOn ? <> — it lapsed on {expiredOn}</> : null}. G$ verification lasts about
          six months, then needs renewing.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
          {[
            ["Daily G$", "Paused until you renew."],
            ["Winnings", "Bounty and House prizes need a verified wallet to pay out."],
            ["Renewing", "Same one-minute check. Your progress and points are untouched."],
          ].map(([title, body]) => (
            <div key={title} style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <div style={{
                width: 25, height: 25, borderRadius: "50%", flexShrink: 0,
                background: `${ACCENT}22`, border: `1px solid ${ACCENT}66`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, color: ACCENT,
              }}>•</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#e2e8f0", lineHeight: 1.3 }}>{title}</div>
                <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>{body}</div>
              </div>
            </div>
          ))}
        </div>

        {error ? (
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "#f87171", lineHeight: 1.4 }}>{error}</p>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <VerifyButton label="Renew now" onError={setError} style={{ flex: 1 }} />
          <button
            onClick={dismiss}
            style={{
              background: "transparent", border: "none", padding: "12px 4px",
              cursor: "pointer", fontFamily: "inherit", fontSize: 12,
              fontWeight: 700, color: "#64748b", letterSpacing: 0.5,
            }}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
