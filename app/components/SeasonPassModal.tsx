"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { getMiniPayAddress, getMiniPayConnector, getMiniPayWriteOverrides, isMiniPay, sendMiniPayNativeTransaction } from "../lib/minipay";
import { useAccount, useConnect, usePublicClient, useSendTransaction, useSwitchChain, useWriteContract } from "wagmi";
import { celo } from "wagmi/chains";
import { formatUnits, parseEther, parseUnits } from "viem";
import { TREASURY_ADDRESS, TREASURY_MINIPAY_ADDRESS, USDT_CONTRACT } from "../lib/cusd";
import { SEASON_PASS_CONTRACT, SEASON_PASS_ABI } from "../lib/seasonPassContract";
import { DESIGN_W, DESIGN_H } from "../lib/designConstants";
import { getInitialMiniPayMode, getPremiumPaymentOptions, MINIPAY_DEPOSIT_DEEPLINK, MINIPAY_STABLECOIN_EXPLAINER, type PremiumPaymentCurrency, useMiniPayMode } from "../lib/premiumPayments";
import { isUserRejectedTx, TX_CANCELLED_MESSAGE } from "../lib/txErrors";
import { getStablecoin, isMiniPayStableKey, useMiniPayStablecoin } from "../lib/stablecoins";
import { useRouter } from "next/navigation";
import { VerifyButton, useIsVerified } from "./VerifyButton";

const TREASURY = TREASURY_ADDRESS;
const TREASURY_MINIPAY = TREASURY_MINIPAY_ADDRESS;
const CONTRACT_ACTIVE = SEASON_PASS_CONTRACT !== "0x0000000000000000000000000000000000000000";
const MOBILE_MODAL_W = 900;
const MOBILE_MODAL_H = 620;
const USDT_ABI = [
  { name: "transfer", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }] },
] as const;

type Currency = PremiumPaymentCurrency;

const PLANS = [
  {
    id: "weekly" as const,
    label: "WEEKLY PASS",
    days: 7,
    priceCelo: "0.5",
    priceWeiCelo: parseEther("0.5"),
    priceGdollar: "100",
    priceWeiGdollar: parseUnits("100", 18),
    priceUsdt: "0.04",
    priceWeiUsdt: parseUnits("0.04", 6),
    tagline: "Try it out",
    color: "#56a4cb",
  },
  {
    id: "monthly" as const,
    label: "MONTHLY PASS",
    days: 30,
    priceCelo: "1.5",
    priceWeiCelo: parseEther("1.5"),
    priceGdollar: "200",
    priceWeiGdollar: parseUnits("200", 18),
    priceUsdt: "0.13",
    priceWeiUsdt: parseUnits("0.13", 6),
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
    priceUsdt: "0.30",
    priceWeiUsdt: parseUnits("0.30", 6),
    tagline: "Best value",
    color: "#4ade80",
  },
] as const;

type PlanId = (typeof PLANS)[number]["id"];
type Step = "checking" | "idle" | "waiting-tx" | "confirming" | "registering" | "done" | "error" | "low-balance";

type Props = {
  onClose: () => void;
  onActivated?: () => void;
};

async function fetchSeasonPass(address: string) {
  const res = await fetch(`/api/season-pass?address=${address.toLowerCase()}&t=${Date.now()}`, {
    cache: "no-store",
  });
  return res.json() as Promise<{ active: boolean; expiry: number | null; plan: string | null }>;
}

