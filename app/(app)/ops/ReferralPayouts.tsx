"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Referral payouts — who is owed ₦, and a record of what has been sent.
 *
 * Naira cannot settle on-chain, so this screen does not pay anyone: a human
 * sends the transfer and marks it here. That makes the "Mark paid" button a
 * receipt rather than an action, and the reason it asks for confirmation — an
 * accidental click does not lose money, it loses the record that someone is
 * still owed.
 *
 * Loading this also re-evaluates every pending referral server-side, so opening
 * the page is what promotes anyone who verified or bought a pass since the last
 * look. There is no cron behind it.
 */

type Referee = {
  address: string;
  qualified: boolean;
  reason?: string;
  settled: "paid" | "waived" | null;
  paidAt: number | null;
  waivedAt: number | null;
  amountNgn: number;
};

type Referrer = {
  referrer: string;
  name: string | null;
  code: string;
  totalReferred: number;
  qualified: number;
  paid: number;
  waived: number;
  unpaid: number;
  owedNgn: number;
  referees: Referee[];
};

type Payload = {
  rewardNgn: number;
  totals: { referrers: number; referred: number; qualified: number; paid: number; owedNgn: number };
  referrers: Referrer[];
};

const REASON_LABEL: Record<string, string> = {
  "not-verified": "not G$ verified yet",
  "no-pass": "no season pass yet",
  "same-identity": "same identity as referrer — never pays",
  "no-referrer": "no referrer on record",
  "read-failed": "chain read failed, retry",
};

