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

Owner binding (`ownerWallet`) is fetched over the partner-key-authenticated
host route, never the public status endpoint.

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
