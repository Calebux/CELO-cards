"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useGameStore } from "../lib/gameStore";
import { CARDS } from "../lib/gameData";
import { WalletSection } from "../components/WalletSection";
import { DESIGN_W, DESIGN_H } from "../lib/designConstants";
import type { TradeOffer } from "../lib/cardTrade";

const BG_IMAGE = "/new addition/gameplay landing page.webp";

type TabView = "inbox" | "outbox" | "send";

export default function TradePage() {
  const router = useRouter();
  const { address } = useAccount();
  const { unlockedPremiumCards, purchaseCard } = useGameStore();
  const wrapRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<TabView>("inbox");
  const [inbox, setInbox] = useState<TradeOffer[]>([]);
  const [outbox, setOutbox] = useState<TradeOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Send form
  const [toAddress, setToAddress] = useState("");
  const [selectedOfferedCard, setSelectedOfferedCard] = useState<string | null>(null);
  const [selectedRequestedCard, setSelectedRequestedCard] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const ownedPremiumCards = CARDS.filter(c => c.isPremium && unlockedPremiumCards.includes(c.id));
  const allPremiumCards = CARDS.filter(c => c.isPremium);

  // Scale to viewport
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const sx = window.innerWidth / DESIGN_W;
      const sy = window.innerHeight / DESIGN_H;
      const s = Math.min(sx, sy);
      el.style.transform = `scale(${s})`;
      el.style.transformOrigin = "top left";
      el.style.width = `${DESIGN_W}px`;
      el.style.height = `${DESIGN_H}px`;
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Check for pending trade grants
  useEffect(() => {
    if (!address) return;
    fetch(`/api/trade?address=${address.toLowerCase()}&view=grants`)
      .then(r => r.ok ? r.json() as Promise<{ grants: string[] }> : null)
      .then(data => {
        if (data?.grants?.length) {
          data.grants.forEach(cardId => {
            if (!unlockedPremiumCards.includes(cardId)) {
              purchaseCard(cardId, 0);
            }
          });
        }
      })
      .catch(() => {});
  }, [address, unlockedPremiumCards, purchaseCard]);

  const fetchOffers = useCallback(async (view: "inbox" | "outbox") => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/trade?address=${address.toLowerCase()}&view=${view}`);
      const data = await res.json() as { offers: TradeOffer[] };
      if (view === "inbox") setInbox(data.offers);
      else setOutbox(data.offers);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (tab === "inbox") void fetchOffers("inbox");
    if (tab === "outbox") void fetchOffers("outbox");
  }, [tab, fetchOffers]);

  const handleAction = useCallback(async (tradeId: string, action: "accept" | "decline" | "cancel") => {
    if (!address) return;
    setActionMsg(null);
    try {
      const res = await fetch("/api/trade", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId, action, address }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setActionMsg(`Offer ${action}ed!`);
        // Immediately grant the card to local store so it shows without a page refresh
        if (action === "accept") {
          const acceptedOffer = inbox.find(o => o.id === tradeId);
          if (acceptedOffer && !unlockedPremiumCards.includes(acceptedOffer.offeredCardId)) {
            purchaseCard(acceptedOffer.offeredCardId, 0);
          }
        }
        void fetchOffers(tab === "outbox" ? "outbox" : "inbox");
      } else {
        setActionMsg(data.error ?? "Action failed.");
      }
    } catch {
      setActionMsg("Request failed.");
    }
  }, [address, tab, fetchOffers]);

  const sendOffer = useCallback(async () => {
    if (!address || !selectedOfferedCard || !toAddress.trim() || sending) return;
    setSending(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAddress: address,
          toAddress: toAddress.trim(),
          offeredCardId: selectedOfferedCard,
          requestedCardId: selectedRequestedCard,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setActionMsg("Trade offer sent!");
        setToAddress("");
        setSelectedOfferedCard(null);
        setSelectedRequestedCard(null);
        setTab("outbox");
      } else {
        setActionMsg(data.error ?? "Failed to send offer.");
      }
    } catch {
      setActionMsg("Request failed.");
    } finally {
      setSending(false);
    }
  }, [address, selectedOfferedCard, toAddress, selectedRequestedCard, sending]);

  const statusColor = (s: TradeOffer["status"]) => {
    if (s === "pending") return "#fbbf24";
    if (s === "accepted") return "#4ade80";
    if (s === "declined" || s === "cancelled") return "#f87171";
    return "#94a3b8";
  };

  const cardName = (id: string | null) => id ? (CARDS.find(c => c.id === id)?.name ?? id) : "Any card";

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#000" }}>
      <div ref={wrapRef}>
        {/* Background */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${BG_IMAGE})`, backgroundSize: "cover", backgroundPosition: "center", filter: "brightness(0.3)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,rgba(86,164,203,0.08) 0%,transparent 60%)" }} />

        {/* Nav */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", borderBottom: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(10px)", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={() => router.push("/profile")} style={{ background: "none", border: "none", color: "#56a4cb", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>← Profile</button>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#e2e8f0", letterSpacing: 2 }}>CARD TRADING</div>
          </div>
          <WalletSection />
        </div>

        {/* Main */}
        <div style={{ position: "absolute", top: 64, left: 0, right: 0, bottom: 0, padding: "24px 40px", overflowY: "auto" }}>
          {!address ? (
            <div style={{ textAlign: "center", color: "#6b7280", marginTop: 80, fontSize: 13 }}>Connect your wallet to trade cards.</div>
          ) : (
            <>
              {/* Tabs */}
              <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                {(["inbox", "outbox", "send"] as TabView[]).map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 18px", borderRadius: 6, cursor: "pointer", background: tab === t ? "rgba(86,164,203,0.2)" : "rgba(15,23,42,0.55)", border: `1px solid ${tab === t ? "rgba(86,164,203,0.5)" : "rgba(255,255,255,0.06)"}`, fontSize: 10, fontWeight: 700, color: tab === t ? "#b9e7f4" : "#6b7280", letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "inherit" }}>
                    {t === "inbox" ? `📥 Inbox (${inbox.filter(o => o.status === "pending").length})` : t === "outbox" ? "📤 Sent" : "✉️ Send Offer"}
                  </button>
                ))}
              </div>

              {actionMsg && (
                <div style={{ fontSize: 10, color: actionMsg.includes("!") ? "#4ade80" : "#f87171", marginBottom: 16, padding: "8px 14px", background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6 }}>{actionMsg}</div>
              )}

              {/* Inbox / Outbox */}
              {(tab === "inbox" || tab === "outbox") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {loading && <div style={{ color: "#6b7280", fontSize: 11 }}>Loading...</div>}
                  {!loading && (tab === "inbox" ? inbox : outbox).length === 0 && (
                    <div style={{ color: "#475569", fontSize: 11, textAlign: "center", marginTop: 40 }}>No trade offers yet.</div>
                  )}
                  {(tab === "inbox" ? inbox : outbox).map(offer => (
                    <div key={offer.id} style={{ background: "rgba(15,23,42,0.65)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4 }}>
                          {tab === "inbox" ? `From: ${offer.fromAddress.slice(0, 8)}...` : `To: ${offer.toAddress.slice(0, 8)}...`}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 2 }}>
                          Offering: <span style={{ color: "#b9e7f4" }}>{cardName(offer.offeredCardId)}</span>
                        </div>
                        {offer.requestedCardId && (
                          <div style={{ fontSize: 10, color: "#6b7280" }}>
                            Wants: <span style={{ color: "#fbbf24" }}>{cardName(offer.requestedCardId)}</span>
                          </div>
                        )}
                        {!offer.requestedCardId && <div style={{ fontSize: 9, color: "#475569" }}>Gift (no card requested)</div>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: statusColor(offer.status), letterSpacing: 1, textTransform: "uppercase" }}>{offer.status}</div>
                        {offer.status === "pending" && tab === "inbox" && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => void handleAction(offer.id, "accept")} style={{ padding: "4px 10px", borderRadius: 4, cursor: "pointer", background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", fontSize: 9, fontWeight: 700, color: "#4ade80", fontFamily: "inherit" }}>Accept</button>
                            <button onClick={() => void handleAction(offer.id, "decline")} style={{ padding: "4px 10px", borderRadius: 4, cursor: "pointer", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", fontSize: 9, fontWeight: 700, color: "#f87171", fontFamily: "inherit" }}>Decline</button>
                          </div>
                        )}
                        {offer.status === "pending" && tab === "outbox" && (
                          <button onClick={() => void handleAction(offer.id, "cancel")} style={{ padding: "4px 10px", borderRadius: 4, cursor: "pointer", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", fontSize: 9, fontWeight: 700, color: "#f87171", fontFamily: "inherit" }}>Cancel</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Send Offer Form */}
              {tab === "send" && (
                <div style={{ maxWidth: 520, margin: "0 auto" }}>
                  <div style={{ background: "rgba(15,23,42,0.65)", border: "1px solid rgba(86,164,203,0.2)", borderRadius: 10, padding: "24px 24px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#56a4cb", letterSpacing: 2, textTransform: "uppercase", marginBottom: 18 }}>New Trade Offer</div>

                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 5 }}>Recipient Address</div>
                      <input value={toAddress} onChange={e => setToAddress(e.target.value)} placeholder="0x..." style={{ width: "100%", background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, padding: "8px 10px", fontSize: 11, color: "#e2e8f0", fontFamily: "monospace", outline: "none", boxSizing: "border-box" }} />
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 5 }}>Card You&apos;re Offering</div>
                      {ownedPremiumCards.length === 0 ? (
                        <div style={{ fontSize: 10, color: "#475569" }}>You don&apos;t own any premium cards yet.</div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {ownedPremiumCards.map(card => (
                            <button key={card.id} onClick={() => setSelectedOfferedCard(card.id === selectedOfferedCard ? null : card.id)} style={{ padding: "5px 12px", borderRadius: 5, cursor: "pointer", background: selectedOfferedCard === card.id ? "rgba(86,164,203,0.2)" : "rgba(15,23,42,0.5)", border: `1px solid ${selectedOfferedCard === card.id ? "rgba(86,164,203,0.5)" : "rgba(255,255,255,0.08)"}`, fontSize: 10, fontWeight: 600, color: selectedOfferedCard === card.id ? "#b9e7f4" : "#94a3b8", fontFamily: "inherit" }}>
                              {card.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 5 }}>Card You Want in Return <span style={{ color: "#475569" }}>(optional — leave empty for a gift)</span></div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {allPremiumCards.map(card => (
                          <button key={card.id} onClick={() => setSelectedRequestedCard(card.id === selectedRequestedCard ? null : card.id)} style={{ padding: "5px 12px", borderRadius: 5, cursor: "pointer", background: selectedRequestedCard === card.id ? "rgba(251,191,36,0.15)" : "rgba(15,23,42,0.5)", border: `1px solid ${selectedRequestedCard === card.id ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.08)"}`, fontSize: 10, fontWeight: 600, color: selectedRequestedCard === card.id ? "#fbbf24" : "#94a3b8", fontFamily: "inherit" }}>
                            {card.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button onClick={() => void sendOffer()} disabled={sending || !selectedOfferedCard || !toAddress.trim()} style={{ width: "100%", padding: "10px 0", borderRadius: 6, cursor: sending || !selectedOfferedCard || !toAddress.trim() ? "not-allowed" : "pointer", background: "rgba(86,164,203,0.15)", border: "1px solid rgba(86,164,203,0.4)", fontSize: 10, fontWeight: 800, color: "#b9e7f4", letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "inherit", opacity: sending || !selectedOfferedCard || !toAddress.trim() ? 0.5 : 1 }}>
                      {sending ? "Sending..." : "Send Trade Offer →"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
