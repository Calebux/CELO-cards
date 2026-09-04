"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * House Boss prize approvals — which wins are real, and which have been paid.
 *
 * This panel IS the sybil defence for the $50 pool. There is no identity signal
 * to lean on: most winners come through MiniPay and have no GoodDollar
 * identity, while a throwaway wallet costs a farmer about $1.30 — a weekly pass
 * plus the cheapest black market card, the two things needed to reach Hard — to
 * chase a $5 prize. Nothing in the automated path can tell a real run from a
 * farmed one, so a human does, and that removes the arithmetic entirely.
 *
 * Approving moves no money. It only opens the player's Claim button; they still
 * sign for the transfer themselves, and the treasury pays their wallet.
 */

type Row = {
  matchId: string;
  playerAddress: string;
  playerName: string | null;
  verifiedAt: number;
  rewardUsd: number;
  approved: boolean;
  paid: boolean;
};

const card = {
  background: "rgba(10,15,24,0.92)",
  border: "1px solid rgba(86,164,203,0.24)",
  borderRadius: 12,
} as const;

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function HouseBossApprovals() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Approving releases real money to a player, so it takes two clicks. The
  // second click is the one that counts; the first only arms it.
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/house-winner/approve", { cache: "no-store" });
      if (res.status === 401) { setRows(null); setError("Ops session expired — unlock above."); return; }
      const data = await res.json() as { rows?: Row[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load approvals.");
      setRows(data.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load approvals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (row: Row, revoke: boolean) => {
    setBusy(row.matchId);
    setError(null);
    try {
      const res = await fetch("/api/house-winner/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: row.matchId, playerAddress: row.playerAddress, revoke }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not update this win.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this win.");
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  const pending = rows?.filter((r) => !r.approved).length ?? 0;
  const approvedUnpaid = rows?.filter((r) => r.approved && !r.paid).length ?? 0;
  const paid = rows?.filter((r) => r.paid).length ?? 0;

  return (
    <section style={{ ...card, padding: 22, marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#56a4cb", letterSpacing: 2.5, textTransform: "uppercase" }}>
            House Boss
          </div>
          <h2 style={{ margin: "6px 0 0", fontSize: 22 }}>Prize approvals</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#94a3b8", lineHeight: 1.5 }}>
            Approving does not send money — it opens the player&apos;s Claim button, and they sign for
            the transfer themselves. Only approve runs you believe are genuine: this check is the only
            thing standing between the pool and a farmed wallet.
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
            <strong style={{ color: "#fbbf24" }}>{pending}</strong> awaiting review
            {" · "}<strong style={{ color: "#4ade80" }}>{approvedUnpaid}</strong> approved, not yet claimed
            {" · "}<strong style={{ color: "#94a3b8" }}>{paid}</strong> paid
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          style={{ padding: "7px 14px", borderRadius: 4, cursor: loading ? "default" : "pointer", background: "rgba(86,164,203,0.12)", border: "1px solid rgba(86,164,203,0.35)", fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#b9e7f4", fontFamily: "inherit", textTransform: "uppercase" }}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <div role="alert" style={{ marginTop: 12, fontSize: 12.5, color: "#fca5a5" }}>{error}</div>}

      {rows && rows.length === 0 && (
        <p style={{ margin: "18px 0 0", fontSize: 13, color: "#475569" }}>
          No House Boss wins recorded yet.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((row) => {
            const isConfirming = confirming === row.matchId;
            const isBusy = busy === row.matchId;
            return (
              <div
                key={`${row.matchId}:${row.playerAddress}`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, flexWrap: "wrap",
                  padding: "10px 14px", borderRadius: 6,
                  background: row.paid ? "rgba(148,163,184,0.05)" : row.approved ? "rgba(74,222,128,0.06)" : "rgba(251,191,36,0.06)",
                  border: `1px solid ${row.paid ? "rgba(148,163,184,0.2)" : row.approved ? "rgba(74,222,128,0.28)" : "rgba(251,191,36,0.28)"}`,
                }}
              >
                <div style={{ minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#e2e8f0" }}>
                    {row.playerName || shortAddress(row.playerAddress)}
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "#4ade80" }}>${row.rewardUsd}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "#64748b", fontFamily: "monospace", marginTop: 2 }}>
                    {shortAddress(row.playerAddress)} · {row.matchId} ·{" "}
                    {new Date(row.verifiedAt).toLocaleString(undefined, { timeZone: "UTC" })} UTC
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {row.paid ? (
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", letterSpacing: 1, textTransform: "uppercase" }}>
                      ✅ Paid
                    </span>
                  ) : row.approved ? (
                    <>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#4ade80", letterSpacing: 1, textTransform: "uppercase" }}>
                        Approved · awaiting claim
                      </span>
                      {/* Only until they take it. After that there is nothing
                          to withdraw and the button is gone. */}
                      <button
                        onClick={() => void act(row, true)}
                        disabled={isBusy}
                        style={{ padding: "6px 12px", borderRadius: 4, cursor: isBusy ? "default" : "pointer", background: "transparent", border: "1px solid rgba(248,113,113,0.35)", fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#f87171", fontFamily: "inherit", textTransform: "uppercase" }}
                      >
                        {isBusy ? "…" : "Undo"}
                      </button>
                    </>
                  ) : isConfirming ? (
                    <>
                      <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700 }}>
                        Release ${row.rewardUsd} to this player?
                      </span>
                      <button
                        onClick={() => void act(row, false)}
                        disabled={isBusy}
                        style={{ padding: "6px 12px", borderRadius: 4, cursor: isBusy ? "default" : "pointer", background: "rgba(74,222,128,0.16)", border: "1px solid rgba(74,222,128,0.45)", fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#4ade80", fontFamily: "inherit", textTransform: "uppercase" }}
                      >
                        {isBusy ? "Approving…" : "Yes, approve"}
                      </button>
                      <button
                        onClick={() => setConfirming(null)}
                        disabled={isBusy}
                        style={{ padding: "6px 12px", borderRadius: 4, cursor: "pointer", background: "transparent", border: "1px solid rgba(148,163,184,0.3)", fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#94a3b8", fontFamily: "inherit", textTransform: "uppercase" }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirming(row.matchId)}
                      style={{ padding: "6px 14px", borderRadius: 4, cursor: "pointer", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.4)", fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#fbbf24", fontFamily: "inherit", textTransform: "uppercase" }}
                    >
                      Approve
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
