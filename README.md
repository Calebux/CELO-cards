# Knock Order

Competitive tactical card combat game (5-slot Orders, Strike/Defense/Control). Built with Next.js and optional on-chain play via Dojo (Starknet).

## Run the app

```bash
npm install --legacy-peer-deps
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy Dojo contract & integrate

1. **Deploy the world** from `knock_order/`:
   - Create `knock_order/.env.sepolia` (RPC URL, account address, private key), then run `./migrate.sh`.
   - The script copies the generated manifest to `app/lib/dojo/manifest.json` so the frontend uses the deployed world.

2. **Optional:** Set `NEXT_PUBLIC_DOJO_WORLD_ADDRESS` and `NEXT_PUBLIC_DOJO_RPC_URL` in `.env.local` to override (see `.env.example`).

3. **On-chain integration:**
   - **Create / Join:** Create Match (opponent address) and Join (match ID) are wired; match ID comes from the create tx or is entered on the Join page.
   - **Lock moves:** When you lock your 5-slot order on the Loadout screen, the frontend calls `lock_moves` on-chain if you have a numeric match ID and wallet connected (card IDs are mapped in `app/lib/dojo/cardIds.ts`).
   - **Resolve / End:** When a round or match ends (round-result or match-end screen), the app calls `resolve_round` then `end_round` on-chain; if the match is over it also calls `end_match`. Full PvP: both players lock, then resolution and end-round/end-match run on-chain.
   - **Init cards (one-time):** After first deploy, run `./scripts/init-cards.sh` to seed default move cards (loads `knock_order/.env.sepolia` and runs `init_default_cards`).

4. **EGS (Provable Games) deployment (optional):** To deploy the Dojo world and the KnockOrderEGS adapter, wire the adapter into the world, and authorize EndMatch to push results:
   - Run `./scripts/deploy-egs.sh` from the repo root (requires sozo, scarb, sncast; uses `knock_order/.env.sepolia`).
   - Then set `NEXT_PUBLIC_EGS_ADAPTER_ADDRESS` in Vercel (and in `.env.local` for local) and register with the [Provable Games EGS Registry](https://docs.provable.games/embeddable-game-standard). See [docs/EGS_DEPLOY.md](docs/EGS_DEPLOY.md).
# Action-order
