"use client";

import { useEffect, useMemo, useState } from "react";
import { isAddress, formatUnits, parseUnits } from "viem";
import { celo } from "wagmi/chains";
import {
  useAccount,
  useBalance,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { GDOLLAR_CONTRACT, GDOLLAR_COLOR } from "../lib/gooddollar";
import { friendlyTxError, isUserRejectedTx } from "../lib/txErrors";

/**
 * Send funds out of the in-app wallet.
 *
 * Players who signed in with Web3Auth hold a real wallet with real G$ and no
 * way to move it — there is no seed phrase to import elsewhere, so the balance
 * is effectively trapped. This is the way out.
 *
 * Built defensively on purpose: a transfer is irreversible, a mistyped address
 * is unrecoverable, and this is the one screen where a slip costs a player
 * their whole balance. Hence the explicit review step, the self-send and
 * gas checks, and no pre-filled amounts.
 */

const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type Asset = "gdollar" | "celo";
type Step = "form" | "review" | "sending" | "done";

const ACCENT = "#56a4cb";

export function TransferFundsModal({ onClose }: { onClose: () => void }) {
  const { address } = useAccount();
  const [asset, setAsset] = useState<Asset>("gdollar");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState("");

  const { data: celoBalance } = useBalance({ address, chainId: celo.id, query: { enabled: !!address } });
  const { data: gdBalance, refetch: refetchGd } = useReadContract({
    address: GDOLLAR_CONTRACT,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: celo.id,
    query: { enabled: !!address },
  });

  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash ?? undefined });

  useEffect(() => {
    if (isSuccess) { setStep("done"); void refetchGd(); }
  }, [isSuccess, refetchGd]);

  const decimals = 18;
  const raw = asset === "gdollar" ? (gdBalance as bigint | undefined) : celoBalance?.value;
  const balance = raw ?? 0n;
  const symbol = asset === "gdollar" ? "G$" : "CELO";
  const balanceLabel = Number(formatUnits(balance, decimals)).toLocaleString(undefined, {
    maximumFractionDigits: asset === "gdollar" ? 0 : 4,
  });

  // Sending the whole native balance always fails — there is nothing left to
  // pay the fee with. ERC-20 sends still need CELO for gas, checked separately.
  const hasGas = (celoBalance?.value ?? 0n) > 0n;

  const parsed = useMemo(() => {
    if (!amount.trim()) return null;
    try {
      const v = parseUnits(amount.trim() as `${number}`, decimals);
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  }, [amount]);

  const toTrimmed = to.trim();
  const validAddress = isAddress(toTrimmed);
  const isSelf = validAddress && !!address && toTrimmed.toLowerCase() === address.toLowerCase();
  const overBalance = parsed !== null && parsed > balance;

  const problem =
    !toTrimmed ? "Enter a destination address"
    : !validAddress ? "That doesn't look like a valid wallet address"
    : isSelf ? "That's your own address — funds would go nowhere"
    : !amount.trim() ? "Enter an amount"
    : parsed === null ? "Enter a valid amount above zero"
    : overBalance ? `You only have ${balanceLabel} ${symbol}`
    : !hasGas ? "You need a little CELO to cover the network fee. Claim your daily G$ — it tops up CELO."
    : null;

  const send = async () => {
    if (problem || parsed === null || !address) return;
    setError("");
    setStep("sending");
    try {
      const hash = asset === "gdollar"
        ? await writeContractAsync({
            address: GDOLLAR_CONTRACT,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [toTrimmed as `0x${string}`, parsed],
            account: address,
            chainId: celo.id,
          })
        : await sendTransactionAsync({ to: toTrimmed as `0x${string}`, value: parsed, account: address, chainId: celo.id });
      setTxHash(hash);
    } catch (e) {
      if (!isUserRejectedTx(e)) setError(friendlyTxError(e, "Transfer failed. Please try again."));
      else setError("");
      setStep("form");
    }
  };

  const shell = (children: React.ReactNode) => (
    <div style={{
      position: "fixed", inset: 0, zIndex: 340,
      background: "rgba(5,5,16,0.9)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        width: "min(440px, 94vw)",
        background: "linear-gradient(160deg, rgba(10,16,28,0.99), rgba(8,10,18,0.99))",
        border: `1.5px solid ${ACCENT}44`, borderRadius: 12, padding: "26px 24px",
        fontFamily: "var(--font-space-grotesk), sans-serif",
      }}>{children}</div>
    </div>
  );

  if (step === "done") {
    return shell(
      <>
        <div style={{ fontSize: 34, textAlign: "center", marginBottom: 8 }}>✅</div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#fff", textAlign: "center" }}>Sent</h2>
        <p style={{ margin: "10px 0 18px", fontSize: 13, color: "#94a3b8", textAlign: "center", lineHeight: 1.6 }}>
          {amount} {symbol} is on its way to<br />
          <span style={{ fontFamily: "monospace", fontSize: 12, color: "#b9e7f4" }}>
            {toTrimmed.slice(0, 10)}…{toTrimmed.slice(-8)}
          </span>
        </p>
        {txHash && (
          <a href={`https://celoscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
            style={{ display: "block", textAlign: "center", fontSize: 12, color: ACCENT, marginBottom: 16 }}>
            View on Celoscan →
          </a>
        )}
        <button onClick={onClose} style={btn(ACCENT)}>Done</button>
      </>
    );
  }

  if (step === "review" || step === "sending") {
    return shell(
      <>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.5, color: "#fbbf24", textTransform: "uppercase", marginBottom: 10 }}>
          Check carefully
        </div>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 900, color: "#fff" }}>
          Send {amount} {symbol}
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
          Transfers can&apos;t be undone. If this address is wrong, the funds are gone for good.
        </p>
        <div style={{ background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 8, padding: "12px 14px", marginBottom: 18 }}>
          <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Sending to</div>
          {/* Full address, never truncated — truncation is what hides a typo. */}
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "#e2e8f0", wordBreak: "break-all", lineHeight: 1.5 }}>
            {toTrimmed}
          </div>
        </div>
        {error && <div role="alert" style={{ fontSize: 12, color: "#f87171", marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setStep("form")} disabled={step === "sending"} style={{ ...btn("transparent"), border: "1px solid rgba(148,163,184,0.3)", color: "#94a3b8", flex: 1 }}>
            Back
          </button>
          <button onClick={() => void send()} disabled={step === "sending"} style={{ ...btn(GDOLLAR_COLOR), flex: 1, opacity: step === "sending" ? 0.6 : 1 }}>
            {step === "sending" ? "Sending…" : "Confirm send"}
          </button>
        </div>
      </>
    );
  }

  return shell(
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.5, color: ACCENT, textTransform: "uppercase" }}>Withdraw</div>
          <h2 style={{ margin: "4px 0 0", fontSize: 21, fontWeight: 900, color: "#fff" }}>Send funds out</h2>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {(["gdollar", "celo"] as const).map((a) => (
          <button key={a} onClick={() => { setAsset(a); setAmount(""); }}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
              fontSize: 13, fontWeight: 800, letterSpacing: 1,
              border: `1.5px solid ${asset === a ? (a === "gdollar" ? GDOLLAR_COLOR : "#fbbf24") : "#334155"}`,
              background: asset === a ? `${a === "gdollar" ? GDOLLAR_COLOR : "#fbbf24"}1f` : "rgba(17,10,24,0.4)",
              color: asset === a ? "#fff" : "#6b7280",
            }}>
            {a === "gdollar" ? "G$" : "CELO"}
          </button>
        ))}
      </div>

      <label style={lbl}>Destination wallet address</label>
      <input
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="0x…"
        spellCheck={false}
        autoComplete="off"
        style={{ ...input, fontFamily: "monospace", fontSize: 13 }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 14 }}>
        <label style={lbl}>Amount</label>
        <button
          onClick={() => setAmount(formatUnits(balance, decimals))}
          style={{ background: "none", border: "none", color: ACCENT, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}
        >
          Balance: {balanceLabel} {symbol} · Max
        </button>
      </div>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder="0"
        inputMode="decimal"
        style={input}
      />

      {(problem || error) && (
        <div style={{ fontSize: 11.5, color: problem && !error ? "#94a3b8" : "#f87171", marginTop: 10, lineHeight: 1.5 }}>
          {error || problem}
        </div>
      )}

      <button
        onClick={() => setStep("review")}
        disabled={!!problem}
        style={{ ...btn(GDOLLAR_COLOR), width: "100%", marginTop: 16, opacity: problem ? 0.45 : 1, cursor: problem ? "not-allowed" : "pointer" }}
      >
        Review transfer
      </button>
    </>
  );
}

const lbl: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
  color: "#64748b", textTransform: "uppercase", marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%", padding: "11px 13px", borderRadius: 7, boxSizing: "border-box",
  background: "rgba(2,6,14,0.7)", border: "1px solid rgba(86,164,203,0.25)",
  color: "#e2e8f0", fontFamily: "inherit", fontSize: 15, outline: "none",
};
function btn(bg: string): React.CSSProperties {
  return {
    padding: "12px 0", borderRadius: 8, border: "none", cursor: "pointer",
    fontFamily: "inherit", fontSize: 13.5, fontWeight: 800, letterSpacing: 1,
    textTransform: "uppercase", color: bg === "transparent" ? "#94a3b8" : "#04120c",
    background: bg, width: "100%",
  };
}