export function SeasonPassModal({ onClose, onActivated }: Props) {
  const { address, isConnected, chainId } = useAccount();
  const isMp = useMiniPayMode();
  const router = useRouter();
  const isVerifiedForClaim = useIsVerified();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [isMobileModal, setIsMobileModal] = useState(false);
  const activeAddressRef = useRef<`0x${string}` | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("monthly");
  const [currency, setCurrency] = useState<Currency>(() => getInitialMiniPayMode() ? "usdt" : "gdollar");
  const [step, setStep] = useState<Step>("checking");
  const [errMsg, setErrMsg] = useState("");
  // true = wallet holds the purchase amount but can't cover CELO network fees
  const [lowBalanceGas, setLowBalanceGas] = useState(false);
  const publicClient = usePublicClient({ chainId: celo.id });
  const [expiry, setExpiry] = useState<number | null>(null);
  const [existingPlan, setExistingPlan] = useState<string | null>(null);

  // Live G$ prices read from the registry; PLANS values are only a fallback
  // for display before the read resolves (H-04).
  const [gdollarPrices, setGdollarPrices] = useState<Partial<Record<PlanId, bigint>>>({});
  useEffect(() => {
    // Never read the GoodDollar registry inside the MiniPay Mini App. G$ is not
    // a payment option there, so these three reads bought nothing and were a
    // live G$ contract call on every open — the functionality MiniPay asked to
    // have removed, happening invisibly.
    if (!publicClient || isMp) return;
    let cancelled = false;
    void (async () => {
      try {
        const { readGdollarPrices } = await import("../lib/seasonPassGdollar");
        const prices = await readGdollarPrices(publicClient);
        if (!cancelled) setGdollarPrices(prices);
      } catch { /* show configured prices until the read succeeds */ }
    })();
    return () => { cancelled = true; };
  }, [publicClient, isMp]);
  const gdollarPriceWeiFor = useCallback(
    (planId: PlanId): bigint => gdollarPrices[planId] ?? PLANS.find((p) => p.id === planId)!.priceWeiGdollar,
    [gdollarPrices]
  );
  const gdollarPriceLabelFor = useCallback(
    (planId: PlanId): string => {
      const onChain = gdollarPrices[planId];
      return onChain !== undefined ? formatUnits(onChain, 18) : PLANS.find((p) => p.id === planId)!.priceGdollar;
    },
    [gdollarPrices]
  );

  useEffect(() => {
    activeAddressRef.current = address ?? null;
  }, [address]);

  // MiniPay: keep selection within supported stablecoins; default to the
  // user's preferred one (highest balance) until they pick manually.
  const stable = useMiniPayStablecoin(address, isMp && isConnected);
  const manualCurrencyRef = useRef(false);
  useLayoutEffect(() => {
    if (isMp && !isMiniPayStableKey(currency)) setCurrency("usdt");
  }, [currency, isMp]);
  useEffect(() => {
    if (!isMp || manualCurrencyRef.current || !stable.loaded) return;
    setCurrency(stable.preferred.key);
  }, [isMp, stable.loaded, stable.preferred.key]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1024px), (pointer: coarse)");
    const update = () => setIsMobileModal(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useLayoutEffect(() => {
    const useMobileFrame = isMp || isMobileModal;
    if (!useMobileFrame) return;
    const scale = () => {
      if (!wrapRef.current) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isPortrait = vh > vw;
      const frameW = MOBILE_MODAL_W;
      const frameH = MOBILE_MODAL_H;
      let transform: string;
      if (isPortrait) {
        const s = Math.min(vw / frameH, vh / frameW);
        const tx = vw / 2 + (frameH * s) / 2;
        const ty = vh / 2 - (frameW * s) / 2;
        transform = `translate(${tx}px, ${ty}px) rotate(90deg) scale(${s})`;
      } else {
        const s = Math.min(vw / frameW, vh / frameH);
        const tx = (vw - frameW * s) / 2;
        const ty = (vh - frameH * s) / 2;
        transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      }
      wrapRef.current.style.transform = transform;
    };
    scale();
    const viewport = window.visualViewport;
    window.addEventListener("resize", scale);
    window.addEventListener("orientationchange", scale);
    viewport?.addEventListener("resize", scale);
    viewport?.addEventListener("scroll", scale);
    return () => {
      window.removeEventListener("resize", scale);
      window.removeEventListener("orientationchange", scale);
      viewport?.removeEventListener("resize", scale);
      viewport?.removeEventListener("scroll", scale);
    };
  }, [isMobileModal, isMp]);

  // Check for an existing active pass when the modal opens
  useEffect(() => {
    if (!address) {
      setExpiry(null);
      setExistingPlan(null);
      setStep("idle");
      return;
    }
    fetchSeasonPass(address)
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

  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const { connectAsync } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const availableCurrencies = getPremiumPaymentOptions(isMp, stable.preferred.key);

  const plan = PLANS.find((p) => p.id === selectedPlan)!;
  const useMobileFrame = isMp || isMobileModal;
  const modalWidth = useMobileFrame ? 540 : 620;
  const touchButtonHeight = isMp ? 48 : undefined;
  const touchButtonPadding = isMp ? "0 18px" : undefined;

  const ensureWalletReady = useCallback(async () => {
    if (isMiniPay()) {
      const miniPayAddress = await getMiniPayAddress();
      if (!miniPayAddress) {
        throw new Error("MiniPay wallet not available.");
      }
      return miniPayAddress as `0x${string}`;
    }

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
      throw new Error(isMp ? "MiniPay wallet is still loading. Try again in a moment." : "Connect your wallet first.");
    }

    if (activeChainId !== celo.id) {
      await switchChainAsync({ chainId: celo.id });
      activeChainId = celo.id;
    }

    if (activeChainId !== celo.id) {
      throw new Error("Switch to Celo and try again.");
    }

    return activeAddress;
  }, [address, chainId, connectAsync, isConnected, switchChainAsync]);

  const pollAndRegister = useCallback(async (hash: `0x${string}`, activeAddress: `0x${string}`) => {
    setStep("confirming");
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      if (attempts > 60) {
        clearInterval(poll);
        setErrMsg("Transaction confirmation timed out. Contact support.");
        setStep("error");
        return;
      }
      try {
        const res = await fetch(`/api/season-pass`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: activeAddress, txHash: hash, plan: selectedPlan, currency }),
        });
        if (res.ok) {
          const data = await res.json() as { success: boolean; expiry: number };
          clearInterval(poll);
          setExpiry(data.expiry);
          setStep("done");
          // Don't call onActivated here — show the animation first.
          // onActivated is called when user dismisses the done screen.
        } else if (res.status !== 404) {
          const errData = await res.json().catch(() => ({})) as { error?: string };
          clearInterval(poll);
          setErrMsg(errData.error || "Activation failed. Try again.");
          setStep("error");
        }
      } catch { /* keep polling on network error */ }
    }, 3000);
  }, [selectedPlan, currency]);

  const handlePurchase = useCallback(async () => {
    setStep("waiting-tx");
    setErrMsg("");
    try {
      const activeAddress = await ensureWalletReady();
      activeAddressRef.current = activeAddress;
      if (isMiniPayStableKey(currency)) {
        // Stablecoins (USDT/USDC/USDm): same USD price, token-specific decimals
        const coin = getStablecoin(currency);
        const hash = await writeContractAsync({
              address: coin.address,
              abi: USDT_ABI,
              functionName: "transfer",
              args: [TREASURY_MINIPAY, parseUnits(plan.priceUsdt, coin.decimals)],
              account: activeAddress,
              chainId: celo.id,
              ...getMiniPayWriteOverrides(),
            });
        void pollAndRegister(hash, activeAddress);
      } else if (currency === "gdollar") {
        // G$ lives in its own chunk so MiniPay never downloads it — see
        // lib/seasonPassGdollar.ts. Crediting stays here, single-copy.
        if (!publicClient) throw new Error("Network unavailable. Try again.");
        const { purchaseWithGdollar } = await import("../lib/seasonPassGdollar");
        const hash = await purchaseWithGdollar({
          client: publicClient,
          writeContractAsync: writeContractAsync as never,
          account: activeAddress,
          chainId: celo.id,
          planId: selectedPlan,
          fallbackPriceWei: plan.priceWeiGdollar,
          treasury: TREASURY,
          onPrice: (id, price) => setGdollarPrices((prev) => ({ ...prev, [id]: price })),
        });
        void pollAndRegister(hash, activeAddress);
      } else if (CONTRACT_ACTIVE) {
        // Route through SeasonPassRegistry contract — tx is FROM buyer's wallet
        const hash = await writeContractAsync({
          address: SEASON_PASS_CONTRACT,
          abi: SEASON_PASS_ABI,
          functionName: "buySeasonPass",
          args: [selectedPlan],
          value: plan.priceWeiCelo,
          account: activeAddress,
          chainId: celo.id,
        });
        void pollAndRegister(hash, activeAddress);
      } else {
        // Fallback: direct transfer to treasury
        const hash = isMiniPay()
          ? await sendMiniPayNativeTransaction({
              from: activeAddress,
              to: TREASURY,
              value: plan.priceWeiCelo,
              gas: 21000n,
              data: "0x",
            })
          : await sendTransactionAsync({
              to: TREASURY,
              value: plan.priceWeiCelo,
              data: "0x",
              account: activeAddress,
              chainId: celo.id,
            });
        void pollAndRegister(hash, activeAddress);
      }
    } catch (err) {
      if (isUserRejectedTx(err)) {
        setErrMsg(TX_CANCELLED_MESSAGE);
        setStep("error");
        return;
      }
      const msg = err instanceof Error ? err.message : "Transaction failed.";
      if (/insufficient funds|insufficient balance|exceeds balance/i.test(msg)) {
        // Distinguish "short on the token" from "short on CELO gas": if the
        // wallet holds the purchase amount, the failure was the network fee.
        // MiniPay pays gas in USDT, so a USDT shortfall means deposit either way.
        let gasShortfall = false;
        try {
          const addr = activeAddressRef.current;
          if (addr && publicClient && !isMiniPayStableKey(currency)) {
            if (currency === "gdollar") {
              const { readGdollarBalance } = await import("../lib/seasonPassGdollar");
              const bal = await readGdollarBalance(publicClient, addr);
              gasShortfall = bal >= gdollarPriceWeiFor(plan.id);
            } else {
              const bal = await publicClient.getBalance({ address: addr });
              gasShortfall = bal >= plan.priceWeiCelo;
            }
          }
        } catch { /* leave as token shortfall */ }
        setLowBalanceGas(gasShortfall);
        setStep("low-balance");
      } else {
        setErrMsg(msg.slice(0, 120));
        setStep("error");
      }
    }
  }, [currency, ensureWalletReady, gdollarPriceWeiFor, isMp, plan, pollAndRegister, publicClient, selectedPlan, sendTransactionAsync, writeContractAsync]);

  const expiryDate = expiry ? new Date(expiry).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
      overflow: "hidden",
    }}>
      <div ref={wrapRef} style={useMobileFrame ? {
        width: MOBILE_MODAL_W, height: MOBILE_MODAL_H, position: "absolute", top: 0, left: 0,
        transformOrigin: "top left",
        transform: "var(--ao-tr)",
        display: "flex", alignItems: "center", justifyContent: "center",
      } : {
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
      <div style={{
        width: modalWidth, maxWidth: useMobileFrame ? "none" : "calc(100vw - 28px)", borderRadius: 14,
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
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(185,231,244,0.4)", cursor: "pointer", fontSize: 20, padding: isMp ? 0 : "8px 10px", width: isMp ? 48 : undefined, height: isMp ? 48 : undefined, minWidth: isMp ? 48 : 40, minHeight: isMp ? 48 : 40, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
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
                width: isMp ? 196 : 172, height: isMp ? 188 : 184, borderRadius: 10, overflow: "hidden",
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
                  padding: isMp ? touchButtonPadding : "9px 32px", minHeight: touchButtonHeight, borderRadius: 7,
                  background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.35)",
                  cursor: "pointer", fontSize: 11, fontWeight: 800, letterSpacing: 1.5,
                  textTransform: "uppercase", color: "#fbbf24", fontFamily: "inherit",
                }}
              >
                ⚡ Extend / Stack Pass
              </button>
              <button
                onClick={() => { onActivated?.(); onClose(); }}
                style={{
                  padding: isMp ? touchButtonPadding : "12px 32px", minHeight: touchButtonHeight, borderRadius: 7,
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
        ) : step === "low-balance" ? (
          <div style={{ padding: "32px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>{lowBalanceGas ? "⛽" : "💸"}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#f87171", marginBottom: 8 }}>
              {lowBalanceGas ? "Need CELO for Network Fees" : "Balance Too Low"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(185,231,244,0.6)", marginBottom: 24, lineHeight: 1.5 }}>
              {lowBalanceGas
                ? `You have enough ${currency === "gdollar" ? "G$" : "CELO"} for this purchase, but your wallet needs a little extra CELO to cover the network fee. Claiming your daily G$ on your Profile also tops up CELO for network fees.`
                : isMiniPayStableKey(currency)
                ? `Your ${getStablecoin(currency).symbol} balance is too low to complete this purchase. Add cash to continue.`
                : currency === "gdollar"
                ? isVerifiedForClaim === false
                  ? "Your G$ balance is too low. Verify your identity once to unlock free G$ every day — a few claims cover this pass."
                  : "Your G$ balance is too low for this purchase. Claim your daily G$ on your Profile, or come back after tomorrow's claim."
                : "Your CELO balance is too low to complete this purchase."}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {isMiniPayStableKey(currency) ? (
                <button
                  onClick={() => {
                    if (isMp) {
                      window.location.href = MINIPAY_DEPOSIT_DEEPLINK;
                      return;
                    }
                    window.open(MINIPAY_DEPOSIT_DEEPLINK, "_blank", "noopener,noreferrer");
                  }}
                  style={{
                    padding: isMp ? touchButtonPadding : "12px 32px", minHeight: touchButtonHeight, borderRadius: 7,
                    background: "linear-gradient(135deg, #26a17b22, #26a17b44)",
                    border: "1.5px solid #26a17b",
                    cursor: "pointer", fontSize: 13, fontWeight: 800, letterSpacing: 2,
                    textTransform: "uppercase", color: "#fff", fontFamily: "inherit",
                    boxShadow: "0 0 20px rgba(38,161,123,0.3)",
                  }}
                >
                  💳 Add Cash
                </button>
              ) : currency === "gdollar" && isVerifiedForClaim === false && !isMp ? (
                <VerifyButton label="Verify & unlock free G$" style={{ minHeight: touchButtonHeight }} />
              ) : (
                <button
                  onClick={() => { router.push("/profile"); }}
                  style={{
                    padding: isMp ? touchButtonPadding : "12px 32px", minHeight: touchButtonHeight, borderRadius: 7,
                    background: "linear-gradient(135deg, #00C58E22, #00C58E44)",
                    border: "1.5px solid #00C58E",
                    cursor: "pointer", fontSize: 13, fontWeight: 800, letterSpacing: 2,
                    textTransform: "uppercase", color: "#fff", fontFamily: "inherit",
                    boxShadow: "0 0 20px rgba(0,197,142,0.3)",
                  }}
                >
                  🌱 Claim G$ on Profile
                </button>
              )}
              <button
                onClick={() => setStep("idle")}
                style={{
                  padding: isMp ? touchButtonPadding : "10px 32px", minHeight: touchButtonHeight, borderRadius: 7,
                  background: "rgba(86,164,203,0.08)", border: "1px solid rgba(86,164,203,0.25)",
                  cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
                  textTransform: "uppercase", color: "rgba(185,231,244,0.6)", fontFamily: "inherit",
                }}
              >
                Back
              </button>
            </div>
            <div style={{ marginTop: 20 }}>
              <a href="https://t.me/actionorder" target="_blank" rel="noopener noreferrer" style={{ color: "#56a4cb", fontSize: 11, textDecoration: "none" }}>
                Need help? Chat on Telegram →
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* Currency toggle */}
            <div style={{ padding: "16px 24px 0", display: "flex", gap: 8 }}>
              {availableCurrencies.map((c) => {
                const isActive = currency === c.key;
                return (
                <button
                  key={c.key}
                  onClick={() => { manualCurrencyRef.current = true; setCurrency(c.key); }}
                  style={{
                    flex: 1, padding: isMp ? "0 8px" : "8px", minHeight: isMp ? 42 : undefined, borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                    border: `1.5px solid ${isActive ? c.color : "rgba(86,164,203,0.15)"}`,
                    background: isActive ? `${c.color}1a` : "rgba(255,255,255,0.02)",
                    fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase",
                    color: isActive ? c.color : "rgba(185,231,244,0.4)",
                    transition: "all 0.15s",
                  }}
                >
                  {c.actionLabel}
                </button>
                );
              })}
            </div>
            {!isMp && (
              <div style={{ padding: "10px 24px 0", fontSize: 11, lineHeight: 1.45, color: "rgba(148,163,184,0.92)" }}>
                Web season passes support <span style={{ color: "#56a4cb", fontWeight: 700 }}>CELO</span> or <span style={{ color: "#00C58E", fontWeight: 700 }}>G$</span>.
              </div>
            )}
            {isMp && (
              <div style={{ padding: "10px 24px 0", fontSize: 11, lineHeight: 1.45, color: "rgba(148,163,184,0.92)" }}>
                {MINIPAY_STABLECOIN_EXPLAINER}
              </div>
            )}

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
                      flex: 1, padding: isMp ? "14px 8px" : "14px 10px", minHeight: isMp ? 86 : undefined, borderRadius: 8, cursor: "pointer",
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
                      {currency === "gdollar" ? `${gdollarPriceLabelFor(p.id)} G$` : isMiniPayStableKey(currency) ? `$${p.priceUsdt} ${getStablecoin(currency).symbol}` : `${p.priceCelo} CELO`}
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
                <div style={{ marginTop: 6 }}>
                  <a href="https://t.me/actionorder" target="_blank" rel="noopener noreferrer" style={{ color: "#56a4cb", fontSize: 11, textDecoration: "none" }}>
                    Need help? Chat on Telegram →
                  </a>
                </div>
              </div>
            )}

            {/* CTA */}
            <div style={{ padding: "0 24px 24px" }}>
              <button
                disabled={!address || step === "waiting-tx" || step === "confirming" || step === "registering"}
                onClick={handlePurchase}
                style={{
                  width: "100%", padding: isMp ? touchButtonPadding : "14px", minHeight: touchButtonHeight, borderRadius: 8, cursor: "pointer",
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
                  ? `Pay ${currency === "gdollar" ? `${gdollarPriceLabelFor(plan.id)} G$` : isMiniPayStableKey(currency) ? `$${plan.priceUsdt} ${getStablecoin(currency).symbol}` : `${plan.priceCelo} CELO`} → Activate ${plan.days}d Pass`
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
    </div>
  );
}
