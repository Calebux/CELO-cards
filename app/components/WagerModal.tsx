"use client";

import { useState, useEffect, useRef } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
  useSendTransaction,
} from "wagmi";
import { CUSD_CONTRACT, WAGER_AMOUNT, ERC20_ABI, WAGER_AMOUNT_CELO, DUAL_WAGER_PAYOUT, DUAL_WAGER_PAYOUT_CELO } from "../lib/cusd";
import { ARENA_ADDRESS, ARENA_ABI, APPROVE_ABI, matchIdToBytes32 } from "../lib/arena";
import { GDOLLAR_CONTRACT, GDOLLAR_ABI, WAGER_AMOUNT_GDOLLAR, GDOLLAR_COLOR, DUAL_WAGER_PAYOUT_GDOLLAR } from "../lib/gooddollar";
import { useGameStore } from "../lib/gameStore";
import { formatUnits } from "viem";

type Props = {
  onConfirmed: () => void;
  onSkip: () => void;
  lockedAmount?: string; // pre-filled, read-only (joiner matching host's stake, e.g. "0.01")
  mode?: "wager" | "ranked"; // ranked = match-fee-only view
};

type Step = "idle" | "approving" | "approved" | "entering" | "done" | "error";
type Currency = "cusd" | "celo" | "gdollar";

const USE_CONTRACT = ARENA_ADDRESS !== "0x0000000000000000000000000000000000000000";

const CURRENCY_CONFIG: Record<Currency, { label: string; color: string; symbol: string }> = {
  cusd:    { label: "cUSD",    color: "#56a4cb",     symbol: "cUSD" },
  celo:    { label: "CELO",    color: "#f9c846",     symbol: "CELO" },
  gdollar: { label: "G$",      color: GDOLLAR_COLOR, symbol: "G$" },
};

const DESIGN_W = 1440;
const DESIGN_H = 823;

