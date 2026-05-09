"use client";

import { useState, useEffect, useRef } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
  useSendTransaction,
  useConnect,
  useSwitchChain,
} from "wagmi";
import { celo } from "wagmi/chains";
import { CUSD_CONTRACT, ERC20_ABI, TREASURY_ADDRESS } from "../lib/cusd";
import { ARENA_ADDRESS, ARENA_ABI, APPROVE_ABI, matchIdToBytes32 } from "../lib/arena";
import { GDOLLAR_CONTRACT, GDOLLAR_ABI, GDOLLAR_COLOR } from "../lib/gooddollar";
import { useGameStore } from "../lib/gameStore";
import { formatUnits } from "viem";
import { getMiniPayConnector, isMiniPay, sendMiniPayNativeTransaction } from "../lib/minipay";
import { DESIGN_W, DESIGN_H } from "../lib/designConstants";

type Props = {
  onConfirmed: () => void;
  onSkip: () => void;
  lockedAmountRaw?: string; // bigint string from server; joiner must match host
  lockedCurrency?: Currency;
};

type Step = "idle" | "approving" | "approved" | "entering" | "done" | "error";
type Currency = "cusd" | "celo" | "gdollar";

const USE_CONTRACT = ARENA_ADDRESS !== "0x0000000000000000000000000000000000000000";

const CURRENCY_CONFIG: Record<Currency, { label: string; color: string; symbol: string }> = {
  cusd:    { label: "cUSD",    color: "#56a4cb",     symbol: "cUSD" },
  celo:    { label: "CELO",    color: "#f9c846",     symbol: "CELO" },
  gdollar: { label: "G$",      color: GDOLLAR_COLOR, symbol: "G$" },
};

