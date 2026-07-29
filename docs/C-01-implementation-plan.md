# C-01 Implementation Plan — authenticate match actions before re-enabling wagers

Status: **server auth foundation done.** Wager-action signatures + immutable role
binding + replay protection are implemented, tested where testable, and flag-gated
(`MATCH_AUTH_REQUIRED`, default off) so they can't touch current play. The remaining
work — commit-reveal, winner derivation, client signing, and the MiniPay spike —
needs a device + two live wallets and is the next session's focus. **Wagers stay OFF
until those land.**
Owner: TBD. Last updated: 2026-07-29.

## Progress so far (2026-07-29)
- ✅ **Wager-action signatures** — every wager mutation goes through
  `requireWagerActionAuth` (EIP-712, `matchAuth.ts`).
- ✅ **Immutable role binding (Phase 2)** — `slotBindingViolation` (`matchAuth.ts`)
  wired into `postImpl`; a paid slot's wallet is set once and can't be reassigned.
  Unit-tested (`test-unit/gameplay-fixes.test.ts`, `npm run test:unit`).
- ✅ **Replay protection** — a signed action is single-use within its TTL via a
  `match-nonce:*` `SET NX` marker in `requireWagerActionAuth`.
- ⏳ **Remaining (need a device / two wallets):** MiniPay `signTypedData` spike
  (Phase 0), commit-reveal (Phase 3), winner derivation (Phase 4), client signing
  (Phase 5), two-wallet e2e (Phase 6).

## Goal
Make wager match state and winner **tamper-proof** so `NEXT_PUBLIC_ENABLE_WAGERS`
can be flipped on safely. Root-fixes C-01, folds in H-08 (commit-reveal) and the
H-10 resolve-binding. Converts the "neutralized by wagers-off" findings into
real fixes.

## Already built — reuse, don't rebuild
- **`app/lib/matchAuth.ts`** — EIP-712 primitive (`verifyMatchActionSignature`)
  signs `{wallet, matchId, role, action, round, payloadHash, issuedAt}` with a
  5-min TTL. This is the "nonce-bearing, domain-separated signature" the review asked for.
- **`requireWagerActionAuth`** (`app/api/match/[matchId]/route.ts`) — verifies the
  signature + optional `expectedAddress`. Applied **only to wager actions** today.
- **Strict per-match lock (H-09)** — `app/lib/matchLock.ts`; mutations serialize,
  so auth checks aren't racy.
- **ArenaV2 escrow + payout requires `winner ∈ stakers`** (C-02 Half A).
- **Weak order-hiding** — GET returns `null` cardIds for wager mode until resolved
  (`route.ts:217`); orders are still stored plaintext.

## Phases (all behind a `MATCH_AUTH_REQUIRED` flag, default off)

### Phase 0 — MiniPay `signTypedData` spike (DO FIRST) — ⏳ NEXT (needs a device)
Confirm MiniPay's injected provider can produce an EIP-712 signature over
`MATCH_ACTION_TYPED_*`. If it can't, the whole approach needs a MiniPay-specific
auth path — this gates everything.

### Phase 1 — Authenticate every mutation (not just wager) — ✅ done for wager
Generalize `requireWagerActionAuth` → `requireMatchActionAuth`; call it at the top
of POST (character), PATCH (keepalive/submit/wager), DELETE (quit) for wager+ranked
modes. The signature's `payloadHash` must cover the real body (`cardIds`, `wagerTx`,
…) so a signed action can't have its payload swapped.

### Phase 2 — Immutable role binding — ✅ DONE
Implemented as `slotBindingViolation` (`matchAuth.ts`) wired into `postImpl`, unit-tested.
On first authenticated `character` registration, bind `host.address` /
`joiner.address` = the signed wallet, permanently. Reject later actions whose signed
wallet ≠ the bound slot (403); reject re-registering a filled slot. For wager mode,
cross-check the two bound addresses **equal the two ArenaV2 stakers**
(`arenaV2Server`) — match roles == escrow depositors.

### Phase 3 — Commit-reveal for orders (H-08) — ⏳ NEXT (needs client + two-wallet test)
Submit stores only `commitHash = keccak(order‖salt)` — never plaintext. Once both
players commit, each reveals `(order, salt)`; server verifies the hash, then resolves
the round from the revealed orders. Kills order read/overwrite; guarantees the winner
comes from committed, authenticated orders.
Fallback if UX too heavy: authenticated server-authoritative submission that never
returns the opponent's order (weaker, simpler).

### Phase 4 — Winner is derived, never asserted
`winnerAddress` computed from revealed orders + engine resolution, bound to the two
authenticated stakers. `(matchId, round)` resolution made idempotent (one resolution,
stored, non-repeatable) — pairs with the H-09 lock + existing `SET NX` pattern.

### Phase 5 — Client + MiniPay signing — ⏳ NEXT (needs a device)
Client signs each mutation via `signTypedData` using `MATCH_ACTION_TYPED_*`. Minimize
prompts by signing submit+reveal together (~1/round).

### Phase 6 — Rollout (does NOT fail safe)
- `MATCH_AUTH_REQUIRED` default off → nothing breaks current play.
- Tests in `test-unit/`: reject unsigned/forged/wrong-wallet/payload-swapped mutations,
  commit-reveal mismatch, winner-not-a-staker, replay.
- Full two-wallet end-to-end wager match on staging (stake → sign each round → resolve
  → payout → refund).
- Only when green: `NEXT_PUBLIC_ENABLE_WAGERS=true`.

## Risks
- **Doesn't fail safe** — a signing bug stalls a live wager match → flag + tests + staging gate.
- **UX** — per-round wallet prompt (the reason it was deferred). Batch signatures.
- **Replay** — ✅ done: `issuedAt` TTL + a consumed-nonce `SET NX` marker
  (`match-nonce:matchId:role:action:round:issuedAt`) in `requireWagerActionAuth`.
- **MiniPay `signTypedData`** — verify in Phase 0; if unsupported it may block the whole thing.

## Sequencing
Phase 0 (spike) → Phase 1+2 (auth + role binding — kills most of the drain) →
Phase 3+4 (commit-reveal + winner) → Phase 5 (client) → Phase 6 (test + enable).
