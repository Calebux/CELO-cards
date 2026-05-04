# Action Order

Action Order is an on-chain 1v1 tactical card fighting game built for Celo MiniPay.
Players pick a fighter, build a 5-card order, and battle through prediction-driven rounds.

---

## Core Gameplay

1. Pick a fighter.
2. Build a 5-card order within your energy budget.
3. Attune up to 2 owned cards so the first attuned reveal in a match gets a one-time +1 Priority Surge.
4. Lock in and resolve clashes slot-by-slot.
5. First to win 3 rounds wins the match.

Cards revolve around:
- Priority
- Knock power
- Type interactions (Strike / Defense / Control)

Attunement + Mastery:
- Each player can attune up to 2 owned cards.
- The first attuned card revealed in a match gets a one-time +1 Priority Surge.
- Owned cards track performance stats such as times played, clash wins, total knock, match wins, and best knock.
- Those real match stats drive visible mastery tiers in Loadout, Profile, Black Market, and the card preview modal.
- Normal cards also expose a Forge path. When a card reaches Tier 5, 25 uses, 12 clash wins, and 100 total knock, it becomes Forge Ready in Loadout and the Black Market Forge section.

---

## Modes

- Ranked (Season Pass access)
- Wager PvP
- VS House (AI)
- Tournament/Bounty competition

---

## Main Features

- Multiplayer match hosting and joining
- Character selection + loadout flow
- Ranked and casual leaderboard tracking
- Black Market premium cards
- Black Market forge visibility for normal cards
- Attunement and card mastery system with tracked card performance
- Season Pass support
- Tournament page and standings
- Wallet integration for Celo ecosystem

---

## Tech Stack

- Next.js (App Router)
- TypeScript
- Zustand state management
- wagmi + RainbowKit
- Hardhat + Solidity contract integration
- Redis-backed server state

---

## Getting Started

```bash
npm install --legacy-peer-deps
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

---

## Smart Contract

Core arena contract is in:
- `contracts/KnockOrderArena.sol`

Deployment script:
- `scripts/deploy.ts`

---

## License

MIT
