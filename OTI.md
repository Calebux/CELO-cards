# OTI — Action Order × GoodDollar: what we did

Two things live in this file:

1. **The CTO security review** — what was flagged, what we fixed, what we deferred and why.
2. **Connected wallets / shared G$ Verified status** — the guidance we were sent, and what we
   built against it.

Both are written to be read by the GoodDollar team, not just by us. Where something is *not*
done, it says so.

Last updated: 2026-08-17.

---

# Part 1 — The GoodDollar CTO security review

Two reviews were issued (`REVIEW-clean-main.md`, `REVIEW-main-2026-07-21.md`). The full
finding-by-finding status lives in [`SECURITY-REMEDIATION.md`](./SECURITY-REMEDIATION.md); this
is the summary.

## The single biggest change: wagers are off

Real-money staked matches are **disabled and gated server-side** —
`NEXT_PUBLIC_ENABLE_WAGERS` (default false), enforced at wager-match creation, stake
registration, and `/api/payout`. Not a hidden button: a real boundary, because the reviews
correctly pointed out that a UI-only gate is bypassable by calling the API directly.

This matters for how the rest of the list reads. The review's most serious cluster (C-01,
match-action authentication) is about a player forging match state. With no wager match able to
exist, that cluster **cannot move money**. We are explicit that this is *neutralised, not
root-fixed*.

## Fixed

| Finding | Fix |
|---|---|
| C-02 payout bypass / replay | `isMiniPay` signature bypass removed; currency and winner derived from verified match state; permanent settlement finality |
| C-02 fall-through | `/api/payout` no longer falls back to a direct treasury send. Wager payouts require an Active on-chain escrow match and settle only through the contract |
| C-03 unbounded G$ streams | Superfluid removed everywhere in favour of bounded one-time transfers |
| C-04 unauth treasury daily reward | `/api/daily-reward` requires a G$ Verified identity plus an atomic one-claim-per-day record; fails closed if the identity read fails |
| H-01 cheap pass credited as expensive | Credited plan derived from the on-chain `PassPurchased` event, never the request |
| H-02 on-chain price desync | Client reads the live registry price at approval time; fails closed |
| H-03 legacy payment theft | Every season-pass path requires `Transfer.from == buyer` |
| H-04 non-atomic tx uniqueness | Atomic `SET NX`, permanent used-tx record, idempotent per buyer |
| H-05/H-06 arena not a real escrow | Hardened `KnockOrderArenaV2` — `completeMatch` requires two equal stakes and a winner who is one of the two stakers; permissionless `refundExpiredMatch` after 24h; two-step ownership. Deployed and Celoscan-verified at `0x473df985d05a0b635706e58ac8e7452dcc3e9a01` |
| H-06 attribution replay | Each stake transfer `(txHash, logIndex)` is consumed exactly once, keyed `matchId:player` |
| H-07 unconfirmed finality | Attribution and settlement wait for on-chain receipts; only a confirmed success is final, pending returns `202` and reconciles on the next claim |
| H-09 match-update races | Strict per-match write lock (Redis Lua mutual exclusion, `app/lib/matchLock.ts`); conflicting writers get a retryable 409 rather than clobbering |
| H-10 / M-07 forged VS House rewards | `/api/house-winner` no longer auto-mints a reward code from forgeable telemetry. Off by default; a win is recorded **pending** and paid only after manual verification |
| M-02 unrecoverable entitlements | `reconcilePasses()` rebuilds entitlements from on-chain `PassPurchased` events — it surfaced 5 lost active passes |
| M-05 rules vs engine | Elara's ultimate grants the +5 **priority** it advertises; Kaira's crit capped at 2×; round decided by total Knock, as the tutorial says |
| M-05 deck legality | Server rejects decks that aren't 5 distinct cards or that exceed the character's energy pool |
| M-09/M-01 registry ownership | Two-step ownership with events (source only — see below) |
| M-10 embedded API key | Alchemy URL removed from source; RPC from env with Forno fallback |

## Deferred on purpose

These are decisions, not oversights.

| Finding | Why |
|---|---|
| **C-01 / H-08** match-action auth (per-move signing) | It does not fail safe — a bug stalls live matches — and it adds a wallet prompt per round. Needs a two-wallet end-to-end test first. Safe to defer *only* because wagers are off. Revisit before re-enabling them. |
| **H-11 pt 2 / M-04** card-ownership enforcement | Locks out existing card holders without an owned-card backfill first. |
| **M-01** registry two-step ownership (deployed copy) | The live registry is a payment contract; redeploying it resets on-chain purchase history for a defensive-only fix. Source has it; migrate only deliberately. |
| **H-11** single hot key → multisig | Needs a Safe and an on-chain ownership move. Ops task, not code. |
| **M-06** house AI sees player order | Intentional — it's the difficulty handicap. |
| **M-03** provable-fair randomness | Only matters for trustless money matches, which we don't run. |

