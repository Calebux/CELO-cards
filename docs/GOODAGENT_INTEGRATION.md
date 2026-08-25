# GoodAgent integration

Lets players deploy a GoodDollar-verified GoodAgent that plays VS House
matches on their behalf, controlled from a command deck at `/agents`.

Rewritten against `clean-main` after review of the original PR
(Calebux/Action-order#1). The guiding change: **the agent lane owns no game
rules.** Every agent match goes through the live
`/api/match/vshouse/resolve` route, one round per call, exactly like a human
client — Redis match state, difficulty pinned at creation,
`houseMatchPoints()` scoring and daily bounty caps all apply unchanged.

## Pages

- `app/(app)/agents/` — command deck: deploy/verify widget (`@goodagent/widget`,
  pinned exact version), live stats, play controls, match history.
  Lives in the `(app)` group so the wallet provider tree is mounted.
- Landing page gains a "MY AGENTS" nav button.

**Web only.** Deploying an agent runs GoodDollar face verification, and
GoodDollar must not appear or operate anywhere in the MiniPay Mini App —
MiniPay block go-live on it. The nav button is hidden in MiniPay and
`page.tsx` keeps a deep-link branch; the deck itself sits in
`AgentsCommandDeck.tsx` behind `next/dynamic`, so the widget, RainbowKit and
`agents.css` land in a chunk MiniPay never fetches. That also keeps the page
from throwing there: `MiniPayProviders` mounts no `RainbowKitProvider`, which
the deck's `ConnectButton` and `useConnectModal` both require.

## Server routes

| Route | What it does |
|---|---|
| `POST /api/agent/play-once` | Owner-signed. Verifies via partner channel, then drives rounds through the live resolve route until the match ends. Records the result on the GoodAgent host (best-effort). |
| `GET /api/goodagent/deploys?ownerWallet=` | CORS shim over the host's public deploy list. No credentials attached. Rate-limited. |
| `GET /api/goodagent/deploy/:id/status` | CORS shim over the host's public status. No credentials attached. Rate-limited. |
| `POST /api/goodagent/deploy/:id/control` | `{op: start\|stop}` + owner signature. Verified locally before forwarding to the two allowlisted host endpoints. Rate-limited. |

There is no catch-all proxy. The partner key is only read in
`app/lib/goodagent-server.ts` (server-only) and is only ever sent to the two
partner endpoints (`agents/:id`, `agents/:id/record-match`).

## Auth

Owner actions are signed messages (`app/lib/goodagent-auth.ts`):

```
GoodAgent deploy control
Action: play | resume | pause
Deploy: <deployId>
Issued: <unix ms>
Nonce: <single-use uuid>
```

`app/lib/goodagent-verify.ts` checks owner binding, freshness in both
directions (5 min back, 60 s forward), the signature, and burns the nonce in
Redis (`SET NX`) so a captured request cannot be replayed.

Rate limits come in pairs: a caller-keyed limit before verification (it has to
survive unauthenticated traffic, and it shields the partner host), then the
per-owner budget once the signature has proved who is asking. Keying the owner
budget on the unverified `ownerWallet` in the body would let a stranger spend
it and hold a player's agent offline.

Owner binding (`ownerWallet`) is fetched over the partner-key-authenticated
host route, never the public status endpoint.

## Scoring: the agent board

Agent play never touches the human boards. `trackAgentWallet()` in
`goodagent-server.ts` records the agent's wallet in the registry that
`app/lib/agentTrack.ts` reads, and the resolve route sends a registered
wallet's points to the agent board (`GET /api/agent/leaderboard`) instead of
the casual leaderboard and the daily bounty.

The reason is the bounty: it ranks WALLETS and pays by rank, so an agent
holding a podium slot pushes a real player down a tier and then leaves its own
share unclaimed. The identity-keyed limits (daily reward, one-per-person House
prize) already treat an agent and its owner as one person and need no help.

Only the partner-key-authenticated lookup may declare a wallet an agent — a
request-supplied flag would let a human pick their own board. `play-once`
registers before the first round and returns **503 `AGENT_REGISTRY_UNAVAILABLE`**
rather than playing a match it cannot classify; `control` also registers on
start, best-effort, because autopilot matches are driven by the host on its own
interval and cannot re-enter `play-once` with a single-use signature.

## Agent match orders

`app/lib/agentOrder.ts` builds each round's card order by importing the real
`CARDS` / `CHARACTERS` catalog and `calcEnergyPool` from the live game code.
Nothing about cards, AI, scoring or energy is duplicated.

## Environment

```
GOODAGENT_HOST_URL=https://goodagentids.xyz/host   # server-side
GOODAGENT_PARTNER_API_KEY=…                        # server-side only
```

Without the partner key, the read-only shims still work; play-once and
control refuse to run rather than trust unauthenticated owner data.
