# Provable Games EGS Integration

Knock Order implements the [Embeddable Game Standard (EGS)](https://docs.provable.games/embeddable-game-standard) by Provable Games. This allows any EGS-compatible platform to query Knock Order match results, display live scores, and include the game in cross-platform leaderboards — without any custom integration code on the platform's side.

---

## What EGS Is

EGS is an open protocol for composable, provable on-chain games on Starknet. It defines a single Cairo interface (`IMinigameTokenData`) that game contracts must implement to expose their score and game-over state to the outside world. Once a game registers with the EGS Registry, platforms like Denshokan can automatically discover and index it.

---

## How It Fits Knock Order

Each on-chain match in Knock Order maps directly to an EGS game session:

| EGS Concept | Knock Order Equivalent |
|---|---|
| `token_id` | `match_id` (u64 cast to felt252) |
| `score(token_id)` | `winner_wins * 100 + loser_wins` |
| `game_over(token_id)` | `match_state == MatchState::MatchEnd` |
| Platform callback | `MatchEnded` event + cross-contract call |

### Score Encoding

Score is encoded as `winner_wins * 100 + loser_wins`, making it human-readable and sortable on leaderboards:

| Result | Score |
|---|---|
| 2-0 (best-of-3) | 200 |
| 2-1 (best-of-3) | 201 |
| 3-0 (best-of-5) | 300 |
| 3-1 (best-of-5) | 301 |
| 3-2 (best-of-5) | 302 |

Higher score = cleaner win.

---

## Cairo Contracts

### `src/interfaces/IMinigameTokenData.cairo`

Defines the two EGS constants and the two interfaces needed for compliance, **inlined directly** — no dependency on the `game_components` library.

Why inlined? The `game_components` library targets `starknet = "2.15.1"` but Knock Order's Dojo world targets `starknet = "2.13.1"`. Adding the library as a Scarb dependency would create a version conflict. Since the interface is small and stable, copying it avoids the problem entirely.

Contains:
- `IMINIGAME_ID` — the SNIP-5 interface ID EGS platforms check via `supports_interface()`
- `ISRC5_ID` — the standard SRC5 introspection interface ID
- `IMinigameTokenData` trait — `score()`, `game_over()`, and their batch variants
- `ISRC5` trait — `supports_interface()`

---

### `src/systems/egs_adapter.cairo` — `KnockOrderEGS`

A **standalone `#[starknet::contract]`** (not a Dojo contract). It is deployed separately from the Dojo world and acts as the public EGS-facing surface of the game.

**Why not a Dojo contract?**
Dojo contracts use the `#[dojo::contract]` macro which controls the constructor. OpenZeppelin's `SRC5Component` needs to register interfaces in the constructor. Rather than fight the macro, `KnockOrderEGS` is a plain Starknet contract that inlines SRC5 with a simple `Map<felt252, bool>` — no OpenZeppelin dependency needed.

**Storage:**
```
scores:       Map<felt252, u64>   // EGS score per match_id
game_overs:   Map<felt252, bool>  // finalisation flag per match_id
supported_interfaces: Map<felt252, bool>  // inline SRC5
owner:        ContractAddress     // deployer
authorized_caller: ContractAddress // the EndMatch Dojo system
```

**Constructor:**
Registers both `ISRC5_ID` and `IMINIGAME_ID` in the `supported_interfaces` map so any platform can call `supports_interface()` and confirm EGS compliance on-chain.

**`record_result(match_id, score)`:**
Called by the authorized EndMatch contract (or owner) to push a finalized match result. Asserts the result has not already been recorded, writes score and `game_over = true`, then emits `ScoreUpdate` and `GameOver` events.

**`set_authorized_caller(caller)`:**
Owner-only. Called once after deployment to authorize the EndMatch Dojo system contract address.

---

### `src/systems/egs_config.cairo` — `EgsConfig` Dojo System

A **Dojo contract** that stores the deployed `KnockOrderEGS` adapter address inside the Dojo world state via the `EgsConfig` model (singleton, key = 0).

This is how `EndMatch` discovers the adapter address at runtime — it reads `EgsConfig` from world storage rather than having the address hardcoded.

Only the Dojo world owner can call `set_adapter()`.

---

### `src/systems/end_match.cairo` (modified)

After the match is finalized and `MatchEnded` is emitted, `EndMatch` now:

1. Reads `EgsConfig` from the world.
2. If `adapter_address != zero`, computes the EGS score:
   ```cairo
   let winner_wins = wins_needed;
   let loser_wins = player_a_wins + player_b_wins - wins_needed;
   let egs_score = winner_wins.into() * 100_u64 + loser_wins.into();
   ```
3. Calls `adapter.record_result(match_id.into(), egs_score)` via the `IEgsAdapterDispatcher`.

If no adapter is configured, this block is skipped entirely — the game works normally without EGS.

---

### `src/models.cairo` (modified)

Added the `EgsConfig` singleton model:

```cairo
#[dojo::model]
pub struct EgsConfig {
    #[key]
    pub id: u8,  // always 0
    pub adapter_address: ContractAddress,
}
```

---

## Frontend

### `app/lib/dojo/egs.ts`

Frontend integration layer with two exports:

**`useEgsScore(matchId)`**
React hook that polls the `KnockOrderEGS` adapter every 10 seconds via direct RPC call (`provider.callContract`). Calls both `score(token_id)` and `game_over(token_id)` in parallel. Stops polling once `game_over = true`. Returns `null` for solo (non-numeric) match IDs or when the adapter is not configured.

**`decodeEgsScore(score)`**
Utility that converts the encoded integer back to a human-readable string. `201 → "2-1"`, `302 → "3-2"`, `0 → "—"`.

**`EGS_ADAPTER_ADDRESS`**
Read from `NEXT_PUBLIC_EGS_ADAPTER_ADDRESS` env var. Empty string = EGS features hidden.

**`@provable-games/denshokan-sdk`**
Installed (`npm i @provable-games/denshokan-sdk`). No starknet version conflict — the project already uses `starknet ^9.4.2` and the SDK requires `starknet >=9.0.0`. The SDK is ready to use for cross-game leaderboard queries once the contract is registered with the EGS Registry.

---

### `app/ready/page.tsx` (modified)

Shows a small EGS status badge below the match ID for on-chain matches. Two states:

- **During play** — `🔒 EGS Tracked` (blue, polling)
- **After finalisation** — `✅ EGS Verified · 2-1` (green, score decoded)

The badge is hidden for solo (non-numeric) match IDs and when `NEXT_PUBLIC_EGS_ADAPTER_ADDRESS` is not set.

---

## Deployment Checklist

After the next `sozo migrate`, follow these steps to activate EGS:

1. **Build and migrate the Dojo world**
   ```bash
   cd knock_order
   scarb build && sozo migrate
   ```

2. **Deploy the EGS adapter as a separate Starknet contract**
   ```bash
   starknet deploy --contract KnockOrderEGS --constructor-calldata <your_address>
   # note the deployed adapter address
   ```

3. **Register the adapter address in the Dojo world**
   ```bash
   sozo execute EgsConfig set_adapter --calldata <adapter_address>
   ```

4. **Authorise the EndMatch system to call the adapter**
   ```bash
   starknet invoke --address <adapter_address> \
     --function set_authorized_caller \
     --calldata <EndMatch_contract_address>
   ```

5. **Set the env var in Vercel**
   ```
   NEXT_PUBLIC_EGS_ADAPTER_ADDRESS = <adapter_address>
   ```

6. **Register with Provable Games**
   Follow the [EGS registration guide](https://docs.provable.games/embeddable-game-standard) to list Knock Order in the EGS Registry. Once registered, any EGS platform (Denshokan, etc.) will automatically discover and index the game's match results.
