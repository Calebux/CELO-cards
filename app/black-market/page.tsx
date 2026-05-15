"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "../lib/gameStore";
import { CardPreviewModal } from "../components/CardPreviewModal";
import { CARDS } from "../lib/gameData";
import {
  useWriteContract,
  useSendTransaction,
  useAccount,
  useConnect,
  useSwitchChain,
} from "wagmi";
import { celo } from "wagmi/chains";
import { GDOLLAR_CONTRACT, GDOLLAR_ABI, GDOLLAR_COLOR } from "../lib/gooddollar";
import { parseUnits } from "viem";
import { getMiniPayConnector, getMiniPayWalletClient, getMiniPayWriteOverrides, isMiniPay, sendMiniPayNativeTransaction } from "../lib/minipay";
import { getCardForgeProgress, getCardMasterySnapshot } from "../lib/cardMastery";
import { useAttunementSync } from "../lib/useSignatureCardSync";
import { TREASURY_ADDRESS, TREASURY_MINIPAY_ADDRESS, USDT_CONTRACT } from "../lib/cusd";
import { DESIGN_W, DESIGN_H } from "../lib/designConstants";
import { MiniPayImage } from "../components/MiniPayImage";
import { getInitialMiniPayMode, getPremiumPaymentOptions, type PremiumPaymentCurrency, useMiniPayMode } from "../lib/premiumPayments";

const WalletSection = dynamic(() => import("../components/WalletSection").then(m => ({ default: m.WalletSection })), { ssr: false, loading: () => <div style={{ width: 220, height: 40 }} /> });

// Treasury wallet that receives Black Market payments
const TREASURY = TREASURY_ADDRESS;
const TREASURY_MINIPAY = TREASURY_MINIPAY_ADDRESS;
const USDT_ABI = [
  { name: "transfer", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }] },
] as const;

// Price: pts / 1000 = CELO (e.g. 10000pts→10 CELO)
// USDT price: ~0.08 USDT per CELO
// G$ price: USD equivalent (1 G$ ≈ $0.001, so USDT price × 1000 = G$ price)
function ptsToOnchain(pts: number) {
  return parseUnits((pts / 1000).toFixed(6), 18);
}
function ptsToUsdt(pts: number) {
  return parseUnits((pts / 1000 * 0.08).toFixed(6), 6);
}
function ptsToGdollar(pts: number) {
  // G$ equivalent of the USD price: (pts/1000 * 0.08) * 1000 = pts * 0.08
  return parseUnits((pts * 0.08).toFixed(6), 18);
}
function ptsDisplay(pts: number, currency: "celo" | "gdollar" | "usdt") {
  const celo = pts / 1000;
  const usd = celo * 0.08;
  const gdollar = pts * 0.08;
  if (currency === "usdt") return `$${usd.toFixed(2)} USDT`;
  if (currency === "gdollar") return `${gdollar % 1 === 0 ? gdollar.toString() : gdollar.toFixed(1)} G$`;
  const formatted = celo % 1 === 0 ? celo.toString() : celo.toFixed(1);
  return `${formatted} CELO`;
}

type BuyCurrency = PremiumPaymentCurrency;
type MarketView = "premium" | "forge";

