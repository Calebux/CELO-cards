"use client";

import React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { isMiniPay, formatAddress } from "../lib/minipay";

/**
 * Consistent game-themed wallet button used across all pages.
 * Matches the landing page style: dark bg, #56a4cb border, bevelled clip-path, glow.
 */
export function WalletSection() {
  const { address, isConnected } = useAccount();

  const base: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1.5px solid #56a4cb",
    borderRadius: 6,
    padding: "8px 18px",
    backdropFilter: "blur(10px)",
    clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)",
    boxShadow: "0 0 16px rgba(86,164,203,0.3), inset 0 0 20px rgba(86,164,203,0.07)",
    fontFamily: "var(--font-space-grotesk), sans-serif",
  };

  if (isMiniPay() && isConnected && address) {
    return (
      <div style={{ ...base, background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(86,164,203,0.18))" }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
        <div>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: "#56a4cb", textTransform: "uppercase", lineHeight: 1 }}>CELO WALLET</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#b9e7f4", letterSpacing: 1, lineHeight: 1.5 }}>{formatAddress(address)}</div>
        </div>
      </div>
    );
  }

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
        if (!mounted) return null;
        const connected = !!(account && chain);
        return (
          <button
            onClick={connected ? openAccountModal : openConnectModal}
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
                {connected ? (account.displayName ?? formatAddress(account.address)) : "SIGN IN"}
              </div>
            </div>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
