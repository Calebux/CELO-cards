"use client";

import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useMiniPayMode } from "../lib/premiumPayments";
import { buildBountyClaimAuthMessage } from "../lib/treasuryAuth";
import { formatGdollar } from "../lib/bountyConfig";
import { isUserRejectedTx } from "../lib/txErrors";

/**
 * Claims yesterday's bounty straight to the player's wallet.
 *
 * Replaces the Telegram link: winners are paid on-chain from the treasury and
 * can then move the G$ out via Profile → Send funds out. The signature proves
 * they own the wallet — the server decides the amount from the frozen day, so
 * nothing here can influence what gets paid.
 */

type ClaimInfo = {
  day: string;
  closed: boolean;
  usd: number;
  amountGdollar: number;
  amountUsdt: number;
  alreadyClaimed: boolean;
  txHash: string | null;
};

export function ClaimBountyButton({ compact = false }: { compact?: boolean }) {
  const { address } = useAccount();
  // MiniPay is paid in USDT and web in G$ — GoodDollar cannot operate inside the
  // Mini App, so the prize has to settle in something else there. USDT is
  // dollar-denominated like the prize, so MiniPay players see the plain figure
  // with no conversion and no G$ anywhere in the flow.
  const isMp = useMiniPayMode();
  const { signMessageAsync } = useSignMessage();
  const [info, setInfo] = useState<ClaimInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    if (!address) { setInfo(null); return; }
    let cancelled = false;
    void fetch(`/api/bounty/claim?address=${address.toLowerCase()}&t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: ClaimInfo) => { if (!cancelled) { setInfo(d); setTxHash(d.txHash); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [address, isMp]);

  if (!address || !info || info.usd <= 0) return null;

  // What this player is actually paid in, and how it reads on the button.
  const payoutLabel = isMp ? `${info.amountUsdt} USDT` : formatGdollar(info.usd);

  const done = info.alreadyClaimed || !!txHash;

  // Which day this prize is for. Unstated while the bounty ran — it was always
  // yesterday — but during the pause the claimable day stops moving, so a bare
  // "Claim $5" would look like a prize for a day that paid nothing.
  const dayLabel =
    info.day === new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      ? null
      : new Date(`${info.day}T00:00:00Z`).toLocaleDateString(undefined, {
          weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
        });

  const claim = async () => {
    setError("");
    setBusy(true);
    try {
      const signature = await signMessageAsync({
        message: buildBountyClaimAuthMessage(address, info.day),
      });
      const res = await fetch("/api/bounty/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No currency here any more: the server reads it from the request's own
        // user agent. Sending it from the client made "which pot pays me" a
        // client decision, and the USDT pot is the one without a face check.
        body: JSON.stringify({ address, day: info.day, signature }),
      });
      const data = await res.json() as { ok?: boolean; txHash?: string; error?: string };
      if (!res.ok || !data.ok) {
        // A 409 with a hash means it already landed — treat that as success
        // rather than telling a paid player something went wrong.
        if (data.txHash) { setTxHash(data.txHash); }
        else setError(data.error ?? "Couldn't complete the claim. Please try again.");
      } else {
        setTxHash(data.txHash ?? null);
      }
    } catch (e) {
      if (!isUserRejectedTx(e)) setError("Couldn't complete the claim. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: compact ? 12 : 11, fontWeight: 800, color: "#4ade80", letterSpacing: 0.3 }}>
          ✅ Paid · {payoutLabel}{dayLabel ? ` · ${dayLabel}` : ""}
        </span>
        {txHash && (
          <a href={`https://celoscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: compact ? 11 : 9, color: "#56a4cb", textDecoration: "none" }}>
            View transaction →
          </a>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        onClick={() => void claim()}
        disabled={busy}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center",
          padding: compact ? "9px 16px" : "7px 14px", borderRadius: 6, border: "none",
          background: "#4ade80", color: "#052e16", cursor: busy ? "wait" : "pointer",
          fontFamily: "inherit", fontSize: compact ? 13 : 11, fontWeight: 800, letterSpacing: 0.5,
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy
          ? "Claiming…"
          : `💰 Claim $${info.usd} (${payoutLabel})${dayLabel ? ` · ${dayLabel}` : ""}`}
      </button>
      {error && (
        <span role="alert" style={{ fontSize: compact ? 11 : 9.5, color: "#f87171", lineHeight: 1.4 }}>{error}</span>
      )}
    </div>
  );
}
