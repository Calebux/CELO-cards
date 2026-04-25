"use client";

import { useState, useCallback, useEffect } from "react";
import { useAccount, useSendTransaction, useWriteContract } from "wagmi";
import { parseEther, parseUnits } from "viem";
import { GDOLLAR_CONTRACT, GDOLLAR_ABI } from "../lib/gooddollar";

const TREASURY = "0xBa37dd0890AFc659a25331871319f66E7EBA3522" as `0x${string}`;

type Currency = "celo" | "gdollar";

const PLANS = [
  {
    id: "weekly" as const,
    label: "WEEKLY PASS",
    days: 7,
    priceCelo: "0.5",
    priceWeiCelo: parseEther("0.5"),
    priceGdollar: "1000",
    priceWeiGdollar: parseUnits("1000", 18),
    tagline: "Try it out",
    color: "#56a4cb",
  },
  {
    id: "monthly" as const,
    label: "MONTHLY PASS",
    days: 30,
    priceCelo: "1.5",
    priceWeiCelo: parseEther("1.5"),
    priceGdollar: "3000",
    priceWeiGdollar: parseUnits("3000", 18),
    tagline: "Most popular",
    color: "#fbbf24",
    highlight: true,
  },
  {
    id: "season" as const,
    label: "SEASON PASS",
    days: 90,
    priceCelo: "3.5",
    priceWeiCelo: parseEther("3.5"),
    priceGdollar: "7000",
    priceWeiGdollar: parseUnits("7000", 18),
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
  const [currency, setCurrency] = useState<Currency>("celo");
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

  const { sendTransaction } = useSendTransaction();
  const { writeContract } = useWriteContract();

  const plan = PLANS.find((p) => p.id === selectedPlan)!;

  const pollAndRegister = useCallback(async (hash: `0x${string}`) => {
    setStep("confirming");
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
          body: JSON.stringify({ address, txHash: hash, plan: selectedPlan, currency }),
        });
        if (res.ok) {
          const data = await res.json() as { success: boolean; expiry: number };
          clearInterval(poll);
          setExpiry(data.expiry);
          setStep("done");
          onActivated?.();
        } else if (res.status !== 404) {
          const errData = await res.json().catch(() => ({})) as { error?: string };
          clearInterval(poll);
          setErrMsg(errData.error || "Activation failed. Try again.");
          setStep("error");
        }
      } catch { /* keep polling on network error */ }
    }, 3000);
  }, [address, selectedPlan, currency, onActivated]);

  const handlePurchase = useCallback(async () => {
    if (!address) return;
    setStep("waiting-tx");
    setErrMsg("");
    try {
      if (currency === "gdollar") {
        writeContract(
          {
            address: GDOLLAR_CONTRACT,
            abi: GDOLLAR_ABI,
            functionName: "transfer",
            args: [TREASURY, plan.priceWeiGdollar],
          },
          {
            onSuccess: (hash) => { void pollAndRegister(hash); },
            onError: (err) => { setErrMsg(err.message ?? "Transaction rejected."); setStep("error"); },
          }
        );
      } else {
        sendTransaction(
          { to: TREASURY, value: plan.priceWeiCelo, gas: 21000n },
          {
            onSuccess: (hash) => { void pollAndRegister(hash); },
            onError: (err) => { setErrMsg(err.message ?? "Transaction rejected."); setStep("error"); },
          }
        );
      }
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Unknown error");
      setStep("error");
    }
  }, [address, currency, plan, sendTransaction, writeContract, pollAndRegister]);

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
          /* Card flip celebration */
          <div style={{ padding: "32px 32px 28px", textAlign: "center" }}>
            <style>{`
              @keyframes sp-card-in { from { opacity:0; transform:translateY(32px) scale(0.85); } to { opacity:1; transform:translateY(0) scale(1); } }
              @keyframes sp-flip { 0%{transform:perspective(600px) rotateY(0deg)} 50%{transform:perspective(600px) rotateY(90deg)} 100%{transform:perspective(600px) rotateY(0deg)} }
              @keyframes sp-glow { 0%,100%{box-shadow:0 0 18px rgba(74,222,128,0.4)} 50%{box-shadow:0 0 36px rgba(74,222,128,0.8), 0 0 60px rgba(74,222,128,0.3)} }
              @keyframes sp-sparkle { 0%,100%{opacity:0;transform:scale(0)} 50%{opacity:1;transform:scale(1)} }
              @keyframes sp-fade-up { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
            `}</style>

            {/* Card */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20, position: "relative" }}>
              {/* Sparkle dots */}
              {[
                { top: -10, left: "20%", delay: "0s" }, { top: -14, left: "75%", delay: "0.2s" },
                { top: "30%", left: -14, delay: "0.4s" }, { top: "30%", right: -14, left: "auto", delay: "0.15s" },
                { bottom: -10, left: "35%", delay: "0.3s" }, { bottom: -10, left: "65%", delay: "0.5s" },
              ].map((s, i) => (
                <div key={i} style={{
                  position: "absolute", width: 6, height: 6, borderRadius: "50%",
                  background: i % 2 === 0 ? "#4ade80" : "#fbbf24",
                  animation: `sp-sparkle 1.2s ease-in-out ${s.delay} infinite`,
                  ...s,
                }} />
              ))}

              <div style={{
                width: 148, height: 200, borderRadius: 10, overflow: "hidden",
                border: "2px solid rgba(74,222,128,0.7)",
                animation: existingPlan ? "sp-card-in 0.5s ease forwards" : "sp-card-in 0.4s ease forwards, sp-flip 0.7s ease 0.1s, sp-glow 2s ease 0.8s infinite",
                position: "relative", flexShrink: 0,
              }}>
                <img
                  src="/cards/finisher.webp"
                  alt=""
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                />
                {/* Overlay with pass info */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to top, rgba(5,20,10,0.96) 0%, rgba(5,20,10,0.5) 55%, transparent 100%)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
                  padding: "12px 8px",
                  animation: existingPlan ? "none" : "sp-fade-up 0.5s ease 0.7s both",
                }}>
                  <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 2, color: "#4ade80", textTransform: "uppercase", marginBottom: 3 }}>⚡ Season Pass</div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: "#fff", letterSpacing: 1, textTransform: "uppercase" }}>
                    {existingPlan ?? plan.days + "d Pass"}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ fontSize: 18, fontWeight: 800, color: "#4ade80", marginBottom: 6, animation: "sp-fade-up 0.4s ease 0.6s both" }}>
              {existingPlan ? "Pass Active ⚡" : "Pass Activated! 🎉"}
            </div>
            {expiryDate && (
              <div style={{ fontSize: 12, color: "rgba(185,231,244,0.5)", marginBottom: 2, animation: "sp-fade-up 0.4s ease 0.75s both" }}>
                Valid until <strong style={{ color: "#b9e7f4" }}>{expiryDate}</strong>
              </div>
            )}
            <div style={{ fontSize: 11, color: "rgba(185,231,244,0.4)", marginBottom: 20, animation: "sp-fade-up 0.4s ease 0.85s both" }}>
              No entry fees on ranked matches
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "sp-fade-up 0.4s ease 1s both" }}>
              <button
                onClick={() => { setStep("idle"); setExistingPlan(null); }}
                style={{
                  padding: "9px 32px", borderRadius: 7,
                  background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.35)",
                  cursor: "pointer", fontSize: 11, fontWeight: 800, letterSpacing: 1.5,
                  textTransform: "uppercase", color: "#fbbf24", fontFamily: "inherit",
                }}
              >
                ⚡ Extend / Stack Pass
              </button>
              <button
                onClick={onClose}
                style={{
                  padding: "12px 32px", borderRadius: 7,
                  background: "linear-gradient(135deg, #22c55e, #16a34a)",
                  border: "none", cursor: "pointer",
                  fontSize: 14, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase",
                  color: "#fff", fontFamily: "inherit",
                  boxShadow: "0 0 20px rgba(74,222,128,0.3)",
                }}
              >
                {existingPlan ? "Close" : "LET'S FIGHT →"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Currency toggle */}
            <div style={{ padding: "16px 24px 0", display: "flex", gap: 8 }}>
              {(["celo", "gdollar"] as Currency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  style={{
                    flex: 1, padding: "8px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                    border: `1.5px solid ${currency === c ? (c === "gdollar" ? "#00C58E" : "#56a4cb") : "rgba(86,164,203,0.15)"}`,
                    background: currency === c ? (c === "gdollar" ? "rgba(0,197,142,0.1)" : "rgba(86,164,203,0.1)") : "rgba(255,255,255,0.02)",
                    fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase",
                    color: currency === c ? (c === "gdollar" ? "#00C58E" : "#56a4cb") : "rgba(185,231,244,0.4)",
                    transition: "all 0.15s",
                  }}
                >
                  {c === "celo" ? "Pay with CELO" : "Pay with G$"}
                </button>
              ))}
            </div>

            {/* Plan selector */}
            <div style={{ padding: "16px 24px 0" }}>
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
                      {currency === "gdollar" ? `${p.priceGdollar} G$` : `${p.priceCelo} CELO`}
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
                  ? `Pay ${currency === "gdollar" ? `${plan.priceGdollar} G$` : `${plan.priceCelo} CELO`} → Activate ${plan.days}d Pass`
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