export default function BlackMarket() {
  const isMp = useMiniPayMode();
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { address, isConnected, chainId } = useAccount();

  const { unlockedPremiumCards, playerName, attunedCardIds, cardPerformance } = useGameStore();
  const unlockCard = useGameStore((s) => s.purchaseCard);
  const { toggleAttunedCard: syncAttunedCard } = useAttunementSync();

  const [buyCurrency, setBuyCurrency] = useState<BuyCurrency>(() => getInitialMiniPayMode() ? "usdt" : "celo");
  const [activeView, setActiveView] = useState<MarketView>("premium");
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string>("");
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const { connectAsync } = useConnect();
  const { switchChainAsync } = useSwitchChain();

  const marketCards = CARDS.filter((c) => c.isPremium);
  const paymentOptions = getPremiumPaymentOptions(isMp);
  const forgeCards = CARDS
    .filter((c) => !c.isPremium)
    .map((card) => {
      const stats = cardPerformance[card.id] ?? null;
      const mastery = getCardMasterySnapshot(stats);
      const forge = getCardForgeProgress(stats);
      return { card, stats, mastery, forge };
    })
    .sort((a, b) => {
      if (a.forge.ready !== b.forge.ready) return a.forge.ready ? -1 : 1;
      if (a.mastery.tier !== b.mastery.tier) return b.mastery.tier - a.mastery.tier;
      return b.mastery.xp - a.mastery.xp;
    });
  const previewCard = previewCardId ? CARDS.find((card) => card.id === previewCardId) ?? null : null;

  useLayoutEffect(() => {
    if (isMp && buyCurrency !== "usdt") setBuyCurrency("usdt");
  }, [buyCurrency, isMp]);

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

    return activeAddress;
  };

  const handleBuy = async (id: string, price: number) => {
    setBuyingId(id);
    setBuyError("");
    const amt = ptsToOnchain(price);
    try {
      const activeAddress = await ensureWalletReady();
      let txHash: string;
      if (buyCurrency === "usdt") {
        txHash = isMp
          ? await getMiniPayWalletClient().writeContract({
              address: USDT_CONTRACT,
              abi: USDT_ABI,
              functionName: "transfer",
              args: [TREASURY_MINIPAY, ptsToUsdt(price)],
              account: activeAddress,
              ...getMiniPayWriteOverrides(),
            })
          : await writeContractAsync({
              address: USDT_CONTRACT,
              abi: USDT_ABI,
              functionName: "transfer",
              args: [TREASURY_MINIPAY, ptsToUsdt(price)],
              account: activeAddress,
              chainId: celo.id,
            });
      } else if (buyCurrency === "gdollar") {
        txHash = await writeContractAsync({
          address: GDOLLAR_CONTRACT,
          abi: GDOLLAR_ABI,
          functionName: "transfer",
          args: [TREASURY, ptsToGdollar(price)],
          account: activeAddress,
          chainId: celo.id,
        });
      } else {
        // CELO — native transfer
        txHash = isMiniPay()
          ? await sendMiniPayNativeTransaction({
              from: activeAddress,
              to: TREASURY,
              value: amt,
              gas: 21000n,
              data: "0x",
            })
          : await sendTransactionAsync({ to: TREASURY, value: amt, account: activeAddress, chainId: celo.id });
      }
      await fetch("/api/black-market/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: activeAddress,
          playerName,
          cardId: id,
          currency: buyCurrency,
          pricePoints: price,
          txHash,
        }),
      }).catch(() => {});
      // Unlock locally (store + localStorage). Pass 0 so points are untouched.
      unlockCard(id, 0);
    } catch (e) {
      setBuyError(e instanceof Error ? e.message.slice(0, 100) : "Transaction failed.");
    } finally {
      setBuyingId(null);
    }
  };

  const ACCENT = "#ef4444";

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "fixed", backgroundColor: "#020202", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
      <div ref={wrapRef} style={{ width: DESIGN_W, height: DESIGN_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left", transform: "var(--ao-tr)" }}>

        {/* Background */}
        <MiniPayImage
          src="/new-assets/gameplay-landing-lite.webp"
          alt=""
          priority
          minipayWidth={1280}
          minipayQuality={54}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.15, pointerEvents: "none", filter: "hue-rotate(-20deg) saturate(1.5)" }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(86,0,0,0.1) 0%, rgba(0,0,0,0.95) 100%)", pointerEvents: "none" }} />

        {/* Top bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", borderBottom: "1px solid rgba(255,0,0,0.15)", backdropFilter: "blur(12px)", background: "rgba(5,0,0,0.8)", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <button onClick={() => router.back()} className="ko-btn ko-btn-secondary" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px" }}>
              <span className="material-icons ko-btn-icon" style={{ fontSize: 16, color: "rgba(255,255,255,0.9)" }}>arrow_back_ios</span>
              <span className="ko-btn-text" style={{ fontSize: 13, letterSpacing: 1.5, fontWeight: 700, color: "rgba(255,255,255,0.9)", textTransform: "uppercase" }}>Back</span>
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 4, height: 32, background: "linear-gradient(to bottom, #ef4444, #f87171)", borderRadius: 2 }} />
              <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", color: "#f87171", textTransform: "uppercase", opacity: 0.8 }}>ACTION ORDER</span>
            </div>
          </div>

          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, padding: "5px 16px", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, background: "rgba(239,68,68,0.1)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "#fca5a5", textTransform: "uppercase" }}>BLACK MARKET</span>
          </div>

          <WalletSection />
        </div>

        {/* Content */}
        <div style={{ position: "absolute", top: 68, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: 32, gap: 28 }}>

          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 52, fontWeight: 900, color: ACCENT, textTransform: "uppercase", letterSpacing: -2, margin: 0, lineHeight: 1, textShadow: "0 0 40px rgba(239,68,68,0.4)" }}>
              BLACK MARKET
            </h1>
            <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 10, maxWidth: 560, marginInline: "auto" }}>
              Acquire rare, devastating cards. Once unlocked they appear randomly in your deck.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(239,68,68,0.14)",
              background: "rgba(8,10,16,0.78)",
            }}
          >
            {([
              { key: "premium" as MarketView, label: "Premium", color: "#f87171" },
              { key: "forge" as MarketView, label: "Forge", color: "#56a4cb" },
            ]).map((view) => (
              <button
                key={view.key}
                onClick={() => setActiveView(view.key)}
                style={{
                  minWidth: 132,
                  padding: "8px 18px",
                  background: activeView === view.key ? `${view.color}22` : "rgba(255,255,255,0.03)",
                  border: `1.5px solid ${activeView === view.key ? view.color : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 800,
                  color: activeView === view.key ? view.color : "#94a3b8",
                  letterSpacing: 1.6,
                  textTransform: "uppercase",
                  fontFamily: "inherit",
                  boxShadow: activeView === view.key ? `0 0 14px ${view.color}20` : "none",
                }}
              >
                {view.label} Cards
              </button>
            ))}
          </div>

          {/* Error banner */}
          {buyError && (
            <div style={{ padding: "8px 20px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 6 }}>
              <span style={{ fontSize: 12, color: "#f87171" }}>{buyError}</span>
            </div>
          )}

          <div style={{ width: 1240, maxWidth: "calc(100% - 40px)", flex: 1, minHeight: 0, overflowY: "auto", padding: "0 8px 48px", display: "flex", flexDirection: "column", gap: 24 }}>
            {activeView === "premium" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#f87171", letterSpacing: 2.4, textTransform: "uppercase" }}>Premium Cards</div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#cbd5e1", maxWidth: 620 }}>
                      Rare black market cards you can buy, own permanently, and attune once unlocked.
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#6b7280", textTransform: "uppercase" }}>Pay with</span>
                    {paymentOptions.map(({ key, label, color }) => (
                      <button
                        key={key}
                        onClick={() => setBuyCurrency(key)}
                        style={{
                          padding: "6px 16px",
                          background: buyCurrency === key ? `${color}20` : "rgba(255,255,255,0.04)",
                          border: `1.5px solid ${buyCurrency === key ? color : "#334155"}`,
                          borderRadius: 6, cursor: "pointer",
                          fontSize: 12, fontWeight: 800, color: buyCurrency === key ? color : "#6b7280",
                          letterSpacing: 1.4, textTransform: "uppercase",
                          fontFamily: "inherit", transition: "all 0.15s",
                          boxShadow: buyCurrency === key ? `0 0 12px ${color}30` : "none",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 24, paddingBottom: 4 }}>
                {marketCards.map((c) => {
                  const isOwned = unlockedPremiumCards.includes(c.id);
                  const isAttuned = attunedCardIds.includes(c.id);
                  const masteryTier = getCardMasterySnapshot(cardPerformance[c.id] ?? null).tier;
                  const price = c.price ?? 3000;
                  const isBuying = buyingId === c.id;
                  const currColor = buyCurrency === "gdollar" ? GDOLLAR_COLOR : buyCurrency === "usdt" ? "#26a17b" : "#f9c846";

                  return (
                    <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                      <div style={{
                        width: 170, height: 236, borderRadius: 10, position: "relative", overflow: "hidden",
                        border: `2px solid ${c.color}`, boxShadow: isOwned ? `0 0 20px ${c.color}40` : "none",
                        opacity: isOwned ? 1 : 0.85,
                        transition: "transform 0.2s ease",
                        transform: isBuying ? "scale(1.05)" : "scale(1)",
                        cursor: "pointer",
                      }}>
                        <MiniPayImage
                          src={c.image}
                          alt={c.name}
                          minipayWidth={340}
                          minipayQuality={48}
                          loading="lazy"
                          decoding="async"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 40%, transparent 100%)" }} />

                        <button
                          onClick={() => setPreviewCardId(c.id)}
                          aria-label={`Preview ${c.name}`}
                          style={{ position: "absolute", inset: 0, zIndex: 1, background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                        />

                        <div style={{ position: "absolute", bottom: 12, left: 12, right: 12, textAlign: "center" }}>
                          <div style={{ fontSize: 9, fontWeight: 800, color: c.color, letterSpacing: 1.5, textTransform: "uppercase" }}>{c.type}</div>
                          <div style={{ fontSize: 13, fontWeight: 900, color: "white", textTransform: "uppercase" }}>{c.name}</div>
                        </div>

                        <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.8)", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${c.color}` }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: c.color }}>{c.knock}</span>
                        </div>
                        <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.8)", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #94a3b8" }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: "#9ca3af" }}>{c.priority}</span>
                        </div>
                        {isOwned && (
                          <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(74,222,128,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span className="material-icons" style={{ fontSize: 36, color: "#4ade80", opacity: 0.8 }}>check_circle</span>
                          </div>
                        )}
                      </div>

                      <div style={{ width: 170, textAlign: "center", fontSize: 10, color: "#9ca3af", lineHeight: 1.4, height: 44, overflow: "hidden" }}>
                        {c.effect}
                      </div>

                      {isOwned ? (
                        <button
                          disabled
                          style={{
                            width: "100%",
                            padding: "10px",
                            background: isAttuned || masteryTier > 0 ? "rgba(251,191,36,0.14)" : "rgba(74,222,128,0.1)",
                            border: isAttuned || masteryTier > 0 ? "1px solid rgba(251,191,36,0.36)" : "1px solid rgba(74,222,128,0.3)",
                            borderRadius: 6,
                            color: isAttuned || masteryTier > 0 ? "#fbbf24" : "#4ade80",
                            fontSize: 11,
                            fontWeight: 800,
                            cursor: "default",
                            letterSpacing: 2,
                          }}
                        >
                          {isAttuned ? "ATTUNED" : masteryTier > 0 ? `TIER ${masteryTier}` : "OWNED"}
                        </button>
                      ) : (
                        <button
                          onClick={() => void handleBuy(c.id, price)}
                          disabled={isBuying}
                          style={{
                            width: "100%", padding: "10px",
                            background: isBuying ? `${currColor}20` : `linear-gradient(135deg, ${currColor}28, ${currColor}10)`,
                            border: `1.5px solid ${isBuying ? currColor : c.color}`,
                            borderRadius: 6,
                            color: "white",
                            fontSize: 11, fontWeight: 800,
                            cursor: isBuying ? "not-allowed" : "pointer",
                            letterSpacing: 1,
                            transition: "all 0.2s ease",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                            opacity: 1,
                          }}
                        >
                          <span className="material-icons" style={{ fontSize: 13, color: isBuying ? currColor : c.color }}>
                            {isBuying ? "hourglass_empty" : buyCurrency === "gdollar" ? "stream" : buyCurrency === "usdt" ? "attach_money" : "toll"}
                          </span>
                          {isBuying ? "BUYING…" : ptsDisplay(price, buyCurrency)}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>
            ) : (
              <div style={{ borderRadius: 14, border: "1px solid rgba(86,164,203,0.16)", background: "linear-gradient(135deg, rgba(7,11,22,0.94), rgba(10,16,28,0.9))", boxShadow: "0 18px 60px rgba(0,0,0,0.24)", padding: "18px 18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#56a4cb", letterSpacing: 2.4, textTransform: "uppercase" }}>Normal Card Forge</div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#cbd5e1", maxWidth: 760, lineHeight: 1.45 }}>
                      Normal cards build mastery through use. When a card hits the full forge path, it will show <span style={{ color: "#fbbf24", fontWeight: 800 }}>FORGE READY</span> here before paid ascension goes live.
                    </div>
                  </div>
                  <div style={{ minWidth: 180, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(251,191,36,0.18)", background: "rgba(251,191,36,0.08)", fontSize: 11, color: "#f8fafc", lineHeight: 1.45 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.6, color: "#fbbf24", textTransform: "uppercase", marginBottom: 4 }}>Forge Rule</div>
                    Reach Tier 5, 25 uses, 12 clash wins, and 100 total knock.
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14, paddingBottom: 6 }}>
                  {forgeCards.map(({ card, mastery, forge, stats }) => (
                    <button
                      key={card.id}
                      onClick={() => setPreviewCardId(card.id)}
                      style={{
                        minWidth: 258,
                        width: 258,
                        padding: 12,
                        borderRadius: 12,
                        border: `1px solid ${forge.ready ? "rgba(251,191,36,0.34)" : "rgba(86,164,203,0.18)"}`,
                        background: forge.ready ? "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(15,23,42,0.92))" : "rgba(255,255,255,0.03)",
                        display: "grid",
                        gridTemplateColumns: "84px minmax(0, 1fr)",
                        gap: 12,
                        textAlign: "left",
                        cursor: "pointer",
                        boxShadow: forge.ready ? "0 0 24px rgba(251,191,36,0.14)" : "none",
                      }}
                    >
                    <div style={{ position: "relative", width: 84, height: 116, borderRadius: 10, overflow: "hidden", border: `1px solid ${card.color}55` }}>
                      <MiniPayImage
                        src={card.image}
                        alt={card.name}
                        minipayWidth={168}
                        minipayQuality={46}
                        loading="lazy"
                        decoding="async"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.9), transparent 60%)" }} />
                      <div style={{ position: "absolute", left: 6, right: 6, bottom: 6, fontSize: 8, fontWeight: 800, color: "#fff", letterSpacing: 0.6, textTransform: "uppercase", lineHeight: 1.15 }}>
                        {card.name}
                      </div>
                    </div>

                    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 9, fontWeight: 800, color: card.color, letterSpacing: 1.4, textTransform: "uppercase" }}>{card.type}</div>
                          <div style={{ marginTop: 4, fontSize: 13, fontWeight: 900, color: "#fff", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.name}</div>
                        </div>
                        <div style={{ padding: "3px 7px", borderRadius: 999, border: `1px solid ${forge.ready ? "rgba(251,191,36,0.42)" : "rgba(148,163,184,0.22)"}`, background: forge.ready ? "rgba(251,191,36,0.18)" : mastery.tier > 0 ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)", color: forge.ready ? "#fbbf24" : mastery.tier > 0 ? "#fbbf24" : "#94a3b8", fontSize: 8, fontWeight: 800, letterSpacing: 0.9, textTransform: "uppercase", flexShrink: 0 }}>
                          {forge.ready ? "Forge Ready" : mastery.tier > 0 ? `T${mastery.tier}` : "Training"}
                        </div>
                      </div>

                      <div style={{ fontSize: 10, color: "#cbd5e1", lineHeight: 1.35, minHeight: 28 }}>
                        {card.effect}
                      </div>

                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.2 }}>
                          <span>Mastery XP</span>
                          <span style={{ color: "#e2e8f0", fontWeight: 800 }}>{mastery.xp}</span>
                        </div>
                        <div style={{ marginTop: 6, height: 7, borderRadius: 999, background: "rgba(15,23,42,0.8)", border: "1px solid rgba(148,163,184,0.14)", overflow: "hidden" }}>
                          <div style={{ width: `${mastery.progressToNext * 100}%`, height: "100%", background: "linear-gradient(90deg, rgba(251,191,36,0.72), rgba(251,191,36,1))", boxShadow: "0 0 10px rgba(251,191,36,0.34)" }} />
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
                        {forge.requirements.map((requirement) => (
                          <div key={requirement.label} style={{ padding: "6px 7px", borderRadius: 8, border: `1px solid ${requirement.complete ? "rgba(251,191,36,0.28)" : "rgba(148,163,184,0.14)"}`, background: requirement.complete ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.03)" }}>
                            <div style={{ fontSize: 7, fontWeight: 800, color: requirement.complete ? "#fbbf24" : "#94a3b8", letterSpacing: 1, textTransform: "uppercase" }}>{requirement.label}</div>
                            <div style={{ marginTop: 3, fontSize: 10, fontWeight: 800, color: "#f8fafc" }}>{requirement.current}/{requirement.target}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 9, color: "#94a3b8" }}>
                        <span>{stats?.timesPlayed ?? 0} uses</span>
                        <span style={{ color: forge.ready ? "#fbbf24" : "#56a4cb", fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>
                          {forge.ready ? "Ascension Ready" : "Inspect"}
                        </span>
                      </div>
                    </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>

        {previewCard && (
          <CardPreviewModal
            card={previewCard}
            owned={!previewCard.isPremium || unlockedPremiumCards.includes(previewCard.id)}
            stats={cardPerformance[previewCard.id] ?? null}
            isAttuned={attunedCardIds.includes(previewCard.id)}
            canAttune={attunedCardIds.includes(previewCard.id) || attunedCardIds.length < 2}
            onToggleAttunement={
              (!previewCard.isPremium || unlockedPremiumCards.includes(previewCard.id)) && address
                ? () => {
                    setBuyError("");
                    void syncAttunedCard(attunedCardIds, previewCard.id).catch((error) => {
                      setBuyError(error instanceof Error ? error.message : "Failed to update attunement.");
                    });
                  }
                : null
            }
            onClose={() => setPreviewCardId(null)}
          />
        )}
      </div>
    </div>
  );
}
