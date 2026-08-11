"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useWalletClient, usePublicClient } from "wagmi";
import { celo } from "wagmi/chains";
import { UBISCHEME_CONTRACT, UBISCHEME_ABI, IDENTITY_CONTRACT, IDENTITY_ABI, GDOLLAR_COLOR, GDOLLAR_CONNECT_WALLET_DOCS } from "../lib/gooddollar";
import { SIGNUPS_CONTRACT, SIGNUPS_ABI } from "../lib/signupsContract";
import { formatUnits } from "viem";
import { useGameStore } from "../lib/gameStore";
import { isUserRejectedTx } from "../lib/txErrors";

export function ClaimGDollar() {
  const { address, isConnected } = useAccount();

  // Verification is resolved through the identity root, not the connected
  // wallet: a player can link several wallets to one G$ identity and a linked
  // wallet reads as unverified on its own, which would send an already-verified
  // human back into face verification that can only fail as a duplicate.
  //
  // The entitlement read below deliberately stays on the connected wallet,
  // since that is the address the UBIScheme `claim()` transaction is sent from.
  const { data: whitelistedRoot } = useReadContract({
    address: IDENTITY_CONTRACT,
    abi: IDENTITY_ABI,
    functionName: "getWhitelistedRoot",
    args: address ? [address] : undefined,
    chainId: celo.id,
    query: { enabled: !!address },
  });
  const isWhitelisted =
    whitelistedRoot === undefined
      ? undefined
      : !!whitelistedRoot && whitelistedRoot !== "0x0000000000000000000000000000000000000000";

  const { data: entitlement, refetch } = useReadContract({
    address: UBISCHEME_CONTRACT,
    abi: UBISCHEME_ABI,
    functionName: "checkEntitlement",
    args: address ? [address] : undefined,
    chainId: celo.id,
    query: { enabled: !!address && isWhitelisted === true },
  });

  const { data: walletClient } = useWalletClient({ chainId: celo.id });
  const publicClient = usePublicClient({ chainId: celo.id });
  const { writeContract, data: txHash, isPending, isError, error: claimError, reset } = useWriteContract();
  const [isVerifying, setIsVerifying] = useState(false);

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) refetch();
  }, [isSuccess, refetch]);

  // Onboarding: verified + claimed (now, or already today) means the wallet
  // has G$ and the CELO gas top-up — mark the verify_claim step done and
  // register the player on the KnockOrderSignups contract with their own
  // wallet. Best-effort: a rejected/failed signup retries on the next visit.
  const markOnboardingStep = useGameStore((s) => s.markOnboardingStep);
  const signupAttemptedRef = useRef(false);
  useEffect(() => {
    if (!(isSuccess || (isWhitelisted === true && entitlement === 0n))) return;
    markOnboardingStep("verify_claim");

    if (signupAttemptedRef.current) return;
    if (!address || !walletClient || !publicClient) return;
    if (SIGNUPS_CONTRACT === "0x0000000000000000000000000000000000000000") return;
    signupAttemptedRef.current = true;

    void (async () => {
      try {
        const already = await publicClient.readContract({
          address: SIGNUPS_CONTRACT,
          abi: SIGNUPS_ABI,
          functionName: "hasSignedUp",
          args: [address],
        });
        if (already) return;
        await walletClient.writeContract({
          address: SIGNUPS_CONTRACT,
          abi: SIGNUPS_ABI,
          functionName: "signUp",
          chain: celo,
          account: address,
        });
      } catch {
        // No gas yet or user rejected — try again next session.
        signupAttemptedRef.current = false;
      }
    })();
  }, [isSuccess, isWhitelisted, entitlement, address, walletClient, publicClient, markOnboardingStep]);

  const canClaim = isConnected && entitlement !== undefined && entitlement > 0n;
  const claimableDisplay = entitlement && entitlement > 0n
    ? parseFloat(formatUnits(entitlement, 18)).toFixed(2)
    : null;
  const isBusy = isPending || isConfirming;

  function handleClaim() {
    reset();
    writeContract({ address: UBISCHEME_CONTRACT, abi: UBISCHEME_ABI, functionName: "claim", chainId: celo.id });
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
          {isUserRejectedTx(claimError) ? "Claim cancelled — Retry" : "Failed — Retry"}
        </button>
      ) : canClaim ? (
        <button onClick={handleClaim} disabled={isBusy} style={btnStyle("#000", GDOLLAR_COLOR, GDOLLAR_COLOR, isBusy ? 0.6 : 1)}>
          {isBusy ? (isConfirming ? "Confirming…" : "Claiming…") : "Claim G$"}
        </button>
      ) : isWhitelisted === false ? (
        /* Not verified on GoodDollar */
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ fontSize: 9, color: "#6b7280", lineHeight: "13px" }}>
            Not verified yet. Get G$ Verified to claim daily G$.
          </p>
          <button
            disabled={isVerifying || !walletClient || !publicClient || !address}
            onClick={async () => {
              if (!walletClient || !publicClient || !address) return;
              setIsVerifying(true);
              try {
                // Create SDK fresh at click time so wallet/public clients are fully ready
                const { IdentitySDK } = await import("@goodsdks/citizen-sdk");
                const sdk = new IdentitySDK({ account: address, publicClient, walletClient, env: "production" });
                // Redirect mode (popupMode=false): goodid returns the user to
                // rdu after verifying. Popup mode + window.open lands new/mobile
                // users on /FVFlowError because there's no opener to complete the
                // popup handshake. Matches the SDK's own fvRedirect() flow.
                const url = await sdk.generateFVLink(
                  false,
                  window.location.href,
                  42220,
                );
                window.location.href = url;
              } catch {
                // user rejected signing
              } finally {
                setIsVerifying(false);
              }
            }}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: isVerifying ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10,
              fontWeight: 700,
              color: GDOLLAR_COLOR,
              letterSpacing: 0.5,
              opacity: isVerifying ? 0.6 : 1,
            }}
          >
            {isVerifying ? "Signing…" : "Get Verified →"}
          </button>
          {/* A player who is already G$ Verified on another wallet cannot verify
              again — face verification rejects them as a duplicate — and without
              this they hit that wall with no idea linking is even an option. */}
          <a
            href={GDOLLAR_CONNECT_WALLET_DOCS}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 9, color: "#6b7280", lineHeight: "13px", textDecoration: "underline" }}
          >
            Already G$ Verified on another wallet? Link it instead.
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
