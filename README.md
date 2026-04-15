# Action Order

A competitive 1v1 tactical card combat game built for **Celo MiniPay**. Players construct a 5-move sequence called an Order and watch it resolve against their opponent's in cinematic combat — no turns, no clicking during the fight. Pure prediction.

---

## Gameplay

1. **Pick a character** — each fighter has unique stats that affect knock calculations
2. **Build your Order** — arrange 5 cards (Strike / Defense / Control) in a 5-slot sequence
3. **Lock in** — both players submit simultaneously; neither can see the other's order
4. **Watch it resolve** — slots play out one-by-one; knock values determine the round winner
5. **Best of rounds wins the match**

Cards interact on three axes: priority, knock value, and type advantage. Winning requires reading your opponent, not just picking the strongest cards.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS v4 |
| Wallet | wagmi v2 + RainbowKit (MiniPay / MetaMask) |
| Chain | Celo mainnet + Alfajores testnet |
| Contract | `KnockOrderArena.sol` — Hardhat + viem |
| State | Zustand |
| Multiplayer | Server-side in-memory match store (Next.js API routes) |
| Agent bot | Node.js + viem (14-wallet rotation) |

---

## Getting Started

```bash
npm install --legacy-peer-deps
cp .env.example .env.local   # fill in values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

```bash
# WalletConnect (cloud.walletconnect.com)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Arena contract (deployed on Celo mainnet)
NEXT_PUBLIC_ARENA_ADDRESS=

# Treasury wallet — receives entry fees, pays out winners
NEXT_PUBLIC_TREASURY_ADDRESS=
TREASURY_PRIVATE_KEY=         # server-side only, never expose

# Bot wallets (auto-generated on first run if omitted)
BOT_WALLET_1_KEY=
# ... up to BOT_WALLET_14_KEY
```

---

## Smart Contract

**`KnockOrderArena.sol`** — deployed on Celo mainnet.

- `enterMatch(matchId)` — enter with cUSD (ERC-20 approval required)
- `enterMatchWithCelo(matchId)` — enter with native CELO
- `completeMatch(matchId, winner)` — called server-side; pays out winner
- Entry fee: **0.000007 CELO/cUSD** (optimised for activity volume)
- Events: `MatchEntered`, `MatchCompleted`, `MatchRefunded`

Deploy / verify:
```bash
npx hardhat run scripts/deploy.ts --network celo
npx hardhat verify --network celo <address>
```

---

## Multiplayer

Matches are coordinated through stateless API routes:

| Route | Purpose |
|---|---|
| `POST /api/match/[matchId]` | Register character selection |
| `PATCH /api/match/[matchId]` | Submit card order for a round |
| `GET /api/match/[matchId]` | Poll match phase / resolved slots |
| `DELETE /api/match/[matchId]` | Clean up finished match |

Both players lock their order independently. The server resolves the round and returns results from each player's perspective when both orders are in. Match state lives in memory — a server restart clears active matches.

---

## Agent Bot

Runs 14 wallets in parallel, each continuously entering and completing matches on-chain to generate activity.

```bash
npm run bot
```

- Auto-generates and saves wallet keys to `.env.local` on first run
- Funds wallets from a treasury wallet when balance drops below 0.015 CELO
- Random game duration (3–9 min) and cooldown (1–3 min) per wallet
- Stops automatically when treasury falls below 0.05 CELO
- Crash recovery with exponential backoff (up to 10 restarts)

Requires `TREASURY_PRIVATE_KEY` and `NEXT_PUBLIC_ARENA_ADDRESS` in `.env.local`.

---

## Project Structure

```
app/
  api/match/[matchId]/   — multiplayer sync routes
  api/payout/            — server-side winner payout
  gameplay/              — combat resolution screen
  loadout/               — card order builder
  lobby/                 — waiting room + opponent sync
  select-character/      — character picker
  lib/
    combatEngine.ts      — round resolution logic
    gameStore.ts         — Zustand game state
    gameData.ts          — cards, characters, types
contracts/
  KnockOrderArena.sol    — on-chain match registry
scripts/
  agent-bot.mjs          — 14-wallet activity bot
  deploy.ts              — contract deployment
```
