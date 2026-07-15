"use client";

import { useEffect, useState } from "react";
import { useSignMessage } from "wagmi";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { buildOpsAuthMessage, isOpsAllowed } from "../../lib/admin";

type BalanceResponse = Awaited<ReturnType<typeof import("../../lib/balance").getBalanceDashboard>>;

function share(value: number, total: number) {
  if (total <= 0) return "";
  return `${Math.round((value / total) * 100)}%`;
}

function shortHash(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function ptsToDisplay(value: number) {
  const tokens = value / 1000;
  return Number.isInteger(tokens) ? tokens.toString() : tokens.toFixed(1);
}

export default function OpsPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [data, setData] = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

  const allowed = isOpsAllowed(address);

  useEffect(() => {
    if (!allowed || !address) {
      setData(null);
      setNeedsAuth(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/ops")
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) {
            setNeedsAuth(true);
            return null;
          }
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to load ops data");
        }
        setNeedsAuth(false);
        return res.json() as Promise<BalanceResponse>;
      })
      .then((payload) => {
        if (!cancelled && payload) setData(payload);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load ops data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, allowed]);

  const handleAuthenticate = async () => {
    if (!address || !allowed) return;
    setAuthenticating(true);
    setError(null);
    try {
      const nonceRes = await fetch(`/api/ops/auth?address=${address}`);
      const nonceBody = await nonceRes.json().catch(() => ({}));
      if (!nonceRes.ok) {
        throw new Error(nonceBody.error ?? "Failed to create auth request");
      }

      const message = buildOpsAuthMessage(address, nonceBody.nonce, nonceBody.issuedAt);
      const signature = await signMessageAsync({ message });

      const verifyRes = await fetch("/api/ops/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });
      const verifyBody = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        throw new Error(verifyBody.error ?? "Authentication failed");
      }

      setNeedsAuth(false);
      setLoading(true);
      const dataRes = await fetch("/api/ops");
      const dataBody = await dataRes.json().catch(() => ({}));
      if (!dataRes.ok) {
        throw new Error(dataBody.error ?? "Failed to load ops data");
      }
      setData(dataBody);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setAuthenticating(false);
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await fetch("/api/ops/auth", { method: "DELETE" }).catch(() => {});
    setData(null);
    setNeedsAuth(true);
  };

  if (!isConnected || !address) {
    return (
      <div style={{ minHeight: "100vh", background: "#04070d", color: "#e2e8f0", fontFamily: "var(--font-space-grotesk), sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ width: 420, borderRadius: 12, padding: 24, background: "rgba(10,15,24,0.92)", border: "1px solid rgba(86,164,203,0.24)", textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#56a4cb", letterSpacing: 2, textTransform: "uppercase" }}>Ops Access</div>
          <h1 style={{ margin: "10px 0 16px", fontSize: 28 }}>Connect admin wallet</h1>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <ConnectButton />
          </div>
        </div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div style={{ minHeight: "100vh", background: "#04070d", color: "#e2e8f0", fontFamily: "var(--font-space-grotesk), sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ width: 460, borderRadius: 12, padding: 24, background: "rgba(10,15,24,0.92)", border: "1px solid rgba(239,68,68,0.24)", textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#f87171", letterSpacing: 2, textTransform: "uppercase" }}>Access denied</div>
          <h1 style={{ margin: "10px 0 8px", fontSize: 28 }}>Wallet not allowlisted</h1>
          <p style={{ margin: 0, color: "#94a3b8", lineHeight: 1.6 }}>
            Connected wallet: {address}
          </p>
        </div>
      </div>
    );
  }

  if (needsAuth) {
    return (
      <div style={{ minHeight: "100vh", background: "#04070d", color: "#e2e8f0", fontFamily: "var(--font-space-grotesk), sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ width: 480, borderRadius: 12, padding: 24, background: "rgba(10,15,24,0.92)", border: "1px solid rgba(86,164,203,0.24)", textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#56a4cb", letterSpacing: 2, textTransform: "uppercase" }}>Ops Access</div>
          <h1 style={{ margin: "10px 0 8px", fontSize: 28 }}>Sign with admin wallet</h1>
          <p style={{ margin: "0 0 18px", color: "#94a3b8", lineHeight: 1.6 }}>
            Connected wallet: {address}
          </p>
          <button
            onClick={() => void handleAuthenticate()}
            disabled={authenticating}
            style={{
              height: 48,
              padding: "0 22px",
              background: "linear-gradient(135deg, #1a3a52, #0f2233)",
              border: "1.5px solid #56a4cb",
              borderRadius: 8,
              cursor: authenticating ? "default" : "pointer",
              color: "#b9e7f4",
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: 1.3,
              textTransform: "uppercase",
              fontFamily: "inherit",
              opacity: authenticating ? 0.7 : 1,
            }}
          >
            {authenticating ? "Awaiting signature..." : "Sign In To Ops"}
          </button>
          {error && <div style={{ marginTop: 12, fontSize: 13, color: "#fca5a5" }}>{error}</div>}
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "#04070d", color: "#e2e8f0", fontFamily: "var(--font-space-grotesk), sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ fontSize: 15, color: "#94a3b8" }}>{error ?? "Loading ops console..."}</div>
      </div>
    );
  }

  const { snapshot, activity, onChain } = data;

  return (
    <div style={{ minHeight: "100vh", background: "#04070d", color: "#e2e8f0", fontFamily: "var(--font-space-grotesk), sans-serif", padding: "40px 32px 64px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-end", marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#56a4cb", letterSpacing: 2.5, textTransform: "uppercase" }}>Internal Balance Console</div>
            <h1 style={{ margin: "8px 0 0", fontSize: 34, fontWeight: 900 }}>Growth and on-chain telemetry</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>Updated {snapshot.aggregate.updatedAt ? new Date(snapshot.aggregate.updatedAt).toLocaleString() : "No data yet"}</div>
            <button
              onClick={() => void handleSignOut()}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                color: "#94a3b8",
                padding: "8px 12px",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Sign Out
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, marginBottom: 28 }}>
          {[
            { label: "Distinct Real Wallets", value: onChain.distinctRealWallets.toLocaleString(), note: "signups ∪ pass buyers" },
            { label: "GoodDollar Verified", value: onChain.verifiedGoodDollar.toLocaleString(), note: share(onChain.verifiedGoodDollar, onChain.distinctRealWallets) },
            { label: "Unverified", value: onChain.unverified.toLocaleString(), note: share(onChain.unverified, onChain.distinctRealWallets) },
            { label: "Passes Sold — GoodDollar (G$)", value: onChain.passesSoldGdollar.toLocaleString(), note: "" },
            { label: "Passes Sold — CELO", value: onChain.passesSoldCelo.toLocaleString(), note: "" },
            { label: "Total Passes Sold", value: onChain.totalPassesSold.toLocaleString(), note: "" },
          ].map((item) => (
            <div key={item.label} style={{ background: "rgba(10,15,24,0.88)", border: "1px solid rgba(86,164,203,0.2)", borderRadius: 12, padding: "18px 18px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1.5, textTransform: "uppercase" }}>{item.label}</div>
              <div style={{ marginTop: 8, fontSize: 30, fontWeight: 900 }}>{item.value}</div>
              {item.note ? <div style={{ marginTop: 4, fontSize: 11, color: "#64748b" }}>{item.note}</div> : null}
            </div>
          ))}
        </div>

        {!onChain.walletsComplete ? (
          <div style={{ marginBottom: 28, padding: "10px 14px", borderRadius: 8, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)", fontSize: 12, color: "#fbbf24" }}>
            Wallet scan is still catching up to the chain head — wallet counts may read low until it completes.
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 18, alignItems: "start", marginTop: 18 }}>
          <section style={{ background: "rgba(10,15,24,0.88)", border: "1px solid rgba(86,164,203,0.2)", borderRadius: 12, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#56a4cb", letterSpacing: 2, textTransform: "uppercase" }}>Black Market Purchases</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                Buyers {activity.blackMarket.uniqueBuyers} · {ptsToDisplay(activity.blackMarket.revenuePoints)} total
              </div>
            </div>
            <div style={{ marginBottom: 12, fontSize: 12, color: "#64748b" }}>
              USDT {activity.blackMarket.usdtPurchases} · CELO {activity.blackMarket.celoPurchases} · G$ {activity.blackMarket.gdollarPurchases}
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {activity.blackMarket.recentPurchases.length === 0 && (
                <div style={{ fontSize: 13, color: "#94a3b8" }}>No black market purchases have been logged yet.</div>
              )}
              {activity.blackMarket.recentPurchases.map((purchase) => (
                <div key={`${purchase.txHash}-${purchase.purchasedAt}`} style={{ padding: "12px 12px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 800 }}>{purchase.playerName ?? shortHash(purchase.address)}</div>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: purchase.currency === "gdollar" ? "#00C58E" : purchase.currency === "usdt" ? "#26a17b" : "#fbbf24", textTransform: "uppercase" }}>{purchase.currency}</div>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "#cbd5e1" }}>
                    {purchase.cardName} · {ptsToDisplay(purchase.pricePoints)} {purchase.currency === "gdollar" ? "G$" : purchase.currency === "usdt" ? "USDT" : "CELO"}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
                    {shortHash(purchase.txHash)} · {new Date(purchase.purchasedAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
