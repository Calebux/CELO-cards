# Security Remediation Status

Tracks the findings from the two GoodDollar CTO security reviews
(`REVIEW-clean-main.md`, `REVIEW-main-2026-07-21.md`) against what has been
fixed on `clean-main`. Kept for the re-review conversation.

Last updated: 2026-07-21 (second pass)

## Posture summary

- **Wagers are OFF by default, gated server-side.** `NEXT_PUBLIC_ENABLE_WAGERS`
  (default false) is checked at wager-match creation, stake registration, and
  `/api/payout` — a real boundary, not just the UI gate (which the reviews
  correctly flagged as bypassable via direct API calls, H-09). With no wager
  match able to exist, the entire **C-01 cluster's monetary risk is neutralised**
  without needing per-move signing. The web `WagerModal` and the create-page
  wager card now show "Coming Soon" too, matching MiniPay. Flip the flag on only
  after C-01 auth lands and a two-wallet test passes. The hardening below still
  applies whenever wagers are re-enabled.
- **Live MiniPay payment surface (season passes + card purchases): hardened.**
  Payments are verified on-chain, bound to the buyer, and replay-safe.
- **Wagers (when enabled): escrow-only, with no treasury fallback.** Only USDT/USDC/USDm
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
| H-05 ArenaV2 settlement invariants | `completeMatch` requires two equal stakes + winner ∈ stakers; permissionless `refundExpiredMatch` after `REFUND_TIMEOUT` (24h); two-step ownership. **Deployed + Celoscan-verified at `0x473df985d05a0b635706e58ac8e7452dcc3e9a01`; app repointed** | _this pass; deployed pass 6_ |
| H-06 attribution replay | Each stake transfer `(txHash, logIndex)` is consumed once via permanent `SET NX`, keyed to `matchId:player`; a deposit can't back a second match/player even with surplus in the contract | _this pass_ |
| H-07 unconfirmed finality | `attributeStakeOnChain` and payout settlement wait for on-chain receipts; only a confirmed `success` becomes permanent finality; a broadcast-but-pending settlement returns `202 pending` and is reconciled on the next claim | _this pass_ |
| M-10 embedded API key | Alchemy URL removed from `/api/season-pass` source; RPC read from `CELO_RPC_URL`/env with Forno fallback (rotate the leaked key) | _pass 2_ |
| C-04 unauth daily reward | `/api/daily-reward` now requires a GoodDollar-verified (`isWhitelisted`) wallet and an atomic one-time-per-day claim; fails closed if the identity read fails | _pass 3_ |
| M-01 free-game accounting | Free-game counter only increments for free/ranked play; wager and tournament matches no longer burn the free allowance | _pass 3_ |
| M-05 (deck legality) | Card submission rejects decks that aren't 5 distinct cards or that exceed the character's energy pool (the same rules the client enforces). Ownership enforcement stays H-11 part 2 | _pass 3_ |
| M-09 G$ registry ownership | `GDollarSeasonPassRegistry` now uses two-step ownership (`transferOwnership` + `acceptOwnership`) with events | _pass 3, source-only, needs redeploy_ |
| C-01 cluster (money risk) | Server-side wager kill-switch (`NEXT_PUBLIC_ENABLE_WAGERS`, default off) at creation/registration/payout + web "Coming Soon" gate. No wager match can exist, so forged match state can't move real money | _pass 4_ |
| M-07 House reward-code forgery | `/api/house-winner` no longer auto-mints a $5 code from forgeable VS House telemetry. Gated by `ENABLE_HOUSE_AUTO_REWARDS` (default off); a win is recorded as **pending** and paid only after manual verification. Public showcase shows verified rewards only; in-game shows a "pending / claim on Telegram" acknowledgement | _pass 5_ |

## Deploy status

- **H-05 ArenaV2 — DONE.** The hardened `KnockOrderArenaV2` is deployed to Celo
  mainnet at `0x473df985d05a0b635706e58ac8e7452dcc3e9a01`, source-verified on
  Celoscan, and the app is repointed (`NEXT_PUBLIC_ARENA_V2_ADDRESS` in
  `.env.local` + `app/lib/arenaV2.ts` fallback). **Set the same env var in
  Vercel and redeploy** so production uses it. Supersedes `0x8475ca3d…`.
- **M-09 G$ registry — still source-only.** The two-step-ownership version is
  NOT deployed; the live registry is the old one-step version. This is a
  deliberate hold: the registry is a live payment contract and redeploying it
  resets on-chain purchase history for a defensive-only fix. Migrate only if you
  specifically want it.

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

## Still open — the C-01 cluster (one root cause)

Most of what remains is **not independent bugs**. It's all downstream of the
match/game state being unauthenticated and client-driven (C-01). You cannot
make these individually trustworthy while the underlying match actions are
forgeable — they need C-01 as the foundation, then become enforceable:

- **C-01** full match-action authentication (deferred — see above). The root.
- **C-01-adjacent** role assertion, order read/overwrite, VS House result
  forging (M-07), progression endpoints trusting the client (M-08) — all the
  same root.
- **House reward codes (M-07) — FIXED (pass 5).** `/api/house-winner` no longer
  auto-issues a redeemable $5 code from forgeable telemetry; wins are recorded
  **pending** and paid only after manual verification (`ENABLE_HOUSE_AUTO_REWARDS`
  default off). The underlying VS House telemetry is still unauthenticated (same
  C-01 root), so leaderboard/points remain forgeable — but no automatic real
  value is issued from it now.
- **H-10** treasury-funded ranked/House entries from weakly-trusted state. The
  VS House treasury entry is already flag-gated off (`ENABLE_VSHOUSE_TREASURY_ENTRY`
  defaults false); `/api/season-pass/enter` griefing needs match-action auth.
- **H-11 (part 2)** premium-card ownership enforcement — needs the
  `owned-premium` backfill first (see Deferred).
- **M-03** Redis race conditions — broad; the highest-value transitions (payout,
  daily-reward, season-pass tx claim, stake-log consumption) are now atomic via
  `SET NX`, but full versioned CAS across match state remains.
- **M-04** unverifiable randomness (`Math.random()` in paid matches) — needs a
  committed-seed/VRF design; overlaps with the C-01 commit/reveal work.

## Still open — needs ops, not code

- **Key management (H-12):** treasury/deployer/owner remain one hot key.
  Two-step ownership on both contracts (ArenaV2, G$ registry) makes rotation
  safe, but actually splitting into deployer / escrow-resolver / reward /
  sponsorship keys requires provisioning and funding separate wallets and
  moving contract ownership to a multisig — an operational task.

## Fixed this pass — verification

- `npx tsc --noEmit` — clean.
- `npx hardhat test test/KnockOrderArenaV2.test.ts` — 10/10 pass (incl. new
  one-staker / non-staker-winner / unequal-stake rejection, timeout refund, and
  two-step ownership tests). The trailing node:test `AbortError` is a harness
  teardown artifact, not a test failure.
- `npm run build` — succeeds.
