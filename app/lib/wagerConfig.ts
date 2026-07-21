// Real-money staked matches ("wagers") are OFF by default and gated
// server-side — a real boundary, not merely a hidden button. They stay off
// until match-action authentication (C-01) lands and a two-wallet end-to-end
// test passes. Flip NEXT_PUBLIC_ENABLE_WAGERS=true to re-enable everywhere
// (client UI + server API) at once.
export const WAGERS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_WAGERS === "true";
