"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWalletClient } from "wagmi";
import { celo } from "wagmi/chains";
import { IDENTITY_CONTRACT, IDENTITY_ABI, GDOLLAR_COLOR } from "../lib/gooddollar";
import { isUserRejectedTx } from "../lib/txErrors";

/**
 * Starts GoodDollar face verification from wherever the player already is.
 *
 * Verification used to be reachable only by finding Profile → Verify, which is
 * why only 18% of real wallets are verified — it is the first onboarding step
 * and also the least discoverable. This puts the same flow ClaimGDollar uses
 * behind one tap at the moments people actually need it: hitting the season
 * pass, looking at an empty bounty board, or finishing signup.
 */

/** True / false / undefined while the on-chain check is still loading. */
export function useIsVerified(): boolean | undefined {
  const { address } = useAccount();
  const { data } = useReadContract({
    address: IDENTITY_CONTRACT,
    abi: IDENTITY_ABI,
    functionName: "isWhitelisted",
    args: address ? [address] : undefined,
    chainId: celo.id,
    query: { enabled: !!address },
  });
  return data as boolean | undefined;
}

type Props = {
  label?: string;
  /** Where to come back to. Defaults to the current page. */
  returnTo?: string;
  onError?: (message: string) => void;
  style?: React.CSSProperties;
};

export function VerifyButton({ label = "Verify now", returnTo, onError, style }: Props) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: celo.id });
  const publicClient = usePublicClient({ chainId: celo.id });
  const [busy, setBusy] = useState(false);

  const disabled = busy || !walletClient || !publicClient || !address;

  const start = async () => {
    if (!walletClient || !publicClient || !address) return;
    setBusy(true);
    try {
      // Built at click time so the wallet/public clients are fully ready —
      // constructing it earlier races wagmi's connection setup.
      const { IdentitySDK } = await import("@goodsdks/citizen-sdk");
      const sdk = new IdentitySDK({ account: address, publicClient, walletClient, env: "production" });
      // Redirect mode (popupMode = false). Popup mode lands new and mobile users
      // on /FVFlowError because there is no opener to finish the handshake —
      // this mirrors the SDK's own fvRedirect() flow.
      const url = await sdk.generateFVLink(false, returnTo ?? window.location.href, 42220);
      window.location.href = url;
    } catch (e) {
      // Declining the signature is a choice, not a fault worth shouting about.
      if (!isUserRejectedTx(e)) {
        onError?.("Couldn't start verification. Please try again.");
      }
      setBusy(false);
    }
    // No finally: on success the page is navigating away, and clearing `busy`
    // would flash the button back to its idle label mid-redirect.
  };

  return (
    <button
      onClick={() => void start()}
      disabled={disabled}
      style={{
        padding: "12px 22px",
        borderRadius: 8,
        border: "none",
        cursor: disabled ? "wait" : "pointer",
        fontFamily: "inherit",
        fontSize: 14,
        fontWeight: 800,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: "#04120c",
        background: GDOLLAR_COLOR,
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
    >
      {busy ? "Opening…" : label}
    </button>
  );
}
