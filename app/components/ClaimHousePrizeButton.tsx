"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useMiniPayMode } from "../lib/premiumPayments";
import { buildHouseClaimAuthMessage } from "../lib/houseReward";
import { isUserRejectedTx } from "../lib/txErrors";

/**
 * Claims the House Boss prize straight to the player's wallet.
 *
 * Replaces "share your win in Telegram to claim your $5" — winners are paid
 * on-chain from the treasury and the signature proves they own the wallet. The
 * server decides the amount from a constant, so nothing here can influence what
 * is paid.
 *
 * The button only goes live once ops has confirmed the win. That review is the
 * sybil defence: there is no identity signal for MiniPay players, and a
 * throwaway wallet costs a farmer far less than the prize, so a human has to
 * stand between a recorded win and real money.
 */

type ClaimState = {
  claimable: boolean;
  reason?: "no-win" | "pending-review" | "already-claimed" | "pool-empty";
  rewardUsd: number;
  txHash: string | null;
};

export function ClaimHousePrizeButton({ compact = false }: { compact?: boolean }) {
  const { address } = useAccount();
  // MiniPay is paid in USDT, web in G$ — GoodDollar cannot appear inside the
  // Mini App, and USDT is dollar-denominated so the figure needs no conversion.
  const isMp = useMiniPayMode();
  const { signMessageAsync } = useSignMessage();
  const [state, setState] = useState<ClaimState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!address) { setState(null); return; }
    void fetch(`/api/house-winner/claim?address=${address.toLowerCase()}&t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: ClaimState) => { setState(d); setTxHash(d.txHash); })
      .catch(() => {});
  }, [address]);

  useEffect(load, [load]);

  // Nothing to say to someone who has never beaten the Boss.
  if (!address || !state || state.reason === "no-win") return null;

  const done = state.reason === "already-claimed" || !!txHash;
  const payoutLabel = isMp ? `$${state.rewardUsd} USDT` : `$${state.rewardUsd}`;

  const claim = async () => {
    setError("");
    setBusy(true);
    try {
      const signature = await signMessageAsync({ message: buildHouseClaimAuthMessage(address) });
      const res = await fetch("/api/house-winner/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A hint only: the server can route a claim to USDT but never to G$ on
        // its say-so, so a spoofed value cannot change what is paid.
        body: JSON.stringify({ address, signature, isMiniPay: isMp }),
      });
      const data = await res.json() as { ok?: boolean; txHash?: string; error?: string };
      if (!res.ok || !data.ok) {
        // A conflict carrying a hash means it already landed — treat that as
        // success rather than telling a paid player something went wrong.
        if (data.txHash) setTxHash(data.txHash);
        else { setError(data.error ?? "Couldn't complete the claim. Please try again."); load(); }
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
          ✅ House Boss prize paid · {payoutLabel}
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

  // Won, but not yet confirmed. Said plainly and with no button, because a live
  // button over a claim the server will refuse is worse than no button at all.
  if (state.reason === "pending-review") {
    return (
      <span style={{ fontSize: compact ? 12 : 11, fontWeight: 700, color: "#fbbf24", letterSpacing: 0.3 }}>
        ⏳ House Boss win recorded — {payoutLabel} unlocks once we confirm it.
      </span>
    );
  }

  if (state.reason === "pool-empty") {
    return (
      <span style={{ fontSize: compact ? 12 : 11, fontWeight: 700, color: "#94a3b8", letterSpacing: 0.3 }}>
        The House Boss pool is fully claimed for now.
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        onClick={claim}
        disabled={busy}
        style={{
          padding: compact ? "10px 16px" : "8px 14px",
          background: busy ? "rgba(74,222,128,0.1)" : "linear-gradient(135deg, rgba(74,222,128,0.22), rgba(74,222,128,0.06))",
          border: "1.5px solid #4ade80", borderRadius: 6,
          cursor: busy ? "default" : "pointer", fontFamily: "inherit",
          fontWeight: 800, fontSize: compact ? 13 : 11, letterSpacing: 1,
          color: "#4ade80", textTransform: "uppercase",
        }}
      >
        {busy ? "CLAIMING…" : `CLAIM ${payoutLabel} ★`}
      </button>
      {error && (
        <span style={{ fontSize: compact ? 11 : 10, color: "#f87171", letterSpacing: 0.2 }}>{error}</span>
      )}
    </div>
  );
}
