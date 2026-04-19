"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

export function DailyReward() {
  const { address } = useAccount();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    const today = new Date().toISOString().slice(0, 10);
    const key = `ao-lastDailyLogin-${address.toLowerCase()}`;
    if (typeof window !== "undefined" && localStorage.getItem(key) === today) return;

    fetch("/api/daily-reward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    })
      .then((r) => r.json())
      .then((data: { claimed?: boolean; txHash?: string; streaming?: boolean; error?: string }) => {
        if (data.claimed || data.error) return;
        localStorage.setItem(key, today);
        setToast("Daily G$ stream started! ✓");
        setTimeout(() => setToast(null), 5000);
      })
      .catch(() => {});
  }, [address]);

  if (!toast) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        pointerEvents: "none",
        background: "rgba(0, 197, 142, 0.15)",
        border: "1px solid rgba(0, 197, 142, 0.5)",
        borderRadius: 8,
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        boxShadow: "0 0 20px rgba(0, 197, 142, 0.2)",
        backdropFilter: "blur(8px)",
        whiteSpace: "nowrap",
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#00C58E",
          boxShadow: "0 0 6px #00C58E",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#00C58E",
          letterSpacing: 0.5,
          fontFamily: "var(--font-space-grotesk), sans-serif",
        }}
      >
        {toast}
      </span>
    </div>
  );
}
