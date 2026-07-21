// Auto-issued VS House reward codes are OFF by default. House match results are
// recorded from client telemetry that isn't authenticated, so a "win" is
// forgeable — auto-minting a real-value ($5) reward code from it would let
// anyone claim the prize pool (M-07). While disabled, wins are acknowledged and
// recorded as "pending", but a redeemable code is only issued after manual
// verification. Re-enable (ENABLE_HOUSE_AUTO_REWARDS=true) only once VS House
// results are authenticated server-side.
export const HOUSE_AUTO_REWARDS_ENABLED = process.env.ENABLE_HOUSE_AUTO_REWARDS === "true";
