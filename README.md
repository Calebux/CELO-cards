# Action Order

Action Order is an on-chain 1v1 tactical card fighting game built for Celo MiniPay.
Players pick a fighter, build a 5-card order, and battle through prediction-driven rounds.

---

## Core Gameplay

1. Pick a fighter.
2. Build a 5-card order within your energy budget.
3. Lock in and resolve clashes slot-by-slot.
4. First to win 3 rounds wins the match.

Cards revolve around:
- Priority
- Knock power
- Type interactions (Strike / Defense / Control)

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
