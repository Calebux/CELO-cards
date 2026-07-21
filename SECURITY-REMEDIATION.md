# Security Remediation Status

Tracks the findings from the two GoodDollar CTO security reviews
(`REVIEW-clean-main.md`, `REVIEW-main-2026-07-21.md`) against what has been
fixed on `clean-main`. Kept for the re-review conversation.

Last updated: 2026-07-21

## Posture summary

- **Live MiniPay payment surface (season passes + card purchases): hardened.**
  Payments are verified on-chain, bound to the buyer, and replay-safe.
- **Wagers: escrow-only.** Only USDT/USDC/USDm wagers (which stake into the
  verified `KnockOrderArenaV2` escrow) can be created. Payout is bound to the
  real on-chain stakers, so funds can only reach an actual participant in the
  contract-recorded amount — theft to an outside address is not possible.
- **Superfluid streaming removed** everywhere in favour of bounded one-time
  transfers.
- **Deliberately deferred:** full match-action authentication (C-01) and
  server-side card-ownership enforcement (H-11 part 2). See "Deferred" below.

## Fixed

| Finding | What changed | Commit |
|---|---|---|
| C-03 unbounded G$ streams | All payouts/rewards are bounded one-time G$ transfers; Superfluid removed | `9009c1b` |
| H-01 season-pass plan escalation | Credited plan derived from the on-chain `PassPurchased` event, not the request | `b7b9975` |
| H-02 payment not bound to buyer | Every season-pass path requires `Transfer.from == buyer` | `0340c30` |
| H-03 non-atomic tx claim | Atomic `SET NX`, permanent used-tx record, idempotent per buyer | `78b6d67` |
| H-11 (part 1) black-market payment | Purchase verified on-chain (receipt, token, recipient, sender, amount ≥ card price); authoritative `owned-premium:<addr>` set | `7a715a8` |
| C-02 payout bypass / caller asset / replay | Removed `isMiniPay` signature bypass; currency derived from match state; permanent settlement finality | `465bfb7` |
| C-02 (Half A) forged winner | Escrow payout requires `winnerAddress` to be a real on-chain staker; no treasury fallback for active escrow matches | `5db796b` |
| Wager scope | Wager creation gated to escrow-backed stablecoins (USDT/USDC/USDm) only; G$/CELO wager creation rejected | `76aab27` |

## Deferred (with rationale)

### C-01 — full match-action authentication (move signing)

**Decision: deferred.** The residual after the fixes above is "a real staker
forges the *game outcome* to beat their real opponent" (Half B). Closing it
requires signing each card-order submission, bound to the two on-chain stakers.

Deferred because:
- Wagers are currently micro-stakes, and Half A + escrow-only already remove
  theft to a non-participant. The residual is bounded to a small stake between
  two consenting players.
- The fix flips the live gameplay loop from unauthenticated to
  signature-required and does **not** fail safe — a bug stalls legitimate
  wager matches. It needs a real two-wallet end-to-end test before enabling.
- It adds a per-round signature prompt (UX cost).

**Revisit when** stakes grow enough to justify the per-round-signing UX and the
two-wallet test effort. Recommended rollout: implement behind a feature flag
defaulting off, test a full two-wallet wager match on staging, then enable.

### H-11 (part 2) — server-side ownership enforcement

Multiplayer/trades do not yet reject premium cards a wallet hasn't paid for.
Deferred because there is no reliable historical ownership record to backfill
from, so enforcing now would lock out existing card holders. The authoritative
`owned-premium:<addr>` set (built by the part-1 fix) is the foundation;
enforcement needs a backfill/migration first.

## Still open (not yet addressed)

- **C-04** `/api/daily-reward` is unauthenticated (streaming removed, but any
  address can still trigger a small G$ transfer). Recommend gating to the same
  GoodDollar-verified eligibility as the real UBI claim, or disabling it.
- **C-01-adjacent** other match mutations (role assertion, order read/overwrite,
  VS House result forging) remain unauthenticated — same root as C-01.
- **Mediums** (M-01 free-game counter, M-03 Redis race conditions, M-04
  unverifiable randomness, M-05 deck/legality enforcement, M-10 hard-coded
  Alchemy key, etc.) — not yet addressed.
- **Key management** (H-12): treasury/deployer/owner remain one hot key.
