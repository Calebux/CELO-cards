"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { UBISCHEME_CONTRACT, UBISCHEME_ABI, GDOLLAR_COLOR } from "../lib/gooddollar";
import { formatUnits } from "viem";

export function ClaimGDollar() {
  const { address, isConnected } = useAccount();

  const { data: entitlement, refetch } = useReadContract({
    address: UBISCHEME_CONTRACT,
    abi: UBISCHEME_ABI,
    functionName: "checkEntitlement",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { writeContract, data: txHash, isPending, isError, reset } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: {
      onSuccess: () => { refetch(); },
    },
  });

  if (!isConnected) return null;

  const canClaim = entitlement !== undefined && entitlement > 0n;
  // G$ has 18 decimals on Celo (SuperToken)
  const claimableDisplay = entitlement
    ? parseFloat(formatUnits(entitlement, 18)).toFixed(2)
    : "0";

  function handleClaim() {
    reset();
    writeContract({
      address: UBISCHEME_CONTRACT,
      abi: UBISCHEME_ABI,
      functionName: "claim",
    });
  }

  const isBusy = isPending || isConfirming;

  return (
    <div
      style={{
        backgroundColor: "rgba(0,197,142,0.06)",
        border: `1px solid ${GDOLLAR_COLOR}40`,
        borderRadius: 8,
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>🌱</span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 2,
            color: GDOLLAR_COLOR,
            textTransform: "uppercase",
          }}
        >
          GoodDollar UBI
        </span>
      </div>

      {/* Amount row */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 900,
            color: canClaim ? GDOLLAR_COLOR : "#374151",
            textShadow: canClaim ? `0 0 10px ${GDOLLAR_COLOR}60` : "none",
            transition: "all 0.3s",
          }}
        >
          {claimableDisplay}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280" }}>G$</span>
        <span style={{ fontSize: 10, color: "#4b5563", marginLeft: 4 }}>available</span>
      </div>

      {/* Button / states */}
      {isSuccess ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            background: `${GDOLLAR_COLOR}15`,
            border: `1px solid ${GDOLLAR_COLOR}50`,
            borderRadius: 6,
          }}
        >
          <span style={{ color: GDOLLAR_COLOR, fontSize: 13 }}>✓</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: GDOLLAR_COLOR }}>
            Claimed! G$ on its way
          </span>
        </div>
      ) : isError ? (
        <button
          onClick={handleClaim}
          style={{
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.4)",
            borderRadius: 6,
            padding: "8px 0",
            color: "#f87171",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Failed — Retry
        </button>
      ) : (
        <button
          onClick={handleClaim}
          disabled={!canClaim || isBusy}
          style={{
            background: canClaim
              ? `linear-gradient(135deg, ${GDOLLAR_COLOR}cc, ${GDOLLAR_COLOR})`
              : "rgba(255,255,255,0.05)",
            border: `1px solid ${canClaim ? GDOLLAR_COLOR : "rgba(255,255,255,0.08)"}`,
            borderRadius: 6,
            padding: "8px 0",
            color: canClaim ? "#fff" : "#374151",
            fontSize: 11,
            fontWeight: 800,
            cursor: canClaim && !isBusy ? "pointer" : "default",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {isBusy ? (
            <>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  border: `2px solid ${GDOLLAR_COLOR}40`,
                  borderTop: `2px solid ${GDOLLAR_COLOR}`,
                  animation: "spin 0.7s linear infinite",
                  display: "inline-block",
                }}
              />
              {isConfirming ? "Confirming…" : "Claiming…"}
            </>
          ) : canClaim ? (
            "Claim G$"
          ) : (
            "Already claimed today"
          )}
        </button>
      )}

      {!canClaim && !isSuccess && (
        <p style={{ fontSize: 9, color: "#4b5563", lineHeight: "13px", marginTop: -2 }}>
          Need a verified GoodDollar identity to claim daily UBI.
        </p>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