export function WagerModal({ onConfirmed, onSkip, lockedAmountRaw, lockedCurrency }: Props) {
  const isMp = isMiniPay();
  const wrapRef = useRef<HTMLDivElement>(null);
  const pendingAddressRef = useRef<`0x${string}` | null>(null);
  const { address, isConnected, chainId } = useAccount();
  const setWager            = useGameStore((s) => s.setWager);
  const matchId             = useGameStore((s) => s.matchId);
  const playerRole          = useGameStore((s) => s.playerRole);
  const setWagerAmountInput = useGameStore((s) => s.setWagerAmountInput);

  const formatLockedAmount = (raw?: string) => {
    if (!raw) return null;
    try {
      return formatUnits(BigInt(raw), 18);
    } catch {
      return null;
    }
  };

  const [step, setStep]         = useState<Step>("idle");
  const [errMsg, setErrMsg]     = useState("");
  const [currency, setCurrency] = useState<Currency>(lockedCurrency ?? "celo");
  const [amountInput, setAmountInput] = useState(formatLockedAmount(lockedAmountRaw) ?? "0.01");

  useEffect(() => {
    const scale = () => {
      if (!wrapRef.current) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isPortrait = vh > vw;
      let transform: string;
      if (isPortrait) {
        const s = Math.min(vw / DESIGN_H, vh / DESIGN_W);
        const tx = vw / 2 + (DESIGN_H * s) / 2;
        const ty = vh / 2 - (DESIGN_W * s) / 2;
        transform = `translate(${tx}px, ${ty}px) rotate(90deg) scale(${s})`;
      } else {
        const s = Math.min(vw / DESIGN_W, vh / DESIGN_H);
        const tx = (vw - DESIGN_W * s) / 2;
        const ty = (vh - DESIGN_H * s) / 2;
        transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      }
      wrapRef.current.style.transform = transform;
    };
    scale();
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, [isMp]);

  const { writeContractAsync }  = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const { connectAsync } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const [txHash, setTxHash]     = useState<`0x${string}` | undefined>();

  useEffect(() => {
    pendingAddressRef.current = address ?? null;
  }, [address]);

  useEffect(() => {
    if (lockedCurrency) setCurrency(lockedCurrency);
    const formatted = formatLockedAmount(lockedAmountRaw);
    if (formatted) setAmountInput(formatted);
  }, [lockedAmountRaw, lockedCurrency]);

  // Check existing cUSD allowance for the arena (only relevant for cUSD path)
  const { data: allowance } = useReadContract({
    address: CUSD_CONTRACT,
    abi: APPROVE_ABI,
    functionName: "allowance",
    args: address && USE_CONTRACT ? [address, ARENA_ADDRESS] : undefined,
    query: { enabled: !!address && USE_CONTRACT && currency === "cusd" },
  });

  const { isSuccess: txSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // After approve confirms → move to entering (cUSD only)
  useEffect(() => {
    if (txSuccess && step === "approving") {
      setStep("approved");
    }
  }, [txSuccess, step]);

  // Parse amount input to bigint (18 decimals). Returns 0n on invalid input.
  const parsedAmount = (): bigint => {
    try {
      const { parseUnits } = require("viem") as typeof import("viem");
      const val = amountInput.trim();
      if (!val || isNaN(Number(val)) || Number(val) <= 0) return 0n;
      return parseUnits(val as `${number}`, 18);
    } catch {
      return 0n;
    }
  };

  // Register wager TX + amount with the match server
  const registerWagerOnServer = async (hash: `0x${string}`, activeAddress: `0x${string}` | null) => {
    if (!matchId || !playerRole) return null;
    const res = await fetch(`/api/match/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "wager",
        role: playerRole,
        address: activeAddress,
        wagerTx: hash,
        wagerAmount: parsedAmount().toString(),
        wagerCurrency: currency,
      }),
    });
    if (res.ok) return null;
    try {
      const data = await res.json() as { error?: string };
      return data.error ?? "Failed to register wager on the match server.";
    } catch {
      return "Failed to register wager on the match server.";
    }
  };

  // After enterMatch confirms → done
  useEffect(() => {
    if (!(txSuccess && step === "entering" && txHash)) return;
    let cancelled = false;
    void (async () => {
      const error = await registerWagerOnServer(txHash, pendingAddressRef.current);
      if (cancelled) return;
      if (error) {
        setErrMsg(error);
        setStep("error");
        return;
      }
      setStep("done");
      setWager(true, txHash, currency);
      setWagerAmountInput(amountInput);
      onConfirmed();
    })();
    return () => {
      cancelled = true;
    };
  }, [amountInput, currency, onConfirmed, setWager, setWagerAmountInput, step, txHash, txSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  // When cUSD approved → automatically call enterMatch
  useEffect(() => {
    if (step === "approved") void handleEnterMatch();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const ensureWalletReady = async () => {
    let activeAddress = address;
    let activeChainId = chainId;
    let connected = isConnected;

    if (!connected && isMiniPay()) {
      const connector = getMiniPayConnector();
      const result = await connectAsync({ connector, chainId: celo.id });
      activeAddress = result.accounts[0] as `0x${string}` | undefined;
      activeChainId = result.chainId;
      connected = true;
    }

    if (!connected || !activeAddress) {
      throw new Error("Connect your wallet first.");
    }

    if (activeChainId !== celo.id) {
      await switchChainAsync({ chainId: celo.id });
      activeChainId = celo.id;
    }

    if (activeChainId !== celo.id) {
      throw new Error("Switch to Celo and try again.");
    }

    pendingAddressRef.current = activeAddress;
    return activeAddress;
  };

  const handlePay = async () => {
    setErrMsg("");
    let activeAddress: `0x${string}`;
    try {
      activeAddress = await ensureWalletReady();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Wallet not connected.");
      setStep("error");
      return;
    }

    if (currency === "gdollar") {
      await handleGDollarTransfer(activeAddress);
      return;
    }

    if (currency === "celo") {
      if (!USE_CONTRACT) {
        await handleDirectCeloTransfer(activeAddress);
      } else {
        await handleEnterMatchWithCelo(activeAddress);
      }
      return;
    }

    // cUSD path
    if (!USE_CONTRACT) {
      await handleDirectTransfer(activeAddress);
      return;
    }

    const alreadyApproved = (allowance ?? 0n) >= parsedAmount();
    if (alreadyApproved) {
      setStep("approved");
    } else {
      await handleApprove(activeAddress);
    }
  };

  // ── G$: direct ERC-20 transfer to treasury ────────────────────────────────
  const handleGDollarTransfer = async (activeAddress: `0x${string}`) => {
    const TREASURY = TREASURY_ADDRESS;
    const amt = parsedAmount();
    if (amt === 0n) { setErrMsg("Enter a valid stake amount."); return; }
    setStep("entering");
    try {
      const hash = await writeContractAsync({
        address: GDOLLAR_CONTRACT,
        abi: GDOLLAR_ABI,
        functionName: "transfer",
        args: [TREASURY, amt],
        account: activeAddress,
        chainId: celo.id,
      });
      setTxHash(hash);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message.slice(0, 120) : "G$ transfer failed.");
      setStep("error");
    }
  };

  // ── cUSD: approve ────────────────────────────────────────────────────────
  const handleApprove = async (activeAddress: `0x${string}`) => {
    const amt = parsedAmount();
    if (amt === 0n) { setErrMsg("Enter a valid stake amount."); return; }
    setStep("approving");
    try {
      const hash = await writeContractAsync({
        address: CUSD_CONTRACT,
        abi: APPROVE_ABI,
        functionName: "approve",
        args: [ARENA_ADDRESS, amt],
        account: activeAddress,
        chainId: celo.id,
      });
      setTxHash(hash);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message.slice(0, 120) : "Approve failed.");
      setStep("error");
    }
  };

  // ── cUSD: enterMatch ─────────────────────────────────────────────────────
  const handleEnterMatch = async () => {
    if (!matchId) { setErrMsg("No match ID."); setStep("error"); return; }
    setStep("entering");
    try {
      const hash = await writeContractAsync({
        address: ARENA_ADDRESS,
        abi: ARENA_ABI,
        functionName: "enterMatch",
        args: [matchIdToBytes32(matchId)],
        account: pendingAddressRef.current ?? address,
        chainId: celo.id,
      });
      setTxHash(hash);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message.slice(0, 120) : "Transaction failed.");
      setStep("error");
    }
  };

  // ── CELO: enterMatchWithCelo ──────────────────────────────────────────────
  const handleEnterMatchWithCelo = async (activeAddress: `0x${string}`) => {
    if (!matchId) { setErrMsg("No match ID."); setStep("error"); return; }
    const amt = parsedAmount();
    if (amt === 0n) { setErrMsg("Enter a valid stake amount."); return; }
    setStep("entering");
    try {
      const hash = await writeContractAsync({
        address: ARENA_ADDRESS,
        abi: ARENA_ABI,
        functionName: "enterMatchWithCelo",
        args: [matchIdToBytes32(matchId)],
        value: amt,
        account: activeAddress,
        chainId: celo.id,
      });
      setTxHash(hash);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message.slice(0, 120) : "Transaction failed.");
      setStep("error");
    }
  };

  // ── Fallbacks (no contract deployed) ─────────────────────────────────────
  const handleDirectTransfer = async (activeAddress: `0x${string}`) => {
    const TREASURY = TREASURY_ADDRESS;
    const amt = parsedAmount();
    if (amt === 0n) { setErrMsg("Enter a valid stake amount."); return; }
    setStep("entering");
    try {
      const hash = await writeContractAsync({
        address: CUSD_CONTRACT,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [TREASURY, amt],
        account: activeAddress,
        chainId: celo.id,
      });
      setTxHash(hash);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message.slice(0, 120) : "Transaction failed.");
      setStep("error");
    }
  };

  const handleDirectCeloTransfer = async (activeAddress: `0x${string}`) => {
    const TREASURY = TREASURY_ADDRESS;
    const amt = parsedAmount();
    if (amt === 0n) { setErrMsg("Enter a valid stake amount."); return; }
    setStep("entering");
    try {
      const hash = isMiniPay()
        ? await sendMiniPayNativeTransaction({
            from: activeAddress,
            to: TREASURY,
            value: amt,
            gas: 21000n,
            data: "0x",
          })
        : await sendTransactionAsync({
            to: TREASURY,
            value: amt,
            account: activeAddress,
            chainId: celo.id,
          });
      setTxHash(hash);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message.slice(0, 120) : "Transaction failed.");
      setStep("error");
    }
  };

  const busy = ["approving", "approved", "entering"].includes(step);

  const statusLabel = () => {
    if (step === "approving") return "Approving cUSD spend…";
    if (step === "approved")  return "Approval confirmed — entering match…";
    if (step === "entering")  return currency === "gdollar" ? "Sending G$…" : "Waiting for confirmation…";
    return null;
  };

  const cfg = CURRENCY_CONFIG[currency];
  const stakeAmt = parsedAmount();
  const wagerDisplay = `${amountInput || "0"} ${cfg.symbol}`;
  const dualPayoutDisplay = stakeAmt > 0n
    ? `${formatUnits(stakeAmt * 2n * 9000n / 10000n, 18)} ${cfg.symbol}`
    : `— ${cfg.symbol}`;

  const payoutNote = currency === "gdollar"
    ? "Winnings stream to your wallet via Superfluid"
    : `If opponent also stakes, winner takes ${dualPayoutDisplay}`;

  // ── Default wager view ────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      backgroundColor: "rgba(5, 5, 16, 0.85)",
      backdropFilter: "blur(8px)",
      overflow: "hidden",
    }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          position: "relative", width: 420,
          background: "rgba(15, 23, 42, 0.95)",
          border: `2px solid ${cfg.color}`,
          borderRadius: 8,
          padding: "40px 40px 32px",
          boxShadow: `0 0 40px ${cfg.color}50`,
          fontFamily: "var(--font-space-grotesk), sans-serif",
          transition: "border-color 0.2s, box-shadow 0.2s",
        }}>
        {/* Scanline */}
        <div style={{ position: "absolute", top: -1, left: -1, right: -1, height: 2, backgroundColor: cfg.color, transition: "background-color 0.2s" }} />

        {/* Corner accents */}
        <div style={{ position: "absolute", top: -10, left: -10, width: 24, height: 24, borderLeft: "1.5px solid #b9e7f4", borderTop: "1.5px solid #b9e7f4" }} />
        <div style={{ position: "absolute", top: -10, right: -10, width: 24, height: 24, borderRight: "1.5px solid #b9e7f4", borderTop: "1.5px solid #b9e7f4" }} />
        <div style={{ position: "absolute", bottom: -10, left: -10, width: 24, height: 24, borderLeft: "1.5px solid #b9e7f4", borderBottom: "1.5px solid #b9e7f4" }} />
        <div style={{ position: "absolute", bottom: -10, right: -10, width: 24, height: 24, borderRight: "1.5px solid #b9e7f4", borderBottom: "1.5px solid #b9e7f4" }} />

        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 4, color: "#6b7280", textTransform: "uppercase", marginBottom: 10 }}>
          Match Wager
        </p>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: -0.5, margin: "0 0 16px" }}>
          Enter the Arena
        </h2>

        {/* Currency selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["cusd", "celo", "gdollar"] as Currency[]).map((c) => {
            const cc = CURRENCY_CONFIG[c];
            const disabledByLock = !!lockedCurrency && lockedCurrency !== c;
            return (
              <button
                key={c}
                onClick={() => { if (!busy && !disabledByLock) { setCurrency(c); setErrMsg(""); setStep("idle"); } }}
                disabled={busy || disabledByLock}
                style={{
                  flex: 1, padding: isMp ? "40px 0" : "8px 0",
                  background: currency === c ? `${cc.color}26` : "rgba(255,255,255,0.03)",
                  border: `1.5px solid ${currency === c ? cc.color : "#334155"}`,
                  borderRadius: 6, cursor: busy || disabledByLock ? "not-allowed" : "pointer",
                  fontSize: 12, fontWeight: 700,
                  color: currency === c ? cc.color : disabledByLock ? "rgba(107,114,128,0.35)" : "#6b7280",
                  opacity: disabledByLock ? 0.45 : 1,
                  letterSpacing: 1.5, textTransform: "uppercase",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                {cc.label}
              </button>
            );
          })}
        </div>

        {/* G$ streaming badge */}
        {currency === "gdollar" && (
          <div style={{
            marginBottom: 12, padding: "8px 14px",
            background: `${GDOLLAR_COLOR}18`,
            border: `1px solid ${GDOLLAR_COLOR}50`,
            borderRadius: 6, display: "flex", alignItems: "center", gap: 8,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: GDOLLAR_COLOR, boxShadow: `0 0 6px ${GDOLLAR_COLOR}`, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: GDOLLAR_COLOR, fontWeight: 700, letterSpacing: 0.5 }}>
              Powered by Superfluid · Winnings stream to your wallet
            </span>
          </div>
        )}

        {/* Stake amount input */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>
            {lockedAmountRaw ? "Host's Stake (must match)" : "Your Stake Amount"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 0, border: `1.5px solid ${lockedAmountRaw ? "#334155" : cfg.color}`, borderRadius: 6, overflow: "hidden" }}>
            <input
              type="number"
              min="0"
              step="0.001"
              value={amountInput}
              onChange={(e) => { if (!busy && !lockedAmountRaw) setAmountInput(e.target.value); }}
              disabled={busy || !!lockedAmountRaw}
              style={{
                flex: 1, padding: isMp ? "28px 14px" : "10px 14px",
                background: "rgba(0,0,0,0.4)",
                border: "none", outline: "none",
                fontSize: 18, fontWeight: 700, color: lockedAmountRaw ? "#6b7280" : "#f1f5f9",
                fontFamily: "inherit",
              }}
            />
            <div style={{ padding: isMp ? "28px 14px" : "10px 14px", background: "rgba(255,255,255,0.04)", fontSize: 13, fontWeight: 700, color: cfg.color, letterSpacing: 1 }}>
              {cfg.symbol}
            </div>
          </div>
          {lockedAmountRaw && (
            <p style={{ fontSize: 11, color: "#6b7280", margin: "6px 0 0", letterSpacing: 0.3 }}>
              Amount and token are set by the match host.
            </p>
          )}
        </div>

        {/* Wager breakdown */}
        <div style={{
          background: "rgba(17,10,24,0.6)", border: "1px solid #334155",
          borderRadius: 8, padding: "16px 20px", marginBottom: 24,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {[
            { label: "Your entry fee",       value: wagerDisplay,    color: cfg.color },
            { label: "Platform fee (10% each)", value: "from both sides", color: "#6b7280" },
            { label: "Win vs wagered opponent", value: currency === "gdollar" ? `~${dualPayoutDisplay} (streamed)` : dualPayoutDisplay, color: "#4ade80" },
            { label: "Win uncontested",       value: wagerDisplay,    color: "#94a3b8" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#6b7280", letterSpacing: 0.5 }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Status */}
        {statusLabel() && (
          <p style={{ fontSize: 12, color: "#b9e7f4", textAlign: "center", marginBottom: 16 }}>
            {statusLabel()}
          </p>
        )}
        {step === "error" && (
          <p style={{ fontSize: 11, color: "#f87171", textAlign: "center", marginBottom: 16, wordBreak: "break-word" }}>
            {errMsg || "Transaction failed."}
          </p>
        )}

        {/* Pay button */}
        <button
          onClick={() => void handlePay()}
          disabled={busy}
          style={{
            width: "100%", padding: isMp ? "36px 0" : "14px 0", marginBottom: 12,
            background: busy ? `${cfg.color}40` : `${cfg.color}18`,
            border: `1.5px solid ${cfg.color}`,
            borderRadius: 6, cursor: busy ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            transition: "all 0.2s",
          }}
        >
          <span className="material-icons" style={{ fontSize: 18, color: cfg.color }}>
            {busy ? "hourglass_empty" : currency === "gdollar" ? "stream" : "payments"}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: 3 }}>
            {busy ? "Processing…" : `Stake ${amountInput || "0"} ${cfg.symbol}`}
          </span>
        </button>

        {/* Back / Cancel */}
        <button
          onClick={onSkip}
          disabled={busy}
          style={{
            width: "100%", padding: isMp ? "38px 0" : "10px 0", marginTop: 4,
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 5,
            cursor: busy ? "not-allowed" : "pointer",
            fontSize: 11, fontWeight: 700, color: "#475569",
            letterSpacing: 2, textTransform: "uppercase",
            fontFamily: "inherit",
            transition: "color 0.15s",
          }}
        >
          ← Back
        </button>
      </div>
    </div>
  </div>
);
}