const naira = (n: number) => `₦${n.toLocaleString()}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const card = {
  background: "rgba(10,15,24,0.92)",
  border: "1px solid rgba(86,164,203,0.24)",
  borderRadius: 12,
} as const;

export function ReferralPayouts() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/referral/ops", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to load referrals");
      setData(body as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load referrals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const settle = async (referee: string, action: "paid" | "waived") => {
    setBusy(referee);
    setError(null);
    try {
      const res = await fetch("/api/referral/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referee, action }),
      });
      const body = await res.json().catch(() => ({}));
      // A 409 means it was already recorded — that is the guard working, not a
      // failure, so refresh rather than shouting at whoever clicked twice.
      if (!res.ok && res.status !== 409) throw new Error(body.error ?? "Could not record that");
      setConfirming(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record that");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section style={{ ...card, padding: 22, marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#56a4cb", letterSpacing: 2.5, textTransform: "uppercase" }}>
            Referral payouts
          </div>
          <h2 style={{ margin: "6px 0 0", fontSize: 22 }}>
            {data ? naira(data.totals.owedNgn) : "—"} owed
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#94a3b8", lineHeight: 1.5 }}>
            {data
              ? `${data.totals.qualified} qualified of ${data.totals.referred} referred · ${data.totals.paid} paid · ${naira(data.rewardNgn)} each`
              : "Loading…"}
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          style={{
            height: 34, padding: "0 14px", background: "rgba(86,164,203,0.12)",
            border: "1px solid rgba(86,164,203,0.35)", borderRadius: 6, color: "#b9e7f4",
            fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, letterSpacing: 1,
            textTransform: "uppercase", cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ marginTop: 12, fontSize: 12.5, color: "#fca5a5" }}>{error}</div>
      )}

      {data && data.referrers.length === 0 && !loading && (
        <p style={{ margin: "18px 0 0", fontSize: 13, color: "#475569" }}>
          Nobody has referred anyone yet.
        </p>
      )}

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {data?.referrers.map((r) => {
          const isOpen = open === r.referrer;
          return (
            <div key={r.referrer} style={{ border: "1px solid rgba(30,41,59,0.9)", borderRadius: 8, overflow: "hidden" }}>
              <button
                onClick={() => setOpen(isOpen ? null : r.referrer)}
                style={{
                  width: "100%", display: "grid",
                  gridTemplateColumns: "1fr 90px 90px 110px 28px",
                  gap: 10, alignItems: "center", padding: "11px 14px",
                  background: isOpen ? "rgba(86,164,203,0.08)" : "transparent",
                  border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "#e2e8f0",
                }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{r.name ?? short(r.referrer)}</span>
                  <span style={{ fontSize: 10.5, color: "#475569", fontFamily: "monospace" }}>code {r.code}</span>
                </span>
                <span style={{ fontSize: 12.5, color: "#94a3b8" }}>{r.totalReferred} referred</span>
                <span style={{ fontSize: 12.5, color: "#4ade80" }}>{r.qualified} qualified</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: r.owedNgn > 0 ? "#fbbf24" : "#475569" }}>
                  {naira(r.owedNgn)}
                </span>
                <span style={{ fontSize: 12, color: "#475569" }}>{isOpen ? "▾" : "▸"}</span>
              </button>

              {isOpen && (
                <div style={{ borderTop: "1px solid rgba(30,41,59,0.9)", padding: "6px 14px 12px" }}>
                  {r.referees.map((ref) => {
                    const settled = ref.settled;
                    return (
                      <div
                        key={ref.address}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          gap: 12, padding: "9px 0", borderBottom: "1px solid rgba(30,41,59,0.5)",
                        }}
                      >
                        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 12, fontFamily: "monospace", color: "#cbd5e1" }}>{ref.address}</span>
                          <span style={{ fontSize: 11, color: ref.qualified ? "#4ade80" : "#64748b" }}>
                            {!ref.qualified
                              ? REASON_LABEL[ref.reason ?? ""] ?? ref.reason ?? "pending"
                              : settled === "paid"
                                ? `paid ${new Date(ref.paidAt!).toLocaleDateString()}`
                                : settled === "waived"
                                  ? `not eligible — waived ${new Date(ref.waivedAt!).toLocaleDateString()}`
                                  : `qualified — owed ${naira(ref.amountNgn)}`}
                          </span>
                        </span>

                        {ref.qualified && !settled && (
                          confirming === ref.address ? (
                            <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                              <button
                                onClick={() => void settle(ref.address, "paid")}
                                disabled={busy === ref.address}
                                style={{
                                  height: 30, padding: "0 12px", background: "#4ade80", color: "#052e16",
                                  border: "none", borderRadius: 5, fontFamily: "inherit", fontSize: 11.5,
                                  fontWeight: 800, letterSpacing: 0.5, cursor: "pointer",
                                }}
                              >
                                {busy === ref.address ? "Saving…" : `Confirm ${naira(ref.amountNgn)} sent`}
                              </button>
                              <button
                                onClick={() => setConfirming(null)}
                                style={{
                                  height: 30, padding: "0 10px", background: "transparent", color: "#94a3b8",
                                  border: "1px solid rgba(148,163,184,0.3)", borderRadius: 5,
                                  fontFamily: "inherit", fontSize: 11.5, cursor: "pointer",
                                }}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                              <button
                                onClick={() => setConfirming(ref.address)}
                                style={{
                                  height: 30, padding: "0 12px", background: "rgba(74,222,128,0.12)",
                                  border: "1px solid rgba(74,222,128,0.4)", borderRadius: 5, color: "#4ade80",
                                  fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5,
                                  cursor: "pointer",
                                }}
                              >
                                Mark paid
                              </button>
                              {/* The reward goes to referrers in Nigeria only, and
                                  we hold no country data — so someone has to say
                                  "not this one" or the owed total never settles. */}
                              <button
                                onClick={() => void settle(ref.address, "waived")}
                                disabled={busy === ref.address}
                                style={{
                                  height: 30, padding: "0 10px", background: "transparent",
                                  border: "1px solid rgba(148,163,184,0.25)", borderRadius: 5, color: "#64748b",
                                  fontFamily: "inherit", fontSize: 11.5, cursor: "pointer",
                                }}
                              >
                                Not eligible
                              </button>
                            </span>
                          )
                        )}
                        {settled === "paid" && (
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#4ade80", flexShrink: 0 }}>✅ paid</span>
                        )}
                        {settled === "waived" && (
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#64748b", flexShrink: 0 }}>— waived</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ margin: "14px 0 0", fontSize: 11.5, color: "#475569", lineHeight: 1.6 }}>
        Marking paid records a transfer you have already sent — it moves no money. “Not eligible”
        settles a referral you do not intend to pay, so the owed total stays honest. A referral
        qualifies once the referee is G$ verified <em>and</em> has bought a season pass; someone
        sharing an identity with their referrer never qualifies, however many wallets they use.
      </p>
    </section>
  );
}
