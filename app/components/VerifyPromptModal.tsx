"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useGameStore } from "../lib/gameStore";
import { isMiniPay } from "../lib/minipay";
import { GDOLLAR_CONNECT_WALLET_DOCS } from "../lib/gooddollar";
import { useGoodDollarStatus } from "../lib/useGoodDollarStatus";
import { VerifyButton } from "./VerifyButton";
import {
  BOUNTY_MIN_POINTS_TO_WIN,
  BOUNTY_PARTICIPATION_POOL_USD,
  BOUNTY_POOL_USD,
  formatGdollar,
} from "../lib/bountyConfig";

const SEEN_KEY = "ao:verify-prompt-seen";
const ACCENT = "#00C58E";

/**
 * Offers GoodDollar verification once a player has a username.
 *
 * Verification is the first onboarding step and the least discoverable one —
 * it lives on Profile, and only 18% of real wallets have completed it. This
 * surfaces it right after signup while momentum is high, and also catches the
 * existing unverified players, who are the larger group.
 *
 * Deliberately NOT blocking. Verification is a face scan on a third-party site
 * and a full redirect away from the game; demanding it from someone who has not
 * played a match yet loses them entirely. The job here is to explain the payoff
 * and make it one tap — VerifyButton covers the moments of real need elsewhere.
 */
export function VerifyPromptModal() {
  const { address, isConnected } = useAccount();
  const playerName = useGameStore((s) => s.playerName);
  const status = useGoodDollarStatus();
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // MiniPay has no verify/claim step at all — the wallet flow differs and the
    // treasury covers on-chain entries there (see getOnboardingSteps).
    if (isMiniPay()) return;
    if (!isConnected || !address) return;
    // Only once they have a name: before that the username modal owns the screen.
    if (!playerName) return;
    // Only for players who have never verified. Someone whose verification
    // lapsed also reads as unverified, but this modal's copy is a first-time
    // pitch — ReverifyModal owns that case, and both firing at once would stack
    // two dialogs on one player. undefined means the chain read is still in
    // flight; do not flash this at someone who turns out to be verified.
    if (status?.status !== "never") return;
    try {
      if (window.localStorage.getItem(SEEN_KEY) === "1") return;
    } catch {}

    // Let the username modal finish its own close animation first.
    const timer = window.setTimeout(() => setShow(true), 1200);
    return () => window.clearTimeout(timer);
  }, [address, isConnected, playerName, status?.status]);

  // Verifying navigates away and back; if they return verified, never re-ask.
  useEffect(() => {
    if (status?.status === "verified") setShow(false);
  }, [status?.status]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    setShow(false);
  };

  if (!show) return null;

  const total = BOUNTY_POOL_USD + BOUNTY_PARTICIPATION_POOL_USD;

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
          background: "linear-gradient(160deg, rgba(10,20,16,0.99), rgba(8,12,20,0.99))",
          border: `1.5px solid ${ACCENT}55`,
          borderRadius: 12,
          padding: "30px 28px 24px",
          fontFamily: "var(--font-space-grotesk), sans-serif",
          boxShadow: `0 0 40px ${ACCENT}22`,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.5, color: ACCENT, textTransform: "uppercase", marginBottom: 8 }}>
          One more step
        </div>
        <h2 style={{ margin: 0, fontSize: 25, fontWeight: 900, color: "#fff", lineHeight: 1.2 }}>
          You&apos;re in{playerName ? `, ${playerName}` : ""} 👋
        </h2>
        <p style={{ margin: "10px 0 12px", fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>
          Get <strong style={{ color: ACCENT }}>G$ Verified</strong> once to unlock{" "}
          <strong style={{ color: ACCENT }}>free G$ every day</strong>.
          That pays for your Season Pass — so you can compete without spending your own money.
        </p>

        {/* Verification is one-per-person, not one-per-wallet: anyone already G$
            Verified elsewhere gets rejected as a duplicate if they try again,
            and the only way through is linking that wallet to this one. Said up
            front because the rejection itself explains none of this. */}
        <p style={{ margin: "0 0 18px", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
          Already G$ Verified on another wallet? You can&apos;t verify twice —{" "}
          <a
            href={GDOLLAR_CONNECT_WALLET_DOCS}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#94a3b8", textDecoration: "underline" }}
          >
            link that wallet to this one
          </a>{" "}
          instead.
        </p>

        {/* The chain, in the order they'll actually experience it. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
          {[
            ["1", "Verify once", "Takes a minute. Lasts 6 months."],
            ["2", "Claim G$ daily", "Free, every single day."],
            ["3", "Buy a Season Pass", "100 G$ — your claims cover it."],
            ["4", `Compete for $${total}`, `${BOUNTY_MIN_POINTS_TO_WIN}+ points a day (≈${formatGdollar(total)})`],
          ].map(([n, title, body]) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <div style={{
                width: 25, height: 25, borderRadius: "50%", flexShrink: 0,
                background: `${ACCENT}22`, border: `1px solid ${ACCENT}66`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, color: ACCENT,
              }}>{n}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#e2e8f0", lineHeight: 1.3 }}>{title}</div>
                <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>{body}</div>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div role="alert" style={{ fontSize: 12, color: "#f87171", marginBottom: 12, lineHeight: 1.4 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <VerifyButton
            label="Verify & claim free G$"
            onError={setError}
            style={{ width: "100%", padding: "13px 0", fontSize: 14 }}
          />
          <button
            onClick={dismiss}
            style={{
              width: "100%", padding: "11px 0", borderRadius: 8,
              background: "transparent", border: "1px solid rgba(148,163,184,0.25)",
              color: "#94a3b8", fontFamily: "inherit", fontSize: 13, fontWeight: 700,
              letterSpacing: 0.5, cursor: "pointer",
            }}
          >
            Maybe later
          </button>
        </div>

        <p style={{ margin: "14px 0 0", fontSize: 11, color: "#475569", textAlign: "center", lineHeight: 1.5 }}>
          You can always verify from your Profile.
        </p>
      </div>
    </div>
  );
}