## Honest caveats

- **H-09** is a strict per-match lock, not optimistic versioned CAS. Same no-clobber
  guarantee, one of the reviewer's own listed options.
- The M-05 combat fixes and the H-09 lock have **automated regression tests**
  (`npm run test:unit`), including per-match mutual exclusion against real Upstash.
- A full two-client end-to-end play is still worth doing before wagers go back on.
- **Still open:** other unauthenticated match mutations, and mediums M-03/M-04/M-05/M-10
  residuals. The underlying VS House telemetry is still unauthenticated (the C-01 root), so
  points and leaderboard positions remain forgeable. Nothing of real value is minted from
  them automatically — that's the H-10 fix — but we don't claim the telemetry is trustworthy.

---

# Part 2 — Connected wallets: one identity, several addresses

## The guidance we were given

Verbatim summary of what GoodDollar sent us:

- Users use different wallets for different purposes, and some G$ dapps use connection
  providers (Privy and similar) that mint a **dapp-exclusive wallet**.
- Within the G$ protocol many actions are gated by G$ Identity, so a user on any wallet other
  than their main G$ Verified one is locked out of those actions.
- GoodDollar therefore supports **connecting wallets**: a shared G$ Verified status across
  addresses. It does **not** increase eligibility — several addresses simply represent the
  same person.
- User guide:
  <https://docs.gooddollar.org/user-guides/connect-another-wallet-address-to-identity>
- Builders using `citizen-sdk`:
  <https://github.com/GoodDollar/GoodSDKs/blob/main/packages/citizen-sdk/README.md#wallet-link-connect-a-wallet>
  A custom integration just calls `connectAccount` on the Identity contract from the root
  address.
- A plug-and-play widget is expected soon.
- Terminology: code and contracts say *whitelisted*; user-facing copy should say
  **"G$ Verified wallets"**.

The architectural requirement, which is the part that actually bites:

> Any points allocation or account assignment should not be done against the connected
> address — always use the address returned by `getWhitelistedRoot(<connected address>)`.
> `isWhitelisted` only returns true for the root address; a connected account will not show
> up as whitelisted.
>
> 1. user connects accounts
> 2. call `getWhitelistedRoot(<connected address>)`
> 3. use the root for points allocation / account assignment / user tracking
> 4. check `isWhitelisted(<root address>)`

## What we shipped

**Status: implemented and live.** Commit `a614a39`, 2026-08-11 — *"Judge G$ verification by
the identity, not the wallet in hand."*

Before that commit every gate asked the connected wallet about itself via `isWhitelisted`. That
had a dead end in it: a verified human playing from a linked wallet would read as unverified,
get pushed into face verification, and be rejected as a duplicate, with no way out from inside
the game. We closed the failure mode rather than waited for it — see "Why we read the root but
never built a linking flow" below for how often it actually arises for us.

`resolveGoodDollarIdentity()` in [`app/lib/gooddollar.ts`](./app/lib/gooddollar.ts) now reads
`getWhitelistedRoot` on the Identity contract (`0xC361A6E67822a0EDc17D899227dd9FC50BD62F42`),
which answers all three cases in one call:

| Wallet state | `getWhitelistedRoot` returns | We treat it as |
|---|---|---|
| No identity | zero address | unverified, keyed on itself |
| Its own root | itself | verified, keyed on itself |
| Linked to a root | the root | verified, keyed on **the root** |

It returns an `identityKey`, and **every per-person record keys on that**, never on the
connected address:

- `app/api/daily-reward/route.ts` — `daily-reward:<identityKey>:<day>`
- `app/api/house-winner/route.ts` — `house-winner-day:<day>:<identityKey>` and
  `house-reward-wallet:<identityKey>`
- `app/api/bounty/claim/route.ts` — prize claims resolve through the identity, so a linked
  wallet can claim

That direction matters both ways. Reading the root stops us *rejecting* a verified human; keying
on the root stops one human with N linked wallets drawing N daily rewards and N lifetime House
prizes. Payouts still go to the wallet actually being played — only the *entitlement* is
counted per identity.

We also handle a case the guidance doesn't cover: an **expired** identity is
indistinguishable from a brand-new one under `getWhitelistedRoot` (both read as the zero
address). `fetchGoodDollarStatus()` reads `lastAuthenticated` and `authenticationPeriod` as
well, so a lapsed player is told to **renew** rather than to start over — and for a lapsed
*linked* wallet, where the root is no longer reachable via `getWhitelistedRoot`, we fall back
to `connectedAccounts` to find it.

