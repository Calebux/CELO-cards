"use client";

import { useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { UBISCHEME_CONTRACT, UBISCHEME_ABI, IDENTITY_CONTRACT, IDENTITY_ABI, GDOLLAR_COLOR } from "../lib/gooddollar";
import { formatUnits } from "viem";

export function ClaimGDollar() {
  const { address, isConnected } = useAccount();

  const { data: isWhitelisted } = useReadContract({
    address: IDENTITY_CONTRACT,
    abi: IDENTITY_ABI,
    functionName: "isWhitelisted",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: entitlement, refetch } = useReadContract({
    address: UBISCHEME_CONTRACT,
    abi: UBISCHEME_ABI,
    functionName: "checkEntitlement",
    args: address ? [address] : undefined,
    query: { enabled: !!address && isWhitelisted === true },
  });

  const { writeContract, data: txHash, isPending, isError, reset } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) refetch();
  }, [isSuccess, refetch]);

  const canClaim = isConnected && entitlement !== undefined && entitlement > 0n;
  const claimableDisplay = entitlement && entitlement > 0n
    ? parseFloat(formatUnits(entitlement, 18)).toFixed(2)
    : null;
  const isBusy = isPending || isConfirming;

  function handleClaim() {
    reset();
    writeContract({ address: UBISCHEME_CONTRACT, abi: UBISCHEME_ABI, functionName: "claim" });
  }

  return (
    <div style={{
      backgroundColor: "rgba(0,197,142,0.06)",
      border: `1px solid ${GDOLLAR_COLOR}35`,
      borderRadius: 8,
      padding: "12px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13 }}>🌱</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: GDOLLAR_COLOR, textTransform: "uppercase" }}>
            GoodDollar UBI
          </span>
        </div>
        {claimableDisplay && (
          <span style={{ fontSize: 13, fontWeight: 900, color: GDOLLAR_COLOR }}>
            {claimableDisplay} G$
          </span>
        )}
      </div>

      {/* States */}
      {!isConnected ? (
        <p style={{ fontSize: 10, color: "#4b5563" }}>Connect wallet to claim daily G$.</p>
      ) : isSuccess ? (
        <div style={{ fontSize: 11, fontWeight: 700, color: GDOLLAR_COLOR }}>✓ Claimed! G$ incoming.</div>
      ) : isError ? (
        <button onClick={handleClaim} style={btnStyle("#f87171", "rgba(239,68,68,0.12)", "rgba(239,68,68,0.35)")}>
          Failed — Retry
        </button>
      ) : canClaim ? (
        <button onClick={handleClaim} disabled={isBusy} style={btnStyle("#000", GDOLLAR_COLOR, GDOLLAR_COLOR, isBusy ? 0.6 : 1)}>
          {isBusy ? (isConfirming ? "Confirming…" : "Claiming…") : "Claim G$"}
        </button>
      ) : isWhitelisted === false ? (
        /* Not verified on GoodDollar */
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ fontSize: 9, color: "#6b7280", lineHeight: "13px" }}>
            Not verified. Get your GoodDollar identity to claim daily G$.
          </p>
          <a
            href="https://wallet.gooddollar.org/verify"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: GDOLLAR_COLOR, textDecoration: "none", letterSpacing: 0.5 }}
          >
            Get Verified →
          </a>
        </div>
      ) : isWhitelisted === true && entitlement === 0n ? (
        /* Verified but already claimed today */
        <p style={{ fontSize: 9, color: "#6b7280", lineHeight: "13px" }}>
          Already claimed today. Come back tomorrow!
        </p>
      ) : (
        /* Loading / checking */
        <p style={{ fontSize: 9, color: "#6b7280", lineHeight: "13px" }}>
          {isWhitelisted === undefined ? "Checking identity…" : "Checking eligibility…"}
        </p>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function btnStyle(color: string, bg: string, border: string, opacity = 1) {
  return {
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 6,
    padding: "7px 0",
    color,
    fontSize: 11,
    fontWeight: 800,
    cursor: "pointer",
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    width: "100%",
    opacity,
  };
}
