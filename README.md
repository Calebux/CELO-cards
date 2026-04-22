# Action Order

A competitive on-chain 1v1 tactical card combat game built for **Celo MiniPay**. Players construct a 5-move sequence called an **Order** and watch it resolve against their opponent's in cinematic combat — no turns, no clicking during the fight. Pure prediction.

---

## Gameplay

1. **Pick a fighter** — 5 unique characters, each with distinct stats, a passive ability, and a signature ultimate
2. **Build your Order** — arrange 5 cards (Strike / Defense / Control) in a 5-slot sequence within your energy budget
3. **Lock in** — both players submit simultaneously; neither can see the other's order
4. **Watch it resolve** — slots play out one-by-one; knock values determine the round winner
5. **First to win 3 rounds wins the match**

Cards interact on three axes: **priority**, **knock value**, and **type advantage**. Winning requires reading your opponent, not just picking the strongest cards.

---

## Match Types

| Mode | Description |
|---|---|
| **Ranked** | Pay the match fee (cUSD / CELO / G$). Wins earn Points and climb the leaderboard |
| **Wager** | Both players stake tokens. Winner takes 90% of the combined pot |
| **VS House** | Play the AI instantly — Easy / Normal / Hard. No wait, no fee |
| **Tourney** | Weekly bracketed tournament for the top-16 ranked players |

---

## Fighters

| Fighter | Class | Passive | Ultimate |
|---|---|---|---|
| **Kaira** | Vanguard | +2 Knock on slot 1 | Guaranteed crit next slot |
| **Kenji** | Ronin | +2 Knock on priority clash win | Double knock next slot |
| **Riven** | Shadow | Halve damage received on slot 3 | Full dodge next slot |
| **Zane** | Brawler | +2 Knock on every Strike type-win | Drain 3 knock from opponent |
| **Elara** | Void Witch | Drain -1 from opponent after Control win | +5 priority guaranteed first-strike |

---

## Economy

### Match Fees & Wagers
- Entry fee: **0.000007 CELO / cUSD / G$** (optimised for activity volume)
- Dual-wager payout: winner takes **90% of the combined pot**
- G$ winnings are streamed via **Superfluid** over 24 hours

### Points & Ranking
- Ranked wins earn Points; streaks multiply earnings (3+ wins = 1.5×, 5+ = 2×)
- Top 16 by Points at Monday 00:00 UTC qualify for the weekly tournament
- Prize pool streams to #1 player on-chain

### Black Market
- Buy rare, high-power premium cards with **CELO or G$**
- Unlocked cards enter your draw pool permanently

---

## Features

- **Username system** — set a persistent on-chain identity (stored in Redis). Shown in matchmaking, on the leaderboard, and in the wallet chip
- **Real-time ranked matchmaking** — queue system with polling; opponent found → auto-route to match
- **Opponent name display** — when matched, opponent's username is fetched and shown
- **Daily challenges** — complete objectives for bonus Points and G$ rewards (stored in Redis)
- **G$ UBI claim** — GoodDollar daily claim built into the profile page
- **Leaderboard** — casual + ranked tabs, live username resolution (stored in Redis)
- **Achievements** — 8 unlockable milestones tracked server-side via Redis
- **Match history** — full replay data per round stored client-side
- **Adaptive AI** — "VS House" Hard mode uses counter-pick logic to challenge your strategy
- **Sound system** — music + SFX with mute toggle
- **Portrait mode** — automatic canvas scaling for Celo MiniPay; works on any screen size

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Styling | Vanilla CSS-in-JS (inline styles) |
| Wallet | wagmi v2 + RainbowKit (MiniPay / MetaMask / WalletConnect) |
| Chain | Celo mainnet + Alfajores testnet |
| Contract | `KnockOrderArena.sol` — Hardhat + viem |
| State | Zustand (persisted via localStorage) |
| Storage | **Redis (Upstash)** — username registry, matchmaking, leaderboard, achievements, challenges |
| Multiplayer | Next.js API routes + Redis match store |
| Streaming | Superfluid CFAv1Forwarder — G$ payout streams |
| UBI | GoodDollar UBIScheme + Identity contracts |

---

## Getting Started

```bash
npm install --legacy-peer-deps
cp .env.example .env.local   # fill in values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

```bash
# WalletConnect (cloud.walletconnect.com)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Arena contract (deployed on Celo mainnet)
NEXT_PUBLIC_ARENA_ADDRESS=

# Treasury wallet — receives entry fees and Black Market payments
NEXT_PUBLIC_TREASURY_ADDRESS=
TREASURY_PRIVATE_KEY=         # server-side only — never expose

# Redis (Upstash) — usernames, leaderboard, challenges, achievements
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

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
- Events: `MatchEntered`, `MatchCompleted`, `MatchRefunded`

```bash
npx hardhat run scripts/deploy.ts --network celo
npx hardhat verify --network celo <address>
```

---

## API Routes

| Route | Purpose |
|---|---|
| `POST /api/queue` | Join matchmaking queue |
| `GET /api/queue?id=` | Poll queue for a match |
| `DELETE /api/queue?id=` | Leave the queue |
| `POST /api/match/[matchId]` | Register character selection |
| `PATCH /api/match/[matchId]` | Submit card order / register wager TX |
| `GET /api/match/[matchId]` | Poll match phase + resolved slots |
| `POST /api/payout` | Server-side winner payout (CELO / cUSD / G$) |
| `GET /api/leaderboard` | Fetch casual or ranked leaderboard |
| `POST /api/leaderboard` | Record match result + points |
| `GET /api/username` | Lookup username by address |
| `POST /api/username` | Claim / update username |
| `GET /api/challenges` | Fetch daily challenges |
| `POST /api/challenges` | Update challenge progress |
| `GET /api/achievements` | Fetch unlocked achievements |
| `POST /api/achievements` | Sync and unlock achievements |
| `GET /api/online` | Live player count |

---

## Project Structure

```
app/
  api/                    — all server routes (match, queue, payout, leaderboard…)
  black-market/           — premium card shop (CELO / G$ payments)
  cards/                  — card collection gallery
  challenges/             — daily challenge board
  characters/             — character lore and stats
  create/                 — match type selector + ranked queue
  deck/                   — player deck management
  game-action/            — combat visualization logic
  gameplay/               — combat resolution screen
  history/                — match replay log
  join/                   — join by Match ID
  leaderboard/            — casual + ranked boards
  loadout/                — card order builder
  lobby/                  — waiting room + opponent sync
  profile/                — stats, achievements, username edit
  ready/                  — match room share (host)
  select-character/       — character picker
  tournament/             — weekly prize pool + standings
  components/
    WagerModal.tsx        — payment modal (wager + ranked fee modes)
    UsernameModal.tsx     — first-connect username prompt
    WalletSection.tsx     — wallet chip with username + balances
    HowToPlayModal.tsx    — in-game help overlay
    ClaimGDollar.tsx      — G$ UBI daily claim
    PortraitOverlay.tsx   — rotate-device prompt
  lib/
    combatEngine.ts       — round resolution + AI logic
    gameStore.ts          — Zustand game state (persisted)
    gameData.ts           — cards, characters, arena backgrounds
    cusd.ts               — cUSD + CELO contract config
    gooddollar.ts         — G$ + Superfluid config
    arena.ts              — KnockOrderArena ABI + helpers
    redis.ts              — Upstash Redis client
contracts/
  KnockOrderArena.sol     — on-chain match registry + payout
scripts/
  deploy.ts               — contract deployment
```


---

## License

MIT