Verified against mainnet: currently-verified wallets resolve to themselves, so nothing changed
for anyone who hadn't linked — including their existing Redis keys, which is why this needed no
migration.

Covered by 10 tests in `test-unit/goodDollarIdentity.test.ts` (all passing), including "two
wallets on one identity collapse to a single reward key".

Copy now says **"G$ Verified"** throughout, per the terminology note.

## What we have *not* done

- **We don't call `connectAccount` ourselves, and there's no linking flow in the game.** We read
  a link if one exists; we never create one. A player already verified elsewhere is better
  served by logging in with that wallet via the MetaMask option than by linking a second
  address — see below.
- **We deliberately don't link to the helper app.** It's a CodeSandbox preview that asks for
  hand-typed addresses. Sending players from a game to a sandbox domain to paste a wallet
  address is the shape of a phishing flow, and we're not training our users to do that. The
  embeddable widget will replace that link the moment it exists — that's the one thing we're
  waiting on.
- **We don't use `citizen-sdk` for this.** `@goodsdks/citizen-sdk` is a dependency, but the
  identity read is a direct `getWhitelistedRoot` call, which is all it needs to be.

## Why we read the root but never built a linking flow

Worth being precise about this, because it's the opposite of what you might expect from a
non-web3-native audience.

Our players are indeed not web3-native — but there are only two ways into Action Order, and
**both hand us a wallet that is already its own identity root**:

1. **Gmail / social sign-in.** This mints a fresh address for the player. Because most of our
   users have never been G$ Verified before, they verify *on that address* — so it becomes its
   own root, and `getWhitelistedRoot` returns the wallet itself.
2. **MetaMask.** The same auth layer offers a MetaMask option. A player who *is* already G$
   Verified elsewhere simply logs in with that verified wallet and plays from it directly.

So the dapp-exclusive-wallet problem your guidance describes — a user stuck on a wallet that
isn't their verified one — doesn't really arise for us. The already-verified user has a
one-click path to bring their verified wallet in, which is strictly simpler than linking a
second address.

That's why there is **no linking UX in the game**: no `connectAccount` call, no "link another
wallet" flow. We didn't need one.

What we *did* do is make the read layer correct anyway. `getWhitelistedRoot` is a strict
superset of `isWhitelisted` — identical answers for a wallet that is its own root, which is
every one of our users today, and automatically right for anyone who ever does link. Keying
records on the returned root costs nothing now and means one human can never hold two accounts
later. It needed no migration precisely because nothing changed for the unlinked case.

In other words: implemented at the layer where it's cheap and future-proof, skipped at the
layer where our sign-in options already solve the problem.

---

# Part 3 — Short version for the thread

> On connected wallets — we've done the architecture part, and deliberately skipped the linking
> part. Worth explaining both.
>
> **Done:** since 11 Aug every G$ gate in Action Order resolves through
> `getWhitelistedRoot(<connected address>)` rather than asking the connected wallet about
> itself, and every per-person record — daily reward limits, the one-per-person House prize,
> bounty claims — keys on the returned root, never on the address in hand. Payouts still go to
> the wallet being played; only entitlement is counted per identity. So if a player ever does
> link addresses, we already treat them as one person rather than several.
>
> **Not done, on purpose:** there's no linking UX in the game — no `connectAccount` call, no
> "link another wallet" flow. Our users aren't web3-native, but there are only two ways in and
> both hand us a wallet that's already its own root. Gmail sign-in mints a fresh address, and
> since most of our users have never been G$ Verified before, they verify on *that* address. And
> anyone who *is* already verified elsewhere can log in with MetaMask through the same auth and
> just play from their verified wallet — simpler than linking a second address. So the
> dapp-exclusive-wallet trap doesn't really bite us.
>
> We took the read-layer change anyway because it's free: `getWhitelistedRoot` is a strict
> superset of `isWhitelisted`, identical for unlinked wallets, and correct automatically if that
> ever changes. No migration needed.
>
> One thing we hit that isn't in the guidance: an **expired** identity and a never-verified one
> both read as the zero address under `getWhitelistedRoot`. We read `lastAuthenticated` and
> `authenticationPeriod` too, so lapsed users are told to renew rather than start over — and for
> a lapsed linked wallet, where the root is no longer reachable via `getWhitelistedRoot`, we
> fall back to `connectedAccounts`. Might be worth a line in the docs.
>
> On the helper app — we're deliberately not linking it. It's a CodeSandbox preview asking for
> hand-typed addresses, and sending non-web3-native players to a sandbox domain to paste a
> wallet address is the exact shape of a phishing flow. **The plug-and-play widget is what we'd
> use** if the need ever arises for our users, so do keep us posted.
>
> Copy says "G$ Verified" throughout, per the terminology note.
