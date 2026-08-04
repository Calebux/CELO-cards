"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAccount, useBalance, useConnect, useConnectors, useDisconnect, useReadContract, useSwitchChain } from "wagmi";
import { celo } from "wagmi/chains";
import { formatUnits } from "viem";
import { formatAddress } from "../lib/minipayRuntime";
import { getMiniPayConnector, isMiniPay } from "../lib/minipay";
import { isMuted } from "../lib/soundManager";
import { useGameStore } from "../lib/gameStore";
import { SoundSettings } from "./SoundSettings";
import { MINIPAY_DEPOSIT_DEEPLINK, useMiniPayMode } from "../lib/premiumPayments";
import { useMiniPayStablecoin } from "../lib/stablecoins";
import { friendlyTxError, isUserRejectedTx } from "../lib/txErrors";
import { useWeb3AuthResuming } from "../lib/wallet";
import { reportAuthFailure } from "../lib/authTelemetry";
import { useRouter } from "next/navigation";

const GDOLLAR_CONTRACT = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as `0x${string}`;
const BALANCE_ABI = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;
const LOW_BALANCE_THRESHOLD = 0.50;

function BalanceChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5,
      padding: "5px 10px",
      background: `${color}0f`,
      border: `1px solid ${color}30`,
      borderRadius: 5,
      whiteSpace: "nowrap",
    }}>
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}` }} />
      <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: 0.5 }}>{value}</span>
      <span style={{ fontSize: 9, fontWeight: 600, color: "#4b5563", letterSpacing: 0.5 }}>{label}</span>
    </div>
  );
}

function Balances({ address, enabled, mp }: { address: `0x${string}`; enabled: boolean; mp: boolean }) {
  const { data: celoBalance } = useBalance({
    address,
    chainId: celo.id,
    query: { enabled: !!address && enabled && !mp },
  });
  const { data: token2 } = useReadContract({
    address: GDOLLAR_CONTRACT,
    abi: BALANCE_ABI,
    functionName: "balanceOf",
    args: [address],
    chainId: celo.id,
    query: { enabled: !!address && enabled && !mp },
  });
  // MiniPay: show the user's preferred stablecoin (highest balance)
  const stable = useMiniPayStablecoin(address, enabled && mp);

  if (mp) {
    return <BalanceChip label={stable.preferred.symbol} value={stable.preferredDisplay} color={stable.preferred.color} />;
  }

  const celoVal = celoBalance ? parseFloat(formatUnits(celoBalance.value, 18)).toFixed(3) : "—";
  const token2Val = token2 ? parseFloat(formatUnits(token2, 18)).toFixed(0) : "—";

  return (
    <>
      <BalanceChip label="CELO" value={celoVal} color="#FBCC5C" />
      <BalanceChip label="G$" value={token2Val} color="#00C58E" />
    </>
  );
}

function MuteButton() {
  const [muted, setMutedState] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const isMp = useMiniPayMode();

  useEffect(() => {
    setMutedState(isMuted());
    const handler = (e: Event) => setMutedState((e as CustomEvent<{ muted: boolean }>).detail.muted);
    window.addEventListener("ao-mute-change", handler);
    return () => window.removeEventListener("ao-mute-change", handler);
  }, []);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        title="Sound settings"
        style={{
          background: "rgba(86,164,203,0.08)",
          border: "1px solid rgba(86,164,203,0.25)",
          borderRadius: 6,
          cursor: "pointer",
          padding: isMp ? "16px 14px" : "5px 8px",
          display: "flex",
          alignItems: "center",
          gap: 4,
          transition: "all 0.2s",
        }}
      >
        <span className="material-icons" style={{ fontSize: 16, color: muted ? "#ef4444" : "#56a4cb", lineHeight: 1 }}>
          {muted ? "volume_off" : "volume_up"}
        </span>
      </button>
      {showModal ? <SoundSettings onClose={() => setShowModal(false)} /> : null}
    </>
  );
}

export function LandingWalletSection() {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const connectors = useConnectors();
  const { switchChainAsync } = useSwitchChain();
  const { playerName } = useGameStore();
  const [autoConnecting, setAutoConnecting] = useState(false);
  const [showBalances, setShowBalances] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [signInError, setSignInError] = useState("");
  const resuming = useWeb3AuthResuming();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const mp = useMiniPayMode();

  // Low-balance check based on the preferred (highest-balance) stablecoin
  const stableState = useMiniPayStablecoin(address, mp && isConnected);
  const preferredRaw = stableState.balances[stableState.preferred.key];
  const preferredFloat = preferredRaw !== undefined ? parseFloat(formatUnits(preferredRaw, stableState.preferred.decimals)) : null;
  const isLowBalance = mp && preferredFloat !== null && preferredFloat < LOW_BALANCE_THRESHOLD;

  useEffect(() => {
    if (isConnected) setSignInError("");
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected || !address) {
      setShowBalances(false);
      return;
    }
    if (!mp) {
      setShowBalances(true);
      return;
    }

    type IdleWindow = Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const idleWindow = window as IdleWindow;
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(() => setShowBalances(true), { timeout: 1500 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }

    const timeout = window.setTimeout(() => setShowBalances(true), 900);
    return () => window.clearTimeout(timeout);
  }, [address, isConnected, mp]);

  useEffect(() => {
    if (!mp || isConnected) return;
    setAutoConnecting(true);
    const connector = getMiniPayConnector();
    connectAsync({ connector, chainId: celo.id })
      .then(async (result) => {
        if (result.chainId !== celo.id) {
          await switchChainAsync({ chainId: celo.id }).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setAutoConnecting(false));
  }, [mp, isConnected, connectAsync, switchChainAsync]);

  useEffect(() => {
    if (!showAccountMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setShowAccountMenu(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAccountMenu(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showAccountMenu]);

  const base: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1.5px solid #56a4cb",
    borderRadius: 6,
    padding: mp ? "16px 18px" : "8px 18px",
    backdropFilter: "blur(10px)",
    clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)",
    boxShadow: "0 0 16px rgba(86,164,203,0.3), inset 0 0 20px rgba(86,164,203,0.07)",
    fontFamily: "var(--font-space-grotesk), sans-serif",
  };

  if (mp && !isConnected) {
    if (autoConnecting) return null;
    return null;
  }

  if (mp && isConnected && address) {
    const primaryIdentity = playerName || "PLAYER";
    const secondaryIdentity = playerName ? "Ready to play" : "Set username in Profile";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <MuteButton />
        {showBalances ? <Balances address={address} enabled={showBalances} mp={mp} /> : null}
        {isLowBalance ? (
          <a
            href={MINIPAY_DEPOSIT_DEEPLINK}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 12px",
              background: "rgba(251,191,36,0.12)",
              border: "1px solid rgba(251,191,36,0.45)",
              borderRadius: 6,
              color: "#fbbf24",
              fontSize: 11, fontWeight: 800, letterSpacing: 1.2,
              textTransform: "uppercase", textDecoration: "none",
              boxShadow: "0 0 10px rgba(251,191,36,0.2)",
            }}
          >
            <span className="material-icons" style={{ fontSize: 13 }}>add_circle</span>
            Add Cash
          </a>
        ) : null}
        <div style={{ ...base, background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(86,164,203,0.18))" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
          <div>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: "#56a4cb", textTransform: "uppercase", lineHeight: 1 }}>PLAYER</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#b9e7f4", letterSpacing: 1, lineHeight: 1.4 }}>{primaryIdentity}</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#64748b", letterSpacing: 0.6, lineHeight: 1.2 }}>{secondaryIdentity}</div>
          </div>
        </div>
      </div>
    );
  }

  const web3AuthConnector = connectors.find((connector) => connector.id === "web3auth");
  const fallbackConnector = connectors.find((connector) => connector.id === "injected") ?? connectors[0];

  const handleSignIn = () => {
    const connector = web3AuthConnector ?? fallbackConnector;
    if (!connector) return;
    setSignInError("");
    void (async () => {
      try {
        await connectAsync({ connector, chainId: celo.id });
      } catch (e) {
        // Never swallow this silently: a blocked popup or a failed SDK load
        // otherwise looks identical to a dead button.
        if (!isUserRejectedTx(e)) {
          setSignInError(friendlyTxError(e, "Couldn't sign in. Please tap again."));
        }
        reportAuthFailure("sign-in", e);
      }
    })();
  };

  const handleDisconnect = () => {
    void disconnectAsync().catch(() => {}).finally(() => setShowAccountMenu(false));
  };

  const handleCopyAddress = () => {
    if (!address || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(address)
      .then(() => {
        setCopiedAddress(true);
        window.setTimeout(() => setCopiedAddress(false), 1600);
      })
      .catch(() => {});
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }} ref={menuRef}>
      <MuteButton />
      {isConnected && address ? <Balances address={address} enabled mp={mp} /> : null}
      <button
        onClick={isConnected ? () => setShowAccountMenu((open) => !open) : handleSignIn}
        style={{
          ...base,
          cursor: "pointer",
          background: isConnected
            ? "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(86,164,203,0.18))"
            : "linear-gradient(135deg, rgba(34,47,66,0.95), rgba(86,164,203,0.28))",
        }}
      >
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: isConnected ? "#4ade80" : "#56a4cb",
            boxShadow: `0 0 6px ${isConnected ? "#4ade80" : "#56a4cb"}`,
          }}
        />
        <div>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: "#56a4cb", textTransform: "uppercase", lineHeight: 1 }}>
            {isConnected ? "CELO WALLET" : resuming ? "WELCOME BACK" : "CONNECT"}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#b9e7f4", letterSpacing: 1, lineHeight: 1.5 }}>
            {isConnected && address
              ? (playerName || formatAddress(address))
              : resuming
                ? "SIGNING IN…"
                : "SIGN IN"}
          </div>
        </div>
      </button>
      {!isConnected && signInError ? (
        <div
          role="alert"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            maxWidth: 240,
            padding: "8px 10px",
            borderRadius: 6,
            background: "rgba(10,16,28,0.98)",
            border: "1px solid rgba(248,113,113,0.4)",
            color: "#f87171",
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.4,
            zIndex: 50,
          }}
        >
          {signInError}
        </div>
      ) : null}
      {isConnected && !mp && showAccountMenu ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            minWidth: 180,
            padding: 8,
            borderRadius: 8,
            border: "1px solid rgba(86,164,203,0.24)",
            background: "linear-gradient(135deg, rgba(7,12,20,0.97), rgba(17,27,41,0.96))",
            boxShadow: "0 12px 32px rgba(0,0,0,0.45), 0 0 18px rgba(86,164,203,0.12)",
            backdropFilter: "blur(12px)",
            zIndex: 30,
          }}
        >
          <button
            onClick={handleCopyAddress}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "10px 12px",
              background: "transparent",
              border: "none",
              borderRadius: 6,
              color: "#b9e7f4",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.4,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="material-icons" style={{ fontSize: 16, color: "#56a4cb" }}>content_copy</span>
              {copiedAddress ? "Address copied" : "Copy wallet address"}
            </span>
            {address ? (
              <span style={{ fontSize: 11, color: "#64748b", letterSpacing: 0.3 }}>
                {formatAddress(address)}
              </span>
            ) : null}
          </button>
          <button
            onClick={() => { setShowAccountMenu(false); router.push("/profile"); }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              background: "transparent",
              border: "none",
              borderRadius: 6,
              color: "#b9e7f4",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.6,
            }}
          >
            <span className="material-icons" style={{ fontSize: 16, color: "#56a4cb" }}>person</span>
            Profile
          </button>
          <button
            onClick={handleDisconnect}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              background: "transparent",
              border: "none",
              borderRadius: 6,
              color: "#fca5a5",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.6,
            }}
          >
            <span className="material-icons" style={{ fontSize: 16, color: "#ef4444" }}>logout</span>
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}