export function WagerModal({ onConfirmed, onSkip, lockedAmount, mode = "wager" }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { address, chainId } = useAccount();
  const setWager            = useGameStore((s) => s.setWager);
  const matchId             = useGameStore((s) => s.matchId);
  const playerRole          = useGameStore((s) => s.playerRole);
  const setWagerAmountInput = useGameStore((s) => s.setWagerAmountInput);

  const [step, setStep]         = useState<Step>("idle");
  const [errMsg, setErrMsg]     = useState("");
  const [currency, setCurrency] = useState<Currency>("celo");
  const [amountInput, setAmountInput] = useState(lockedAmount ?? "0.01");

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
  }, []);

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
  const registerWagerOnServer = (hash: `0x${string}`) => {
    if (!matchId || !playerRole) return;
    void fetch(`/api/match/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "wager",
        role: playerRole,
        wagerTx: hash,
        wagerAmount: parsedAmount().toString(),
      }),
    });
  };

  // After enterMatch confirms → done
  useEffect(() => {
    if (txSuccess && step === "entering") {
      setStep("done");
      setWager(true, txHash ?? null, currency, mode);
      setWagerAmountInput(amountInput);
      if (txHash) registerWagerOnServer(txHash);
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

    // Ranked mode: the match fee is a simple treasury payment — no Arena
    // contract interaction needed, so no matchId is required.
    if (mode === "ranked") {
      if (currency === "gdollar") {
        await handleGDollarTransfer();
      } else {
        await handleDirectCeloTransfer();
      }
      return;
    }

    if (currency === "gdollar") {
      await handleGDollarTransfer();
      return;
    }

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

    const alreadyApproved = (allowance ?? 0n) >= parsedAmount();
    if (alreadyApproved) {
      setStep("approved");
    } else {
      await handleApprove();
    }
  };

  // ── G$: direct ERC-20 transfer to treasury ────────────────────────────────
  const handleGDollarTransfer = async () => {
    const TREASURY = "0xBa37dd0890AFc659a25331871319f66E7EBA3522" as `0x${string}`;
    const amt = parsedAmount();
    if (amt === 0n) { setErrMsg("Enter a valid stake amount."); return; }
    setStep("entering");
    try {
      const hash = await writeContractAsync({
        address: GDOLLAR_CONTRACT,
        abi: GDOLLAR_ABI,
        functionName: "transfer",
        args: [TREASURY, amt],
        account: address,
        chainId: chainId,
      });
      setTxHash(hash);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message.slice(0, 120) : "G$ transfer failed.");
      setStep("error");
    }
  };

  // ── cUSD: approve ────────────────────────────────────────────────────────
  const handleApprove = async () => {
    const amt = parsedAmount();
    if (amt === 0n) { setErrMsg("Enter a valid stake amount."); return; }
    setStep("approving");
    try {
      const hash = await writeContractAsync({
        address: CUSD_CONTRACT,
        abi: APPROVE_ABI,
        functionName: "approve",
        args: [ARENA_ADDRESS, amt],
        account: address,
        chainId: chainId,
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
        account: address,
        chainId: chainId,
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
        account: address,
        chainId: chainId,
      });
      setTxHash(hash);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message.slice(0, 120) : "Transaction failed.");
      setStep("error");
    }
  };

  // ── Fallbacks (no contract deployed) ─────────────────────────────────────
  const handleDirectTransfer = async () => {
    const TREASURY = "0xBa37dd0890AFc659a25331871319f66E7EBA3522" as `0x${string}`;
    const amt = parsedAmount();
    if (amt === 0n) { setErrMsg("Enter a valid stake amount."); return; }
    setStep("entering");
    try {
      const hash = await writeContractAsync({
        address: CUSD_CONTRACT,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [TREASURY, amt],
        account: address,
        chainId: chainId,
      });
      setTxHash(hash);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message.slice(0, 120) : "Transaction failed.");
      setStep("error");
    }
  };

  const handleDirectCeloTransfer = async () => {
    const TREASURY = "0xBa37dd0890AFc659a25331871319f66E7EBA3522" as `0x${string}`;
    const amt = parsedAmount();
    if (amt === 0n) { setErrMsg("Enter a valid stake amount."); return; }
    setStep("entering");
    try {
      const hash = await sendTransactionAsync({
        to: TREASURY,
        value: amt,
        account: address,
        chainId: chainId,
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

  // ── Ranked match-fee-only view ────────────────────────────────────────────
  if (mode === "ranked") {
    const RANKED_COLOR = "#f59e0b";
    const MATCH_FEE = lockedAmount ?? "0.000007";
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 200,
        backgroundColor: "rgba(5, 5, 16, 0.88)",
        backdropFilter: "blur(10px)",
        overflow: "hidden",
      }}>
        <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            position: "relative", width: 440,
            background: "rgba(12, 18, 36, 0.97)",
            border: `2px solid ${RANKED_COLOR}`,
            borderRadius: 10,
            padding: "44px 44px 36px",
            boxShadow: `0 0 60px ${RANKED_COLOR}40, 0 0 120px ${RANKED_COLOR}18`,
            fontFamily: "var(--font-space-grotesk), sans-serif",
          }}>
            {/* Scanline top */}
            <div style={{ position: "absolute", top: -1, left: -1, right: -1, height: 2, background: `linear-gradient(90deg, transparent, ${RANKED_COLOR}, transparent)` }} />
            {/* Corner accents */}
            <div style={{ position: "absolute", top: -10, left: -10, width: 24, height: 24, borderLeft: `1.5px solid ${RANKED_COLOR}`, borderTop: `1.5px solid ${RANKED_COLOR}` }} />
            <div style={{ position: "absolute", top: -10, right: -10, width: 24, height: 24, borderRight: `1.5px solid ${RANKED_COLOR}`, borderTop: `1.5px solid ${RANKED_COLOR}` }} />
            <div style={{ position: "absolute", bottom: -10, left: -10, width: 24, height: 24, borderLeft: `1.5px solid ${RANKED_COLOR}`, borderBottom: `1.5px solid ${RANKED_COLOR}` }} />
            <div style={{ position: "absolute", bottom: -10, right: -10, width: 24, height: 24, borderRight: `1.5px solid ${RANKED_COLOR}`, borderBottom: `1.5px solid ${RANKED_COLOR}` }} />

            {/* Header */}
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 4, color: RANKED_COLOR, textTransform: "uppercase", marginBottom: 8 }}>
              Ranked Match
            </p>
            <h2 style={{ fontSize: 30, fontWeight: 900, color: "#f1f5f9", textTransform: "uppercase", letterSpacing: -0.5, margin: "0 0 6px" }}>
              Enter the Realm
            </h2>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 28px", lineHeight: 1.6 }}>
              Ranked matches require a small match fee. Climb the leaderboard and qualify for the weekly tournament.
            </p>

            {/* Currency selector for Ranked */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {(["celo", "gdollar"] as Currency[]).map((c) => {
                const cc = CURRENCY_CONFIG[c];
                return (
                  <button
                    key={c}
                    onClick={() => { if (!busy) { setCurrency(c); setErrMsg(""); setStep("idle"); } }}
                    disabled={busy}
                    style={{
                      flex: 1, padding: "8px 0",
                      background: currency === c ? `${cc.color}26` : "rgba(255,255,255,0.03)",
                      border: `1.5px solid ${currency === c ? cc.color : "#334155"}`,
                      borderRadius: 6, cursor: busy ? "not-allowed" : "pointer",
                      fontSize: 12, fontWeight: 700,
                      color: currency === c ? cc.color : "#6b7280",
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

            {/* Fee breakdown */}
            <div style={{
              background: `${RANKED_COLOR}0d`,
              border: `1px solid ${RANKED_COLOR}40`,
              borderRadius: 8, padding: "18px 22px", marginBottom: 24,
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              {[
                { label: "Match fee",         value: `${MATCH_FEE} ${CURRENCY_CONFIG[currency].symbol}`, color: RANKED_COLOR },
                { label: "Ranked points",      value: "Earned on win",       color: "#4ade80" },
                { label: "Leaderboard",        value: "Updated live",        color: "#b9e7f4" },
                { label: "Tournament qualify", value: "Top 16 weekly",       color: "#a855f7" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Status / error */}
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
                width: "100%", padding: "15px 0", marginBottom: 12,
                background: busy ? `${RANKED_COLOR}30` : `linear-gradient(135deg, ${RANKED_COLOR}28, ${RANKED_COLOR}10)`,
                border: `1.5px solid ${RANKED_COLOR}`,
                borderRadius: 6, cursor: busy ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                transition: "all 0.2s",
                boxShadow: busy ? "none" : `0 0 20px ${RANKED_COLOR}30`,
                clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
              }}
            >
              <span className="material-icons" style={{ fontSize: 20, color: RANKED_COLOR }}>
                {busy ? "hourglass_empty" : "military_tech"}
              </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: 3 }}>
                {busy ? "Processing…" : `Pay ${MATCH_FEE} ${CURRENCY_CONFIG[currency].symbol} & Enter`}
              </span>
            </button>

            {/* Cancel */}
            <button
              onClick={onSkip}
              disabled={busy}
              style={{
                width: "100%", padding: "10px 0",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 5, cursor: busy ? "not-allowed" : "pointer",
                fontSize: 11, fontWeight: 700, color: "#475569",
                letterSpacing: 2, textTransform: "uppercase",
                fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      </div>
    );
  }

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
            return (
              <button
                key={c}
                onClick={() => { if (!busy) { setCurrency(c); setErrMsg(""); setStep("idle"); } }}
                disabled={busy}
                style={{
                  flex: 1, padding: "8px 0",
                  background: currency === c ? `${cc.color}26` : "rgba(255,255,255,0.03)",
                  border: `1.5px solid ${currency === c ? cc.color : "#334155"}`,
                  borderRadius: 6, cursor: busy ? "not-allowed" : "pointer",
                  fontSize: 12, fontWeight: 700,
                  color: currency === c ? cc.color : "#6b7280",
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
            {lockedAmount ? "Host's Stake (must match)" : "Your Stake Amount"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 0, border: `1.5px solid ${lockedAmount ? "#334155" : cfg.color}`, borderRadius: 6, overflow: "hidden" }}>
            <input
              type="number"
              min="0"
              step="0.001"
              value={amountInput}
              onChange={(e) => { if (!busy && !lockedAmount) setAmountInput(e.target.value); }}
              disabled={busy || !!lockedAmount}
              style={{
                flex: 1, padding: "10px 14px",
                background: "rgba(0,0,0,0.4)",
                border: "none", outline: "none",
                fontSize: 18, fontWeight: 700, color: lockedAmount ? "#6b7280" : "#f1f5f9",
                fontFamily: "inherit",
              }}
            />
            <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.04)", fontSize: 13, fontWeight: 700, color: cfg.color, letterSpacing: 1 }}>
              {cfg.symbol}
            </div>
          </div>
          {lockedAmount && (
            <p style={{ fontSize: 11, color: "#6b7280", margin: "6px 0 0", letterSpacing: 0.3 }}>
              Amount set by the match host.
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
            width: "100%", padding: "14px 0", marginBottom: 12,
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
            width: "100%", padding: "10px 0", marginTop: 4,
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
