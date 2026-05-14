import { getBalanceDashboard } from "../lib/balance";
import Link from "next/link";

export const revalidate = 60; // refresh every minute

export default async function StatsPage() {
  const { audience, onChain, policy } = await getBalanceDashboard();

  const stats = [
    { label: "Daily Active Players", value: audience.dailyPlayers.toLocaleString(), color: "#4ade80" },
    { label: "Total Players", value: audience.totalPlayers.toLocaleString(), color: "#56a4cb" },
    { label: "Transactions", value: audience.transactions.toLocaleString(), color: "#b9e7f4" },
    { label: "Season Passes Sold", value: onChain.totalPassesSold.toLocaleString(), color: "#fbbf24" },
    { label: "Matches On-Chain", value: onChain.totalMatchesOnChain.toLocaleString(), color: "#a78bfa" },
    { label: "Season", value: policy.currentVersion, color: "#f472b6" },
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
      <div style={{ fontSize: 12, color: "rgba(185,231,244,0.3)", display: "flex", gap: 24 }}>
        <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>← Back to Game</Link>
        <a href="https://t.me/actionorder" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>Support</a>
      </div>
    </div>
  );
}
