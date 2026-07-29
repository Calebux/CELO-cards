# C-01 Implementation Plan — authenticate match actions before re-enabling wagers

Status: **code complete — one manual gate left.** Every server + client piece of the
C-01 fix is implemented, typecheck-clean, and unit-tested (`npm run test:unit`, 10/10),
all behind `MATCH_AUTH_REQUIRED` (default off) so it can't touch current play. The only
thing left before wagers can be turned on is the **two-wallet end-to-end web playtest
(Phase 6)** — it needs two live wallets and can't be automated here. Wagers are
**web-only** (MiniPay stays VS-House-only). **Wagers stay OFF until Phase 6 is green.**
Owner: TBD. Last updated: 2026-07-29.

## Progress so far (2026-07-29)
- ✅ **Wager-action signatures** — every wager mutation goes through
  `requireWagerActionAuth` (EIP-712, `matchAuth.ts`).
- ✅ **Immutable role binding (Phase 2)** — `slotBindingViolation` (`matchAuth.ts`)
  wired into `postImpl`; a paid slot's wallet is set once and can't be reassigned.
- ✅ **Replay protection** — a signed action is single-use within its TTL via a
  `match-nonce:*` `SET NX` marker in `requireWagerActionAuth`.
- ✅ **Commit-reveal (Phase 3)** — `app/lib/commitReveal.ts` primitive + wiring in the
  match route: `action:"commit"` stores `keccak(order‖salt)`; `action:"reveal"` is
  accepted only after BOTH sides commit and only if the reveal matches the stored
  commit. `PlayerSlot` gained `commitHash`/`commitRound` (`serverMatch.ts`). GET exposes
  `commitReveal`/`bothCommitted`/`selfCommitted`/… so the client can drive the flow.
- ✅ **Winner derivation + idempotency (Phase 4)** — winner is computed server-side from
  round wins (already the case); added a `!m.resolvedSlots` guard so `(matchId, round)`
  resolves exactly once — closes a latent double-count where a re-submitted round
  re-ran resolution.
- ✅ **Web client signing (Phase 5)** — `app/lib/commitRevealClient.ts`
  (`submitMatchOrder`) does the plain submit OR the commit→wait→reveal two-step
  transparently; salt is persisted per `(match,round)` so a reconnect/retry reuses it.
  Both loadout submit sites route through it. Casual/ranked paths unchanged.
- ✅ **Unit tests** — commit/reveal roundtrip + tampering, distinct commits, client
  salt↔server verify, role binding, resolution idempotency inputs (`test-unit/`).
- ⏳ **Remaining: Phase 6 only** — two live web wallets, staking end-to-end on staging
  with `MATCH_AUTH_REQUIRED=true` + wagers enabled. See "Phase 6" checklist below.
  The MiniPay `signTypedData` spike (Phase 0) is **dropped** — wagers are web-only.

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

### Phase 0 — MiniPay `signTypedData` spike — ❌ NOT NEEDED (wagers are web-only)
Decision (2026-07-29): **no wagers on MiniPay.** MiniPay stays VS-House-only —
already UI-gated (`create/page.tsx:203` only offers VS House in MiniPay; the
join-list filters out wager matches for MiniPay). So client signing only has to
work with **web wallets (Web3Auth / injected)**, which support `signTypedData`.
This removes the biggest unknown from the critical path — no device spike required.

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

### Phase 3 — Commit-reveal for orders (H-08) — ✅ DONE
Submit stores only `commitHash = keccak(order‖salt)` — never plaintext. Once both
players commit, each reveals `(order, salt)`; server verifies the hash, then resolves
the round from the revealed orders. Kills order read/overwrite; guarantees the winner
comes from committed, authenticated orders. Implemented: `app/lib/commitReveal.ts`
(`computeOrderCommit`/`verifyOrderReveal`), `action:"commit"` handler + reveal-gate in
`app/api/match/[matchId]/route.ts`, `commitHash`/`commitRound` on `PlayerSlot`.

### Phase 4 — Winner is derived, never asserted — ✅ DONE
`winnerAddress` is computed from server round-win counts (line ~756), never sent by the
client, and — with immutable role binding — the two slot addresses ARE the two
authenticated wallets; payout separately requires `winner ∈ stakers` (C-02 Half A).
`(matchId, round)` resolution made idempotent via a `!m.resolvedSlots` guard — one
resolution per round, non-repeatable — pairing with the H-09 lock + `SET NX` replay marker.

### Phase 5 — Client signing (web only) — ✅ DONE
`app/lib/commitRevealClient.ts::submitMatchOrder` signs each step via `signTypedData`
(`MATCH_ACTION_TYPED_*`, through `useMatchActionAuth`). It transparently does the plain
submit (non-wager / flag off) or the commit→wait-for-both→reveal two-step (wager +
`commitReveal`), reusing a per-`(match,round)` persisted salt across reconnects. Both
loadout submit sites route through it. **No MiniPay path — MiniPay has no wagers.**

### Phase 6 — Two-wallet e2e + rollout — ⏳ THE ONLY REMAINING GATE (manual)
Everything above is flag-gated off, so nothing breaks current play. Before flipping
wagers on, run this once on staging with **two real web wallets (A, B)** and
`MATCH_AUTH_REQUIRED=true` + wagers enabled + `AGENT_ADDRESSES` set:

1. **Stake** — A creates a wager match, B joins; both entry txs confirm on ArenaV2.
2. **Character** — each picks a character; confirm each slot binds to its wallet
   (a second wallet trying to register the same slot is rejected 403).
3. **Round (×3 to a win)** — each round, each wallet gets **two** signing prompts
   (commit, then reveal). Confirm: neither side's order is visible via GET until the
   round resolves; a reveal that doesn't match the commit is rejected; the round can't
   be re-resolved (re-submitting the same round doesn't move the score).
4. **Resolve → payout** — winner is the wallet with 3 round-wins; payout lands only to
   a staker; a draw/abort refunds.
5. **Replay/abuse spot-checks** — resend a captured commit/reveal (expect 409); submit
   plaintext `action:"submit"` in a commit-reveal match (expect 400).
6. Only when all green: set `NEXT_PUBLIC_ENABLE_WAGERS=true` (and keep
   `MATCH_AUTH_REQUIRED=true`).

Automated coverage already in `test-unit/` (`npm run test:unit`, 10/10): commit/reveal
roundtrip + tampering, distinct commits, client-salt↔server-verify, role binding,
casual-not-enforced, resolution-idempotency inputs, mutual-exclusion lock.

## Risks
- **Doesn't fail safe** — a signing bug stalls a live wager match → flag + tests + staging gate.
- **UX** — per-round wallet prompt (the reason it was deferred). Batch signatures.
- **Replay** — ✅ done: `issuedAt` TTL + a consumed-nonce `SET NX` marker
  (`match-nonce:matchId:role:action:round:issuedAt`) in `requireWagerActionAuth`.
- ~~MiniPay `signTypedData`~~ — N/A: wagers are web-only; MiniPay is VS-House-only.

## Sequencing
Phase 0 (spike) → Phase 1+2 (auth + role binding — kills most of the drain) →
Phase 3+4 (commit-reveal + winner) → Phase 5 (client) → Phase 6 (test + enable).
