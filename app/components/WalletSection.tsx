"use client";

import React, { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useConnect, useConnectors, useReadContract, useSwitchChain } from "wagmi";
import { celo } from "wagmi/chains";
import { getMiniPayConnector, isMiniPay, formatAddress } from "../lib/minipay";
const USDT_CONTRACT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as `0x${string}`;
const GDOLLAR_CONTRACT = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as `0x${string}`;
const BALANCE_ABI = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;
import { formatUnits } from "viem";
import { isMuted } from "../lib/soundManager";
import { useGameStore } from "../lib/gameStore";
import { SoundSettings } from "./SoundSettings";

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

function Balances({ address }: { address: `0x${string}` }) {
  const mp = isMiniPay();
  const { data: celoBalance } = useBalance({
    address,
    chainId: celo.id,
    query: { enabled: !!address },
  });
  const { data: token2 } = useReadContract({
    address: mp ? USDT_CONTRACT : GDOLLAR_CONTRACT,
    abi: BALANCE_ABI,
    functionName: "balanceOf",
    args: [address],
    chainId: celo.id,
    query: { enabled: !!address },
  });

  const celoVal = celoBalance ? parseFloat(formatUnits(celoBalance.value, 18)).toFixed(3) : "—";
  const token2Val = token2 ? parseFloat(formatUnits(token2, mp ? 6 : 18)).toFixed(mp ? 2 : 0) : "—";

  return (
    <>
      <BalanceChip label="CELO" value={celoVal} color="#FBCC5C" />
      <BalanceChip label={mp ? "USDT" : "G$"} value={token2Val} color={mp ? "#26a17b" : "#00C58E"} />
    </>
  );
}

function MuteButton() {
  const [muted, setMutedState] = useState(false);
  const [showModal, setShowModal] = useState(false);

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
          padding: isMiniPay() ? "16px 14px" : "5px 8px",
          display: "flex", alignItems: "center", gap: 4,
          transition: "all 0.2s",
        }}
      >
        <span className="material-icons" style={{ fontSize: 16, color: muted ? "#ef4444" : "#56a4cb", lineHeight: 1 }}>
          {muted ? "volume_off" : "volume_up"}
        </span>
      </button>
      {showModal && <SoundSettings onClose={() => setShowModal(false)} />}
    </>
  );
}

export function WalletSection() {
  const { address, isConnected } = useAccount();
  const { connectAsync, isPending: isConnectingMiniPay } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { playerName } = useGameStore();

  const base: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1.5px solid #56a4cb",
    borderRadius: 6,
    padding: isMiniPay() ? "16px 18px" : "8px 18px",
    backdropFilter: "blur(10px)",
    clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)",
    boxShadow: "0 0 16px rgba(86,164,203,0.3), inset 0 0 20px rgba(86,164,203,0.07)",
    fontFamily: "var(--font-space-grotesk), sans-serif",
  };

  if (isMiniPay() && !isConnected) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <MuteButton />
        <button
          onClick={() => {
            const connector = getMiniPayConnector();
            void connectAsync({ connector, chainId: celo.id })
              .then(async (result) => {
                if (result.chainId !== celo.id) {
                  await switchChainAsync({ chainId: celo.id }).catch(() => {});
                }
              })
              .catch(() => {});
          }}
          style={{
            ...base,
            cursor: isConnectingMiniPay ? "default" : "pointer",
            opacity: isConnectingMiniPay ? 0.75 : 1,
            background: "linear-gradient(135deg, rgba(34,47,66,0.95), rgba(86,164,203,0.28))",
          }}
        >
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "#56a4cb",
            boxShadow: "0 0 6px #56a4cb",
          }} />
          <div>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: "#56a4cb", textTransform: "uppercase", lineHeight: 1 }}>
              MiniPay
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#b9e7f4", letterSpacing: 1, lineHeight: 1.5 }}>
              {isConnectingMiniPay ? "CONNECTING..." : "CONNECT WALLET"}
            </div>
          </div>
        </button>
      </div>
    );
  }

  if (isMiniPay() && isConnected && address) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <MuteButton />
        <Balances address={address} />
        <div style={{ ...base, background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(86,164,203,0.18))" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
          <div>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: "#56a4cb", textTransform: "uppercase", lineHeight: 1 }}>CELO WALLET</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#b9e7f4", letterSpacing: 1, lineHeight: 1.5 }}>{playerName || formatAddress(address)}</div>
          </div>
        </div>
      </div>
    );
  }

  const allConnectors = useConnectors();
  const web3AuthConnector = allConnectors.find((c) => c.id === "web3auth");

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
        if (!mounted) return null;
        const connected = !!(account && chain);
        const handleSignIn = () => {
          if (web3AuthConnector) {
            void connectAsync({ connector: web3AuthConnector });
          } else {
            openConnectModal();
          }
        };
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MuteButton />
            {connected && address && <Balances address={address} />}
            <button
              onClick={connected ? openAccountModal : handleSignIn}
              style={{
                ...base,
                cursor: "pointer",
                background: connected
                  ? "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(86,164,203,0.18))"
                  : "linear-gradient(135deg, rgba(34,47,66,0.95), rgba(86,164,203,0.28))",
              }}
            >
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: connected ? "#4ade80" : "#56a4cb",
                boxShadow: `0 0 6px ${connected ? "#4ade80" : "#56a4cb"}`,
              }} />
              <div>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: "#56a4cb", textTransform: "uppercase", lineHeight: 1 }}>
                  {connected ? "CELO WALLET" : "CONNECT"}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#b9e7f4", letterSpacing: 1, lineHeight: 1.5 }}>
                  {connected ? (playerName || account.displayName || formatAddress(account.address)) : "SIGN IN"}
                </div>
              </div>
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
