// ─────────────────────────────────────────────────────────────────────────────
// WAGERS ARE OFF.
// Real-money staked matches are DISABLED and gated server-side — a real
// boundary (enforced at wager-match creation, stake registration, and
// /api/payout), not merely a hidden button. NEXT_PUBLIC_ENABLE_WAGERS is unset,
// so WAGERS_ENABLED is false everywhere (client UI + server API).
//
// While this flag is off, no wager match can exist, so the C-01 match-action
// cluster carries NO monetary risk. Wagers stay off until match-action
// authentication (C-01) lands and a two-wallet end-to-end test passes; only
// then set NEXT_PUBLIC_ENABLE_WAGERS=true.
// ─────────────────────────────────────────────────────────────────────────────
export const WAGERS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_WAGERS === "true";
