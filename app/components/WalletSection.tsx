"use client";

import React, { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { useWeb3Auth, useWeb3AuthConnect, useWeb3AuthDisconnect } from "@web3auth/modal/react";
import { celo } from "wagmi/chains";
import { isMiniPay, formatAddress } from "../lib/minipay";
import { useAuthMode } from "../lib/authMode";
import { GDOLLAR_CONTRACT, GDOLLAR_ABI } from "../lib/gooddollar";
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
  const { data: celoBalance } = useBalance({
    address,
    chainId: celo.id,
    query: { enabled: !!address },
  });
  const { data: gd } = useReadContract({
    address: GDOLLAR_CONTRACT,
    abi: GDOLLAR_ABI,
    functionName: "balanceOf",
    args: [address],
    chainId: celo.id,
    query: { enabled: !!address },
  });

  const celoVal = celoBalance ? parseFloat(formatUnits(celoBalance.value, 18)).toFixed(3) : "—";
  const gdVal   = gd          ? parseFloat(formatUnits(gd, 18)).toFixed(2) : "—";

  return (
    <>
      <BalanceChip label="CELO" value={celoVal} color="#FBCC5C" />
      <BalanceChip label="G$"   value={gdVal}   color="#00C58E" />
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
          padding: "5px 8px",
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

function WalletChooser({
  open,
  onClose,
  title,
  subtitle,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  actions: { label: string; onClick: () => void; accent?: boolean; danger?: boolean; disabled?: boolean }[];
}) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(2, 6, 16, 0.72)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 100%)",
          background: "linear-gradient(160deg, rgba(8,16,29,0.98), rgba(17,28,45,0.98))",
          border: "1.5px solid rgba(86,164,203,0.34)",
          borderRadius: 14,
          boxShadow: "0 0 28px rgba(86,164,203,0.16), 0 24px 56px rgba(0,0,0,0.45)",
          overflow: "hidden",
          fontFamily: "var(--font-space-grotesk), sans-serif",
        }}
      >
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid rgba(86,164,203,0.14)" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2.4, color: "#56a4cb", textTransform: "uppercase", marginBottom: 6 }}>
            Account Access
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#b9e7f4", marginBottom: 6 }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: "rgba(185,231,244,0.62)", lineHeight: 1.5 }}>
            {subtitle}
          </div>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
              style={{
                width: "100%",
                borderRadius: 8,
                padding: "12px 14px",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 1.1,
                textTransform: "uppercase",
                cursor: action.disabled ? "default" : "pointer",
                opacity: action.disabled ? 0.6 : 1,
                color: action.danger ? "#fecaca" : action.accent ? "#020202" : "#b9e7f4",
                background: action.danger
                  ? "linear-gradient(135deg, rgba(127,29,29,0.9), rgba(239,68,68,0.22))"
                  : action.accent
                    ? "linear-gradient(135deg, #56a4cb, #b9e7f4)"
                    : "linear-gradient(135deg, rgba(34,47,66,0.95), rgba(86,164,203,0.2))",
                border: action.danger
                  ? "1px solid rgba(239,68,68,0.4)"
                  : action.accent
                    ? "1px solid rgba(185,231,244,0.85)"
                    : "1px solid rgba(86,164,203,0.3)",
                boxShadow: action.accent ? "0 0 18px rgba(86,164,203,0.2)" : "none",
              }}
            >
              {action.label}
            </button>
          ))}

          <button
            onClick={onClose}
            style={{
              width: "100%",
              borderRadius: 8,
              padding: "11px 14px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              cursor: "pointer",
              color: "rgba(185,231,244,0.72)",
              background: "rgba(86,164,203,0.06)",
              border: "1px solid rgba(86,164,203,0.14)",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Web3AuthWalletButton({ base, address, playerName }: { base: React.CSSProperties; address?: `0x${string}`; playerName: string }) {
  const { connect, loading: connecting } = useWeb3AuthConnect();
  const { disconnect, loading: disconnecting } = useWeb3AuthDisconnect();
  const { isConnected: web3AuthConnected, isInitializing } = useWeb3Auth();
  const { setMode, socialLoginRequested, clearSocialLoginRequest } = useAuthMode();
  const [showChooser, setShowChooser] = useState(false);
  const connected = Boolean(address);
  const syncingWallet = web3AuthConnected && !address;
  const busy = connecting || disconnecting || isInitializing || syncingWallet;

  useEffect(() => {
    if (!socialLoginRequested || web3AuthConnected || connecting || disconnecting || isInitializing) return;

    let cancelled = false;

    void (async () => {
      await connect();
      if (!cancelled) clearSocialLoginRequest();
    })();

    return () => {
      cancelled = true;
    };
  }, [
    clearSocialLoginRequest,
    connect,
    connecting,
    disconnecting,
    isInitializing,
    socialLoginRequested,
    web3AuthConnected,
  ]);

  const statusText = isInitializing
    ? "INITIALIZING..."
    : syncingWallet
      ? "SYNCING..."
      : busy
        ? "LOADING..."
        : connected
          ? (playerName || formatAddress(address!))
          : "SIGN IN";

  return (
    <>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <MuteButton />
      {connected && address && <Balances address={address} />}
      <button
        onClick={() => setShowChooser(true)}
        style={{
          ...base,
          cursor: "pointer",
          opacity: busy ? 0.75 : 1,
          background: connected
            ? "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(86,164,203,0.18))"
            : "linear-gradient(135deg, rgba(34,47,66,0.95), rgba(86,164,203,0.28))",
        }}
        title={connected ? "Sign out" : "Sign in with social login"}
      >
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: connected ? "#4ade80" : "#56a4cb",
            boxShadow: `0 0 6px ${connected ? "#4ade80" : "#56a4cb"}`,
          }}
        />
        <div>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: "#56a4cb", textTransform: "uppercase", lineHeight: 1 }}>
            {connected ? "SOCIAL WALLET" : "SOCIAL LOGIN"}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#b9e7f4", letterSpacing: 1, lineHeight: 1.5 }}>
            {statusText}
          </div>
        </div>
      </button>
    </div>
    <WalletChooser
      open={showChooser}
      onClose={() => setShowChooser(false)}
      title={connected ? "Social Wallet Connected" : "Choose Login Method"}
      subtitle={
        connected
          ? "This session is using your Web3Auth social wallet. Switch back to wallet connect if you want to use your verified CELO wallet."
          : "Pick the wallet source you want to use for passes, GoodDollar verification, and game identity."
      }
      actions={
        connected
          ? [
              {
                label: "Sign Out Social Wallet",
                danger: true,
                disabled: busy,
                onClick: () => {
                  setShowChooser(false);
                  void disconnect({ cleanup: true });
                },
              },
              {
                label: "Use Wallet Connect",
                accent: true,
                disabled: busy,
                onClick: () => {
                  clearSocialLoginRequest();
                  setMode("wagmi");
                  setShowChooser(false);
                },
              },
            ]
          : [
              {
                label: "Continue With Social Login",
                accent: true,
                disabled: busy,
                onClick: () => {
                  setShowChooser(false);
                  void connect();
                },
              },
              {
                label: "Use Wallet Connect",
                disabled: busy,
                onClick: () => {
                  clearSocialLoginRequest();
                  setMode("wagmi");
                  setShowChooser(false);
                },
              },
            ]
      }
    />
    </>
  );
}

