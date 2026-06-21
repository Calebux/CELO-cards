# Action Order

Action Order is an on-chain 1v1 tactical card fighting game built for Celo MiniPay.
Players pick a fighter, build a 5-card order, and battle through prediction-driven rounds.

---

## Core Gameplay

1. Pick a fighter from the character roster.
2. Build a 5-card order within your energy budget.
3. Attune up to 2 owned cards so the first attuned reveal in a match gets a one-time +1 Priority Surge.
4. Lock in and resolve clashes slot-by-slot.
5. First to win 3 rounds wins the match.

Cards revolve around:
- **Priority** — determines which card resolves first in a clash
- **Knock power** — damage dealt when your card wins the slot
- **Type interactions** — Strike / Defense / Control triangle

---

## Modes

- **Ranked** — Season Pass required, earns season points toward the leaderboard
- **Wager PvP** — stake USDT, cUSD, or CELO; winner takes the pot minus a 10% platform fee
- **VS House (AI)** — fight the house AI without needing an opponent online
- **Tournament / Bounty** — bracket competitions funded from a dedicated prize pool

---

## Characters

Five fighters are available at launch, each with a unique portrait, idle animation, taunt pool, and ultimate ability:

| Fighter | Style |
|---------|-------|
| Kaira | Agile striker, speed-focused ultimate |
| Kenji | Balanced veteran, counter-heavy kit |
| Riven | Aggressive brawler, high knock output |
| Zane | Control specialist, disruption ultimate |
| Elara | Defensive anchor, sustained pressure |

---

## Features

### Match Flow
- Multiplayer match hosting and joining with on-chain entry registration
- VS loading screen builds anticipation before each match starts
- Slot-by-slot clash resolution with cinematic overlay and arena background
- Match state stored in Redis — disconnected players can resume from the last saved round
- Portrait mode overlay blocks gameplay until the device is in landscape

### Character System
- Per-character ultimate abilities triggered once per match from the HUD
- Randomised taunt lines fire on round win, round loss, and ultimate activation

### Card System
- Attunement — attune up to 2 owned cards; first attuned reveal gets a one-time +1 Priority Surge
- Mastery tiers — cards track times played, clash wins, total knock, match wins, and best knock
- Mastery tier badges visible in Loadout, Profile, Black Market, and card preview modal
- Forge path — normal cards that reach Tier 5 (25 uses, 12 clash wins, 100 total knock) become Forge Ready
- Season Special card editions with premium cinematic artwork

### Economy & Payments
- Wager escrow handled on-chain by the arena contract
- Multi-token support: USDT, cUSD, and native CELO
- Contextual deposit deeplink shown when wallet balance is insufficient
- Payout route is idempotency-locked via Redis to prevent double-pays
- Per-wallet rate limiting on all sensitive API routes (429 with Retry-After header)

### Progression & Social
- Ranked leaderboard backed by Redis sorted sets, updated in near real-time
- Season Pass on-chain ownership check gates ranked mode
- Username registration tied to wallet address with live availability check
- Player profile page — match history, season points, owned cards, attunement state (server-rendered)
- Daily reward claim with Redis TTL reset at midnight UTC
- Referral links with server-side attribution tracking

### Onboarding
- MiniPay auto-connect with injection retry loop for WebView timing
- RainbowKit multi-wallet support for desktop and non-MiniPay mobile (MetaMask, Coinbase Wallet, WalletConnect)
- Automatic chain switch prompt to Celo mainnet (chain ID 42220)
- Streamlined onboarding flow for users arriving from GoodDollar

### Auth & Security
- EIP-712 typed data signatures (`eth_signTypedData_v4`) for all card attunement updates
- Signature verified server-side via `recoverTypedDataAddress` — no bypass paths
- Redis-backed nonce system with TTL prevents replay attacks

### Audio
- Singleton sound manager for background music and sound effects
- Persistent mute preference stored in localStorage
- Mute togglable from any screen without interrupting match state

### Performance
- Service worker precaches static assets and audio on install with versioned cache busting
- Character portraits and arena backgrounds served as optimised WebP
- Next.js Image component used throughout with explicit dimensions to prevent CLS

---

## Tech Stack

- **Next.js 14** (App Router, standalone output)
- **TypeScript** (strict)
- **Tailwind CSS**
- **Zustand** — client state management
- **wagmi + viem** — wallet connection and on-chain reads/writes
- **RainbowKit** — web wallet modal
- **Redis (Upstash)** — match state, leaderboard, rate limiting, nonce store
- **Solidity + Foundry** — smart contract development and deployment
- **Service Worker** — static asset precaching

---

## Smart Contracts

| Contract | Purpose |
|----------|---------|
| `contracts/KnockOrderArena.sol` | Match registration, wager escrow, winner resolution |
| `contracts/SeasonPassRegistry.sol` | Season Pass ownership tracking (ERC-721) |

**Deployed on Celo mainnet.**

---

## Getting Started

```bash
npm install --legacy-peer-deps
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

---

## License

MIT
