# EGS deployment and registration

This doc covers steps **5** and **6** after running the full EGS deploy script: setting the adapter address in Vercel and registering with the Provable Games EGS ecosystem.

## 5. Set `NEXT_PUBLIC_EGS_ADAPTER_ADDRESS` in Vercel

After `./scripts/deploy-egs.sh` completes, it prints the deployed **adapter address**. Use it in Vercel so the frontend can read score and game-over state from the EGS adapter.

1. Open your Vercel project → **Settings** → **Environment Variables**.
2. Add:
   - **Name:** `NEXT_PUBLIC_EGS_ADAPTER_ADDRESS`
   - **Value:** the adapter address (e.g. `0x...`) from the script output.
   - **Environments:** Production (and Preview if you use the same chain).
3. Save and redeploy so the new variable is applied.

For local development, set the same variable in `.env.local` (see `.env.example`).

## 6. Register with Provable Games EGS Registry

To have Knock Order appear on EGS platforms (tournaments, quests, leaderboards, etc.), register your game with the EGS ecosystem.

- **EGS overview and concepts:**  
  [Embeddable Game Standard – Provable Games](https://docs.provable.games/embeddable-game-standard)
- **Building a game (IMinigameTokenData, etc.):**  
  [Building a Game](https://docs.provable.games/embeddable-game-standard/building-a-game)
- **Game registry (Cairo / Dojo):**  
  [Provable-Games/game-registry](https://github.com/Provable-Games/game-registry)
- **Denshokan (registry, indexer, API):**  
  [Provable-Games/denshokan](https://github.com/Provable-Games/denshokan)

What to do in practice:

1. **Confirm your adapter is EGS-compliant**  
   Knock Order’s `KnockOrderEGS` contract implements `IMinigameTokenData` (score, game_over, etc.) and is deployed and wired as in `scripts/deploy-egs.sh`.

2. **Use Provable Games tooling to register**  
   Registration is done via the Provable Games ecosystem (e.g. Denshokan registry or their docs/discord). Follow the current instructions at:
   - [Provable Games docs](https://docs.provable.games/)
   - [EGS presentation](https://provable.games/decks/egs/index.html)

3. **Optional: denshokan-sdk**  
   For leaderboards and real-time updates, use the [denshokan-sdk](https://docs.provable.games/embeddable-game-standard/frontend) (TypeScript/React). The frontend already uses `NEXT_PUBLIC_EGS_ADAPTER_ADDRESS` for direct RPC reads; you can add SDK-based queries when you connect to a Denshokan indexer/API.

Once registered, your game can be discovered and embedded by EGS platforms.
