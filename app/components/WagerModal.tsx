"use client";

import { useState, useEffect } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
  useSendTransaction,
} from "wagmi";
import { CUSD_CONTRACT, WAGER_AMOUNT, ERC20_ABI, WAGER_AMOUNT_CELO } from "../lib/cusd";
import { ARENA_ADDRESS, ARENA_ABI, APPROVE_ABI, matchIdToBytes32 } from "../lib/arena";
import { useGameStore } from "../lib/gameStore";

type Props = {
  onConfirmed: () => void;
  onSkip: () => void;
};

type Step = "idle" | "approving" | "approved" | "entering" | "done" | "error";
type Currency = "cusd" | "celo";

const USE_CONTRACT = ARENA_ADDRESS !== "0x0000000000000000000000000000000000000000";

export function WagerModal({ onConfirmed, onSkip }: Props) {
  const { address } = useAccount();
  const setWager = useGameStore((s) => s.setWager);
  const matchId  = useGameStore((s) => s.matchId);

  const [step, setStep]         = useState<Step>("idle");
  const [errMsg, setErrMsg]     = useState("");
  const [currency, setCurrency] = useState<Currency>("cusd");

  const { writeContractAsync }  = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const [txHash, setTxHash]     = useState<`0x${string}` | undefined>();

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

  // After enterMatch confirms → done
  useEffect(() => {
    if (txSuccess && step === "entering") {
      setStep("done");
      setWager(true, txHash ?? null, currency);
      onConfirmed();
    }
  }, [txSuccess, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // When cUSD approved → automatically call enterMatch
  useEffect(() => {
    if (step === "approved") void handleEnterMatch();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePay = async () => {
    if (!address) { setErrMsg("Wallet not connected."); return; }
    setErrMsg("");

    if (currency === "celo") {
      if (!USE_CONTRACT) {
        await handleDirectCeloTransfer();
      } else {
        await handleEnterMatchWithCelo();
      }
      return;
    }

    // cUSD path
    if (!USE_CONTRACT) {
      await handleDirectTransfer();
      return;
    }

    const alreadyApproved = (allowance ?? 0n) >= WAGER_AMOUNT;
    if (alreadyApproved) {
      setStep("approved");
    } else {
      await handleApprove();
    }
  };

  // ── cUSD: approve ────────────────────────────────────────────────────────
  const handleApprove = async () => {
    setStep("approving");
    try {
      const hash = await writeContractAsync({
        address: CUSD_CONTRACT,
        abi: APPROVE_ABI,
        functionName: "approve",
        args: [ARENA_ADDRESS, WAGER_AMOUNT],
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
      });
      setTxHash(hash);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message.slice(0, 120) : "Transaction failed.");
      setStep("error");
    }
  };

  // ── CELO: enterMatchWithCelo ──────────────────────────────────────────────
  const handleEnterMatchWithCelo = async () => {
    if (!matchId) { setErrMsg("No match ID."); setStep("error"); return; }
    setStep("entering");
    try {
      const hash = await writeContractAsync({
        address: ARENA_ADDRESS,
        abi: ARENA_ABI,
        functionName: "enterMatchWithCelo",
        args: [matchIdToBytes32(matchId)],
        value: WAGER_AMOUNT_CELO,
      });
      setTxHash(hash);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message.slice(0, 120) : "Transaction failed.");
      setStep("error");
    }
  };

  // ── Fallbacks (no contract deployed) ─────────────────────────────────────
  const handleDirectTransfer = async () => {
    const TREASURY = (process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;
    setStep("entering");
    try {
      const hash = await writeContractAsync({
        address: CUSD_CONTRACT,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [TREASURY, WAGER_AMOUNT],
      });
      setTxHash(hash);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message.slice(0, 120) : "Transaction failed.");
      setStep("error");
    }
  };

  const handleDirectCeloTransfer = async () => {
    const TREASURY = (process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;
    setStep("entering");
    try {
      const hash = await sendTransactionAsync({
        to: TREASURY,
        value: WAGER_AMOUNT_CELO,
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
    if (step === "entering")  return "Waiting for confirmation…";
    return null;
  };

  const isCelo = currency === "celo";
  const tokenSymbol = isCelo ? "CELO" : "cUSD";
  const entryDisplay = `0.000007 ${tokenSymbol}`;
  const payoutDisplay = `0.000007 ${tokenSymbol}`;
  const entryColor = isCelo ? "#f9c846" : "#b9e7f4";
  const payoutColor = "#4ade80";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: "rgba(5, 5, 16, 0.85)",
      backdropFilter: "blur(8px)",
    }}>
      <div style={{
        position: "relative", width: 420,
        background: "rgba(15, 23, 42, 0.95)",
        border: `2px solid ${isCelo ? "#f9c846" : "#56a4cb"}`,
        borderRadius: 8,
        padding: "40px 40px 32px",
        boxShadow: `0 0 40px ${isCelo ? "rgba(249,200,70,0.3)" : "rgba(86,164,203,0.3)"}`,
        fontFamily: "var(--font-space-grotesk), sans-serif",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}>
        {/* Scanline */}
        <div style={{ position: "absolute", top: -1, left: -1, right: -1, height: 2, backgroundColor: isCelo ? "#f9c846" : "#56a4cb", transition: "background-color 0.2s" }} />

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
          {(["cusd", "celo"] as Currency[]).map((c) => (
            <button
              key={c}
              onClick={() => { if (!busy) { setCurrency(c); setErrMsg(""); setStep("idle"); } }}
              disabled={busy}
              style={{
                flex: 1, padding: "8px 0",
                background: currency === c
                  ? (c === "celo" ? "rgba(249,200,70,0.15)" : "rgba(86,164,203,0.15)")
                  : "rgba(255,255,255,0.03)",
                border: `1.5px solid ${currency === c ? (c === "celo" ? "#f9c846" : "#56a4cb") : "#334155"}`,
                borderRadius: 6, cursor: busy ? "not-allowed" : "pointer",
                fontSize: 13, fontWeight: 700,
                color: currency === c ? (c === "celo" ? "#f9c846" : "#56a4cb") : "#6b7280",
                letterSpacing: 2, textTransform: "uppercase",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              {c === "cusd" ? "cUSD" : "CELO"}
            </button>
          ))}
        </div>

        <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 24, lineHeight: 1.6 }}>
          Stake <strong style={{ color: entryColor }}>{entryDisplay}</strong> to play.
          Win and claim <strong style={{ color: payoutColor }}>{payoutDisplay}</strong> back.
        </p>

        {/* Wager breakdown */}
        <div style={{
          background: "rgba(17,10,24,0.6)", border: "1px solid #334155",
          borderRadius: 8, padding: "16px 20px", marginBottom: 24,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {[
            { label: "Entry fee",  value: entryDisplay,  color: entryColor },
            { label: "Win payout", value: payoutDisplay, color: payoutColor },
            { label: "House cut",  value: "0%",          color: "#6b7280" },
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
            width: "100%", padding: "14px 0", marginBottom: 12,
            background: busy
              ? "rgba(86,164,203,0.3)"
              : isCelo
              ? "linear-gradient(135deg, #2a2010, #f9c84640)"
              : "linear-gradient(135deg, #222f42, #56a4cb40)",
            border: `1.5px solid ${isCelo ? "#f9c846" : "#56a4cb"}`,
            borderRadius: 6, cursor: busy ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            transition: "all 0.2s",
          }}
        >
          <span className="material-icons" style={{ fontSize: 18, color: "#fff" }}>
            {busy ? "hourglass_empty" : "payments"}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: 3 }}>
            {busy ? "Processing…" : `Pay ${entryDisplay}`}
          </span>
        </button>

        <button
          onClick={onSkip}
          disabled={busy}
          style={{
            width: "100%", background: "none", border: "none",
            cursor: busy ? "not-allowed" : "pointer",
            fontSize: 12, color: "#6b7280", letterSpacing: 1,
            textTransform: "uppercase", fontFamily: "inherit", padding: "8px 0",
          }}
        >
          Skip — Play for free
        </button>
      </div>
    </div>
  );
}
