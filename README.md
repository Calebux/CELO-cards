# Action Order

Action Order is an on-chain 1v1 tactical card fighting game built for Celo MiniPay.
Players pick a fighter, build a 5-card order, and battle through prediction-driven rounds.

---

## Core Gameplay

1. Pick a fighter.
2. Build a 5-card order within your energy budget.
3. Set 1 owned Signature Card for a one-time +1 Priority Surge the first time it appears in a match.
4. Lock in and resolve clashes slot-by-slot.
5. First to win 3 rounds wins the match.

Cards revolve around:
- Priority
- Knock power
- Type interactions (Strike / Defense / Control)

Signature Cards:
- Each player can mark 1 owned card as their Signature Card.
- The first time that card appears in a match, it gets a one-time +1 Priority Surge.
- Owned cards also track performance stats such as times played, clash wins, total knock, match wins, and best knock.

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
- Signature Card system with tracked card performance
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
