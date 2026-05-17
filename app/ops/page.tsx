"use client";

import { useEffect, useState } from "react";
import { useSignMessage } from "wagmi";
import { useAccount } from "wagmi";
import { buildOpsAuthMessage, isOpsAllowed } from "../lib/admin";

type BalanceResponse = Awaited<ReturnType<typeof import("../lib/balance").getBalanceDashboard>>;

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
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
          <h1 style={{ margin: "10px 0 8px", fontSize: 28 }}>Connect admin wallet</h1>
          <p style={{ margin: 0, color: "#94a3b8", lineHeight: 1.6 }}>
            This page only loads for an allowlisted wallet.
          </p>
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

  const { snapshot, policy, watchlist, activity, audience, onChain } = data;

  return (
    <div style={{ minHeight: "100vh", background: "#04070d", color: "#e2e8f0", fontFamily: "var(--font-space-grotesk), sans-serif", padding: "40px 32px 64px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-end", marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#56a4cb", letterSpacing: 2.5, textTransform: "uppercase" }}>Internal Balance Console</div>
            <h1 style={{ margin: "8px 0 0", fontSize: 34, fontWeight: 900 }}>Ranked telemetry and watchlist</h1>
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
            { label: "Ranked Matches", value: snapshot.aggregate.totalMatches.toLocaleString() },
            { label: "Total Players", value: audience.totalPlayers.toLocaleString() },
            { label: "Daily Players", value: audience.dailyPlayers.toLocaleString() },
            { label: "Avg Match Length", value: `${snapshot.averageMatchMinutes.toFixed(1)} min` },
            { label: "Avg Round Length", value: `${snapshot.averageRoundSeconds.toFixed(1)} sec` },
            { label: "Transactions", value: audience.transactions.toLocaleString() },
            { label: "Mirror Match Rate", value: pct(snapshot.mirrorMatchRate) },
            { label: "House Matches", value: activity.house.totalMatches.toLocaleString() },
            { label: "Black Market Buys", value: activity.blackMarket.totalPurchases.toLocaleString() },
            { label: "Passes Sold (On-Chain)", value: onChain.totalPassesSold.toLocaleString() },
            { label: "Matches On-Chain", value: onChain.totalMatchesOnChain.toLocaleString() },
          ].map((item) => (
            <div key={item.label} style={{ background: "rgba(10,15,24,0.88)", border: "1px solid rgba(86,164,203,0.2)", borderRadius: 12, padding: "18px 18px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1.5, textTransform: "uppercase" }}>{item.label}</div>
              <div style={{ marginTop: 8, fontSize: 30, fontWeight: 900 }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 18, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 18 }}>
            <section style={{ background: "rgba(10,15,24,0.88)", border: "1px solid rgba(86,164,203,0.2)", borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#56a4cb", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>Top Cards</div>
              <div style={{ display: "grid", gap: 10 }}>
                {snapshot.topCards.map((card) => (
                  <div key={card.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.8fr 0.6fr", gap: 8, alignItems: "center", padding: "12px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>{card.name}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{card.id}</div>
                    </div>
                    <div style={{ fontSize: 13, color: "#cbd5e1" }}>Pick {pct(card.pickRate)}</div>
                    <div style={{ fontSize: 13, color: "#cbd5e1" }}>Win {pct(card.winRate)}</div>
                    <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "right" }}>{card.sample} samples</div>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ background: "rgba(10,15,24,0.88)", border: "1px solid rgba(86,164,203,0.2)", borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#56a4cb", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>Character Win Rates</div>
              <div style={{ display: "grid", gap: 10 }}>
                {snapshot.characterRows.map((row) => (
                  <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center", padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontWeight: 700 }}>{row.name}</div>
                    <div style={{ color: "#94a3b8" }}>{row.matches} matches</div>
                    <div style={{ color: "#e2e8f0" }}>{pct(row.winRate)}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            <section style={{ background: "rgba(10,15,24,0.88)", border: "1px solid rgba(86,164,203,0.2)", borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#56a4cb", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>Balance Workflow</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{policy.currentVersion}</div>
              <div style={{ display: "grid", gap: 8, color: "#cbd5e1", fontSize: 13 }}>
                <div>{policy.patchCadence.micro}</div>
                <div>{policy.patchCadence.major}</div>
                <div>Minimum card sample: {policy.thresholds.minimumCardSamples}</div>
                <div>Hot threshold: {pct(policy.thresholds.highWinRate)} win rate or {pct(policy.thresholds.highPickRate)} pick rate</div>
                <div>Cold threshold: below {pct(policy.thresholds.lowWinRate)} win rate</div>
              </div>
            </section>

            <section style={{ background: "rgba(10,15,24,0.88)", border: "1px solid rgba(86,164,203,0.2)", borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#56a4cb", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>Watchlist</div>
              <div style={{ display: "grid", gap: 10 }}>
                {watchlist.length === 0 && (
                  <div style={{ fontSize: 13, color: "#94a3b8" }}>No cards have crossed the current review thresholds yet.</div>
                )}
                {watchlist.map((item) => (
                  <div key={item.id} style={{ padding: "12px 12px 10px", borderRadius: 8, background: item.status === "hot" ? "rgba(239,68,68,0.08)" : "rgba(96,165,250,0.08)", border: item.status === "hot" ? "1px solid rgba(239,68,68,0.28)" : "1px solid rgba(96,165,250,0.28)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 800 }}>{item.name}</div>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", color: item.status === "hot" ? "#fca5a5" : "#93c5fd" }}>{item.status}</div>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#cbd5e1" }}>{item.summary}</div>
                    <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
                      Pick {pct(item.pickRate)} · Win {pct(item.winRate)} · {item.sample} samples
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ background: "rgba(10,15,24,0.88)", border: "1px solid rgba(86,164,203,0.2)", borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#56a4cb", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>Skill Buckets</div>
              <div style={{ display: "grid", gap: 10 }}>
                {snapshot.skillRows.map((row) => (
                  <div key={row.bucket} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center", padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontWeight: 700 }}>{row.bucket}</div>
                    <div style={{ color: "#94a3b8" }}>{row.matches} results</div>
                    <div style={{ color: "#e2e8f0" }}>{pct(row.winRate)}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>Using ranked points as the current skill-bucket proxy until true MMR exists.</div>
            </section>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start", marginTop: 18 }}>
          <section style={{ background: "rgba(10,15,24,0.88)", border: "1px solid rgba(86,164,203,0.2)", borderRadius: 12, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#56a4cb", letterSpacing: 2, textTransform: "uppercase" }}>House Match Activity</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                Win {pct(activity.house.winRate)} · Wagered {activity.house.wageredMatches}
              </div>
            </div>
            <div style={{ marginBottom: 12, fontSize: 12, color: "#64748b" }}>
              Avg points {activity.house.averagePointsEarned.toFixed(1)}
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {activity.house.recentMatches.length === 0 && (
                <div style={{ fontSize: 13, color: "#94a3b8" }}>No completed matches against the house have been logged yet.</div>
              )}
              {activity.house.recentMatches.map((match) => (
                <div key={`${match.matchId}-${match.completedAt}`} style={{ padding: "12px 12px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 800 }}>{match.playerName ?? shortHash(match.playerAddress)}</div>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: match.outcome === "win" ? "#86efac" : "#fca5a5", textTransform: "uppercase" }}>{match.outcome}</div>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "#cbd5e1" }}>
                    {match.playerCharacterName} vs {match.opponentCharacterName} · {match.playerRoundsWon}-{match.opponentRoundsWon}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
                    Difficulty {match.difficulty} · {match.wagered ? "Wagered" : "Free"} · {match.pointsEarned} pts · {new Date(match.completedAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </section>

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