function WagmiWalletButton({
  base,
  address,
  playerName,
  accountDisplayName,
  accountAddress,
  connected,
  web3AuthEnabled,
  openConnectModal,
  openAccountModal,
  requestSocialLogin,
}: {
  base: React.CSSProperties;
  address?: `0x${string}`;
  playerName: string;
  accountDisplayName?: string;
  accountAddress?: string;
  connected: boolean;
  web3AuthEnabled: boolean;
  openConnectModal: () => void;
  openAccountModal: () => void;
  requestSocialLogin: () => void;
}) {
  const [showChooser, setShowChooser] = useState(false);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <MuteButton />
        {connected && address && <Balances address={address} />}
        <button
          onClick={() => setShowChooser(true)}
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
              {connected ? "CELO WALLET" : "LOGIN"}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#b9e7f4", letterSpacing: 1, lineHeight: 1.5 }}>
              {connected ? (playerName || accountDisplayName || formatAddress(accountAddress!)) : "CHOOSE METHOD"}
            </div>
          </div>
        </button>
      </div>
      <WalletChooser
        open={showChooser}
        onClose={() => setShowChooser(false)}
        title={connected ? "Wallet Connected" : "Choose Login Method"}
        subtitle={
          connected
            ? "Your season pass and GoodDollar status follow the connected address. Open your wallet or switch to social login if you want a different identity."
            : "Use wallet connect for your normal CELO wallet, or choose social login for a separate Web3Auth wallet."
        }
        actions={
          connected
            ? [
                {
                  label: "Open Wallet",
                  accent: true,
                  onClick: () => {
                    setShowChooser(false);
                    openAccountModal();
                  },
                },
                ...(web3AuthEnabled && !isMiniPay()
                  ? [{
                      label: "Use Social Login",
                      onClick: () => {
                        setShowChooser(false);
                        requestSocialLogin();
                      },
                    }]
                  : []),
              ]
            : [
                {
                  label: "Continue With Wallet Connect",
                  accent: true,
                  onClick: () => {
                    setShowChooser(false);
                    openConnectModal();
                  },
                },
                ...(web3AuthEnabled && !isMiniPay()
                  ? [{
                      label: "Continue With Social Login",
                      onClick: () => {
                        setShowChooser(false);
                        requestSocialLogin();
                      },
                    }]
                  : []),
              ]
        }
      />
    </>
  );
}

export function WalletSection() {
  const { address, isConnected } = useAccount();
  const { playerName } = useGameStore();
  const { mode, web3AuthEnabled, requestSocialLogin } = useAuthMode();

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

  if (mode === "web3auth" && !isMiniPay()) {
    return <Web3AuthWalletButton base={base} address={address} playerName={playerName} />;
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

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
        if (!mounted) return null;
        const connected = !!(account && chain);
        return (
          <WagmiWalletButton
            base={base}
            address={address}
            playerName={playerName}
            accountDisplayName={account?.displayName}
            accountAddress={account?.address}
            connected={connected}
            web3AuthEnabled={web3AuthEnabled}
            openConnectModal={openConnectModal}
            openAccountModal={openAccountModal}
            requestSocialLogin={requestSocialLogin}
          />
        );
      }}
    </ConnectButton.Custom>
  );
}
