import { getBalanceDashboard } from "../lib/balance";
import Link from "next/link";

export const revalidate = 60; // refresh every minute

export default async function StatsPage() {
  const { audience, onChain, policy, retention, transactionHealth } = await getBalanceDashboard();

  const stats = [
    { label: "Daily Active Players", value: audience.dailyPlayers.toLocaleString(), color: "#4ade80" },
    { label: "Weekly Active Players", value: audience.weeklyPlayers.toLocaleString(), color: "#22c55e" },
    { label: "Monthly Active Players", value: audience.monthlyPlayers.toLocaleString(), color: "#14b8a6" },
    { label: "Total Players", value: audience.totalPlayers.toLocaleString(), color: "#56a4cb" },
    { label: "Tracked Transactions", value: audience.transactions.toLocaleString(), color: "#b9e7f4" },
    { label: "Transactions · 24H", value: audience.transactions24h.toLocaleString(), color: "#38bdf8" },
    { label: "Transactions · 7D", value: audience.transactions7d.toLocaleString(), color: "#818cf8" },
    { label: "Transactions · 30D", value: audience.transactions30d.toLocaleString(), color: "#c084fc" },
    { label: "Season Passes Sold", value: onChain.totalPassesSold.toLocaleString(), color: "#fbbf24" },
    { label: "Matches On-Chain", value: onChain.totalMatchesOnChain.toLocaleString(), color: "#a78bfa" },
    { label: "Tracked USDT Volume", value: `${audience.trackedVolumeUsdt.toFixed(2)} USDT`, color: "#34d399" },
    { label: "Tracked CELO Volume", value: `${audience.trackedVolumeCelo.toFixed(3)} CELO`, color: "#facc15" },
    { label: "Tracked G$ Volume", value: `${audience.trackedVolumeGdollar.toFixed(0)} G$`, color: "#10b981" },
    { label: "Season", value: policy.currentVersion, color: "#f472b6" },
  ];

  const retentionStats = [
    { label: "D1 Retention", value: `${Math.round(retention.d1Rate * 100)}%`, sample: retention.d1Eligible, color: "#38bdf8" },
    { label: "D7 Retention", value: `${Math.round(retention.d7Rate * 100)}%`, sample: retention.d7Eligible, color: "#818cf8" },
    { label: "D30 Retention", value: `${Math.round(retention.d30Rate * 100)}%`, sample: retention.d30Eligible, color: "#c084fc" },
  ];

  const txHealthStats = [
    { label: "Successful", value: transactionHealth.successfulTransactions.toLocaleString(), color: "#4ade80" },
    { label: "Failed", value: transactionHealth.failedTransactions.toLocaleString(), color: "#f87171" },
    { label: "Pending", value: transactionHealth.pendingTransactions.toLocaleString(), color: "#fbbf24" },
    { label: "Failed-Tx Rate", value: `${Math.round(transactionHealth.failedRate * 100)}%`, color: "#fb7185" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#040a14",
      color: "#b9e7f4",
      fontFamily: "var(--font-space-grotesk, sans-serif)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "48px 24px",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: "#56a4cb", textTransform: "uppercase", marginBottom: 8 }}>
          Action Order
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: "#fff", margin: 0, letterSpacing: 1 }}>
          Live Stats
        </h1>
        <p style={{ fontSize: 13, color: "rgba(185,231,244,0.4)", marginTop: 8 }}>
          No wallet required · Updates every minute
        </p>
        <p style={{ fontSize: 12, color: "rgba(185,231,244,0.3)", marginTop: 10, maxWidth: 560, lineHeight: 1.5 }}>
          Public ops snapshot for players, partners, and MiniPay review. Activity metrics reflect daily, 7-day, and 30-day participation across ranked, house matches, passes, and tracked purchases.
        </p>
        <p style={{ fontSize: 11, color: "rgba(185,231,244,0.22)", marginTop: 8, maxWidth: 620, lineHeight: 1.5 }}>
          Volumes are tracked from recorded wagers and marketplace purchases currently visible to the app backend. They are an operational dashboard, not a full chain index.
        </p>
      </div>

      {/* Stats grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 16,
        width: "100%",
        maxWidth: 720,
        marginBottom: 48,
      }}>
        {stats.map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              padding: "24px 20px",
              borderRadius: 10,
              backgroundColor: "rgba(255,255,255,0.03)",
              border: `1px solid ${color}30`,
              boxShadow: `0 0 20px ${color}10`,
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 900, color, marginBottom: 6 }}>
              {value}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "rgba(185,231,244,0.4)", textTransform: "uppercase" }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 16,
        width: "100%",
        maxWidth: 720,
        marginBottom: 36,
      }}>
        <div style={{ padding: "22px 20px", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(56,189,248,0.18)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: "#56a4cb", textTransform: "uppercase", marginBottom: 12 }}>
            Cohort Retention
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {retentionStats.map(({ label, value, sample, color }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{label}</div>
                  <div style={{ fontSize: 10, color: "rgba(185,231,244,0.35)" }}>Eligible cohort: {sample.toLocaleString()}</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "22px 20px", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(248,113,113,0.18)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: "#f87171", textTransform: "uppercase", marginBottom: 12 }}>
            Transaction Health
          </div>
          <div style={{ fontSize: 10, color: "rgba(185,231,244,0.35)", marginBottom: 12 }}>
            Sampled recent tracked payments: {transactionHealth.sampledTransactions.toLocaleString()}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {txHealthStats.map(({ label, value, color }) => (
              <div key={label} style={{ padding: "12px 10px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: `1px solid ${color}20` }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "rgba(185,231,244,0.4)", textTransform: "uppercase", marginBottom: 6 }}>
                  {label}
                </div>
                <div style={{ fontSize: 19, fontWeight: 900, color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "rgba(185,231,244,0.3)", display: "flex", gap: 24 }}>
        <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>← Back to Game</Link>
        <a href="https://t.me/actionorder" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>Support</a>
      </div>
    </div>
  );
}
