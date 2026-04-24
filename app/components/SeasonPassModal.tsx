"use client";

import { useState, useCallback, useEffect } from "react";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";

const TREASURY = "0xBa37dd0890AFc659a25331871319f66E7EBA3522" as `0x${string}`;

const PLANS = [
  {
    id: "weekly" as const,
    label: "WEEKLY PASS",
    days: 7,
    price: "0.5",
    priceWei: parseEther("0.5"),
    tagline: "Try it out",
    color: "#56a4cb",
  },
  {
    id: "monthly" as const,
    label: "MONTHLY PASS",
    days: 30,
    price: "1.5",
    priceWei: parseEther("1.5"),
    tagline: "Most popular",
    color: "#fbbf24",
    highlight: true,
  },
  {
    id: "season" as const,
    label: "SEASON PASS",
    days: 90,
    price: "3.5",
    priceWei: parseEther("3.5"),
    tagline: "Best value",
    color: "#4ade80",
  },
] as const;

type PlanId = (typeof PLANS)[number]["id"];
type Step = "checking" | "idle" | "waiting-tx" | "confirming" | "registering" | "done" | "error";

type Props = {
  onClose: () => void;
  onActivated?: () => void;
};

export function SeasonPassModal({ onClose, onActivated }: Props) {
  const { address } = useAccount();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("monthly");
  const [step, setStep] = useState<Step>("checking");
  const [errMsg, setErrMsg] = useState("");
  const [expiry, setExpiry] = useState<number | null>(null);
  const [existingPlan, setExistingPlan] = useState<string | null>(null);

  // Check for an existing active pass when the modal opens
  useEffect(() => {
    if (!address) { setStep("idle"); return; }
    fetch(`/api/season-pass?address=${address}`)
      .then(r => r.json() as Promise<{ active: boolean; expiry: number | null; plan: string | null }>)
      .then(data => {
        if (data.active && data.expiry) {
          setExpiry(data.expiry);
          setExistingPlan(data.plan);
          setStep("done");
        } else {
          setStep("idle");
        }
      })
      .catch(() => setStep("idle"));
  }, [address]);

  const { sendTransaction, data: txHash } = useSendTransaction();
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const plan = PLANS.find((p) => p.id === selectedPlan)!;

  const handlePurchase = useCallback(async () => {
    if (!address) return;
    setStep("waiting-tx");
    setErrMsg("");
    try {
      sendTransaction(
        { to: TREASURY, value: plan.priceWei },
        {
          onSuccess: async (hash) => {
            setStep("confirming");
            // Poll for confirmation then register
            let attempts = 0;
            const poll = setInterval(async () => {
              attempts++;
              if (attempts > 30) {
                clearInterval(poll);
                setErrMsg("Transaction confirmation timed out. Contact support.");
                setStep("error");
                return;
              }
              try {
                const res = await fetch(`/api/season-pass`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ address, txHash: hash, plan: selectedPlan }),
                });
                if (res.ok) {
                  const data = await res.json() as { success: boolean; expiry: number };
                  clearInterval(poll);
                  setExpiry(data.expiry);
                  setStep("done");
                  onActivated?.();
                }
              } catch {
                // keep polling
              }
            }, 3000);
          },
          onError: (err) => {
            setErrMsg(err.message ?? "Transaction rejected.");
            setStep("error");
          },
        }
      );
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Unknown error");
      setStep("error");
    }
  }, [address, plan, selectedPlan, sendTransaction, onActivated]);

  const expiryDate = expiry ? new Date(expiry).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
    }}>
      <div style={{
        width: 520, borderRadius: 14,
        backgroundColor: "#080e1a",
        border: "1.5px solid rgba(86,164,203,0.3)",
        boxShadow: "0 0 60px rgba(86,164,203,0.15), 0 24px 60px rgba(0,0,0,0.8)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px 16px",
          borderBottom: "1px solid rgba(86,164,203,0.12)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: "#fbbf24", textTransform: "uppercase", marginBottom: 4 }}>
              ⚡ SEASON PASS
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: 0.5 }}>
              Play Ranked. No Fees.
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(185,231,244,0.4)", cursor: "pointer", fontSize: 20, padding: 4 }}>✕</button>
        </div>

        {step === "checking" ? (
          /* Loading state while checking existing pass */
          <div style={{ padding: "48px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "rgba(185,231,244,0.4)", letterSpacing: 1 }}>Checking pass status…</div>
          </div>
        ) : step === "done" ? (
          /* Active pass state — existing or freshly purchased */
          <div style={{ padding: "40px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{existingPlan ? "⚡" : "✅"}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#4ade80", marginBottom: 8 }}>
              {existingPlan ? "Pass Active" : "Pass Activated!"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(185,231,244,0.6)", marginBottom: 4 }}>
              {existingPlan
                ? <><strong style={{ color: "#fbbf24" }}>{existingPlan}</strong> pass is active</>
                : <>Your <strong style={{ color: "#fff" }}>{plan.label}</strong> is active</>
              }
            </div>
            {expiryDate && (
              <div style={{ fontSize: 12, color: "rgba(185,231,244,0.4)", marginBottom: 4 }}>
                Expires {expiryDate}
              </div>
            )}
            {/* Allow renewing / stacking even if already active */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
              <button
                onClick={() => { setStep("idle"); setExistingPlan(null); }}
                style={{
                  padding: "10px 32px", borderRadius: 7,
                  background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.4)",
                  cursor: "pointer", fontSize: 12, fontWeight: 800, letterSpacing: 1.5,
                  textTransform: "uppercase", color: "#fbbf24", fontFamily: "inherit",
                }}
              >
                ⚡ Extend / Renew Pass
              </button>
              <button
                onClick={onClose}
                style={{
                  padding: "10px 32px", borderRadius: 7,
                  backgroundColor: "#4ade80", border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase",
                  color: "#050510", fontFamily: "inherit",
                }}
              >
                {existingPlan ? "Close" : "LET'S FIGHT"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Plan selector */}
            <div style={{ padding: "20px 24px 0" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "rgba(185,231,244,0.4)", textTransform: "uppercase", marginBottom: 12 }}>
                Choose Your Pass
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {PLANS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlan(p.id)}
                    style={{
                      flex: 1, padding: "14px 10px", borderRadius: 8, cursor: "pointer",
                      border: `1.5px solid ${selectedPlan === p.id ? p.color : "rgba(86,164,203,0.15)"}`,
                      backgroundColor: selectedPlan === p.id ? `${p.color}12` : "rgba(255,255,255,0.02)",
                      boxShadow: selectedPlan === p.id ? `0 0 16px ${p.color}30` : "none",
                      transition: "all 0.2s",
                      fontFamily: "inherit",
                      position: "relative",
                    }}
                  >
                    {"highlight" in p && p.highlight && (
                      <div style={{
                        position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                        backgroundColor: p.color, borderRadius: 20, padding: "2px 10px",
                        fontSize: 9, fontWeight: 800, letterSpacing: 1, color: "#050510",
                        textTransform: "uppercase", whiteSpace: "nowrap",
                      }}>
                        POPULAR
                      </div>
                    )}
                    <div style={{ fontSize: 20, fontWeight: 800, color: p.color, marginBottom: 2 }}>
                      {p.price} CELO
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: selectedPlan === p.id ? p.color : "rgba(185,231,244,0.4)", textTransform: "uppercase" }}>
                      {p.days} DAYS
                    </div>
                    <div style={{ fontSize: 9, color: "rgba(185,231,244,0.35)", marginTop: 4 }}>
                      {p.tagline}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Perks */}
            <div style={{ padding: "16px 24px 20px" }}>
              <div style={{ padding: "12px 16px", borderRadius: 8, backgroundColor: "rgba(86,164,203,0.05)", border: "1px solid rgba(86,164,203,0.1)" }}>
                {[
                  "Unlimited ranked matches — no per-match fee",
                  "Zero RPC friction — one tx, play all season",
                  "Leaderboard eligible for all ranked rewards",
                ].map((perk) => (
                  <div key={perk} style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid rgba(86,164,203,0.07)" }}>
                    <span style={{ color: "#4ade80", fontSize: 14 }}>✓</span>
                    <span style={{ fontSize: 12, color: "rgba(185,231,244,0.7)" }}>{perk}</span>
                  </div>
                )).slice(0, 2)}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#4ade80", fontSize: 14 }}>✓</span>
                  <span style={{ fontSize: 12, color: "rgba(185,231,244,0.7)" }}>Leaderboard eligible for all ranked rewards</span>
                </div>
              </div>
            </div>

            {/* Error */}
            {step === "error" && (
              <div style={{ margin: "0 24px 12px", padding: "10px 14px", borderRadius: 6, backgroundColor: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", fontSize: 12, color: "#f87171" }}>
                {errMsg || "Something went wrong. Try again."}
              </div>
            )}

            {/* CTA */}
            <div style={{ padding: "0 24px 24px" }}>
              <button
                disabled={!address || step === "waiting-tx" || step === "confirming" || step === "registering"}
                onClick={handlePurchase}
                style={{
                  width: "100%", padding: "14px", borderRadius: 8, cursor: "pointer",
                  background: `linear-gradient(135deg, ${plan.color}22, ${plan.color}44)`,
                  border: `1.5px solid ${plan.color}`,
                  boxShadow: `0 0 20px ${plan.color}30`,
                  fontSize: 13, fontWeight: 800, letterSpacing: 2.5, textTransform: "uppercase",
                  color: "#fff", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  opacity: !address || step === "waiting-tx" || step === "confirming" ? 0.7 : 1,
                  transition: "all 0.2s",
                }}
              >
                {step === "waiting-tx" && <span style={{ animation: "ko-dot-pulse 1s ease-in-out infinite" }}>●</span>}
                {step === "confirming" && <span style={{ animation: "ko-dot-pulse 1s ease-in-out infinite" }}>●</span>}
                {step === "idle" || step === "error"
                  ? `Pay ${plan.price} CELO → Activate ${plan.days}d Pass`
                  : step === "waiting-tx"
                  ? "Confirm in wallet…"
                  : "Confirming on-chain…"}
              </button>
              {!address && (
                <div style={{ textAlign: "center", fontSize: 11, color: "rgba(185,231,244,0.4)", marginTop: 8 }}>
                  Connect wallet to purchase
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
