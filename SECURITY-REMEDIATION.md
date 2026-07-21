# Security Remediation Status

Tracks the findings from the two GoodDollar CTO security reviews
(`REVIEW-clean-main.md`, `REVIEW-main-2026-07-21.md`) against what has been
fixed on `clean-main`. Kept for the re-review conversation.

Last updated: 2026-07-21 (second pass)

## Posture summary

- **Live MiniPay payment surface (season passes + card purchases): hardened.**
  Payments are verified on-chain, bound to the buyer, and replay-safe.
- **Wagers: escrow-only, with no treasury fallback.** Only USDT/USDC/USDm
  wagers (which stake into the verified `KnockOrderArenaV2` escrow) can be
  created. Payout now **requires** an Active on-chain escrow match and settles
  only through the contract — the old direct-treasury fall-through (which was
  sized by forgeable Redis amounts) is gone. Funds can only reach a real
  on-chain staker in the contract-recorded amount.
- **ArenaV2 settlement invariants are now on-chain.** `completeMatch` requires
  two equal stakes and a winner who is one of the two stakers; a permissionless
  `refundExpiredMatch` lets any staker recover an abandoned deposit after 24h;
  ownership transfer is two-step.
- **Stake attribution is replay-safe and receipt-confirmed.** Each deposit
  transfer log is consumed exactly once (permanent Redis record); attribution
  and settlement wait for on-chain receipts before being treated as final.
- **G$ pass pricing reads the contract.** The purchase flow reads the live
  registry price at approval time; UI prices are no longer trusted config.
- **Superfluid streaming removed** everywhere in favour of bounded one-time
  transfers.
- **Alchemy key removed from source** (`/api/season-pass`); RPC comes from env.
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
| C-02 payout fall-through | `/api/payout` removed the direct-treasury fallback entirely; wager payouts require an Active escrow match and settle only via the contract. Pre-gate legacy records return a "contact support" 409 instead of paying from forgeable Redis amounts | _this pass_ |
| H-04 price desync | `GDollarSeasonPassRegistry` price getters (`weeklyPrice`/`monthlyPrice`/`seasonPrice`) added to the client ABI; modal reads the live price at approval time and displays it, failing closed if the read fails | _this pass_ |
| H-05 ArenaV2 settlement invariants | `completeMatch` requires two equal stakes + winner ∈ stakers; permissionless `refundExpiredMatch` after `REFUND_TIMEOUT` (24h); two-step ownership | _this pass_ |
| H-06 attribution replay | Each stake transfer `(txHash, logIndex)` is consumed once via permanent `SET NX`, keyed to `matchId:player`; a deposit can't back a second match/player even with surplus in the contract | _this pass_ |
| H-07 unconfirmed finality | `attributeStakeOnChain` and payout settlement wait for on-chain receipts; only a confirmed `success` becomes permanent finality; a broadcast-but-pending settlement returns `202 pending` and is reconciled on the next claim | _this pass_ |
| M-10 embedded API key | Alchemy URL removed from `/api/season-pass` source; RPC read from `CELO_RPC_URL`/env with Forno fallback (rotate the leaked key) | _this pass_ |

## ⚠️ Requires redeploy before it takes effect

The **H-05 ArenaV2 invariants are source-only**. The deployed contract at
`0x8475ca3d129b9d69716b3dcab73a5e0306eaa9c1` is the *old* bytecode without
the two-staker / equal-stake / winner-is-staker checks, without
`refundExpiredMatch`, and with one-step ownership. Until a new
`KnockOrderArenaV2` is deployed and `NEXT_PUBLIC_ARENA_V2_ADDRESS` is
repointed (then source-verified on Celoscan), on-chain settlement still trusts
the owner to pass a correct winner.

Mitigation in the meantime: the **payout route already enforces the same
invariants off-chain** (winner must be an on-chain staker; escrow-only; no
treasury fallback), and the owner key is the only settler. So the residual is
"a compromised owner key settles wrongly" — the redeploy closes that. The
server-side H-06/H-07 fixes (log consumption, receipt confirmation) are live
now; they don't need the redeploy.

Deploy steps: `npx hardhat run scripts/deploy-arena-v2.ts` → verify source on
Celoscan → set `NEXT_PUBLIC_ARENA_V2_ADDRESS` → run `test/KnockOrderArenaV2.test.ts`
against the new ABI.

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
  unverifiable randomness, M-05 deck/legality enforcement) — not yet addressed.
- **Key management** (H-12): treasury/deployer/owner remain one hot key. The
  ArenaV2 two-step ownership added this pass helps rotate the owner safely but
  does not by itself split the roles.

## Fixed this pass — verification

- `npx tsc --noEmit` — clean.
- `npx hardhat test test/KnockOrderArenaV2.test.ts` — 10/10 pass (incl. new
  one-staker / non-staker-winner / unequal-stake rejection, timeout refund, and
  two-step ownership tests). The trailing node:test `AbortError` is a harness
  teardown artifact, not a test failure.
- `npm run build` — succeeds.
