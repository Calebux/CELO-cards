# Knock Order — Sepolia Deployment Log

This document summarises the full EGS deployment performed on 2026-03-08.

---

## What Was Deployed

| Resource | Address |
|---|---|
| Dojo World | `0x02e3549fc2e07fbf842c3f1b02fbfedcafb7a89dd222030575a2c8c54ea25811` |
| KnockOrderEGS Adapter | `0x7bb764671f492156e92f62959a1c80fe9fabc0d217d3108111d007bb8526b30` |
| EgsAdmin (Dojo contract) | `0x7d7620143ab3ce92ee97a91744e7fb2b40b82c11aebfbd2f7e5a28f5e3855c4` |
| EndMatch (authorised caller) | `0x54effd85515358ec2b35a4a4094248f9a129da1b45c7bd6ff2b596cc2358e6` |

---

## Step-by-Step What Happened

### Step 1 — Dojo World Migration

**Goal:** Deploy the updated Dojo world (with EgsAdmin + EgsConfig model + MatchCounter model) to Sepolia.

**Problems hit and fixed:**

1. **`sozo migrate` panicked** — `dojo_starter-EgsConfig` was listed in `[writers]` in `dojo_sepolia.toml`. Dojo 1.8.x panics when a locally-managed contract is listed as an external grantee. Fix: removed it from `[writers]`.

2. **EgsConfig contract silently skipped by sozo** — The Dojo contract module was named `EgsConfig`, identical to the `EgsConfig` model. Sozo was processing the compiled artifact but not registering it as a deployable contract, presumably due to the name collision. Fix: renamed the contract module from `EgsConfig` to `EgsAdmin` in `egs_config.cairo`.

3. **EgsAdmin missing writer permission** — After renaming and deploying, `set_adapter` failed with `EgsAdmin does NOT have WRITER role on model EgsConfig`. Fix: added `"dojo_starter-EgsAdmin"` to `[writers]` in `dojo_sepolia.toml` and re-ran migrate to sync permissions.

**Commands run:**
```bash
sozo -P sepolia build
sozo -P sepolia migrate   # first run: 8 contracts
# (fix naming conflict → rename to EgsAdmin)
sozo -P sepolia migrate   # second run: deploys EgsAdmin (9th contract)
# (add EgsAdmin to writers)
sozo -P sepolia migrate   # third run: syncs 1 permission
```

**Result:** World fully synced with 9 contracts and all permissions set.

---

### Step 2 — Deploy KnockOrderEGS Adapter

**Goal:** Deploy `KnockOrderEGS` as a standalone Starknet contract (not a Dojo contract).

**Problems hit and fixed:**

1. **starkli account config** — `starkli declare` requires a JSON account config file, not just an address. Created `scripts/make-starkli-account.mjs` to compute the public key from the private key and write the config to `/tmp/starkli_account.json`.

2. **Cartridge RPC incompatibility with starkli** — `https://api.cartridge.gg/x/starknet/sepolia` returns `Invalid block id` for some starkli RPC calls (likely uses non-standard block handling). Switched to `https://rpc.starknet-testnet.lava.build` but that also failed with a JSON format mismatch. Starkli was abandoned.

3. **starknet.js v9 API changes** — The project uses starknet.js v9.4.2. Both `Account` and `Contract` constructors changed from positional arguments to options objects:
   - Old: `new Account(provider, address, privateKey)`
   - New: `new Account({ provider, address, signer: privateKey })`
   - Old: `new Contract(abi, address, account)`
   - New: `new Contract({ abi, address, providerOrAccount: account })`

4. **Missing CASM file** — `account.declare({ contract: sierra })` failed with "provide CASM file or compiledClassHash". Added `casm = true` to `[[target.starknet-contract]]` in `Scarb.toml`, rebuilt, and passed both files to `declare`.

**Script used:** `scripts/deploy-egs-contract.mjs`

**Result:** Class declared and contract deployed at `0x7bb764671f492156e92f62959a1c80fe9fabc0d217d3108111d007bb8526b30`.

---

### Step 3 — EgsAdmin.set_adapter()

**Goal:** Store the adapter address in the Dojo world so `EndMatch` can look it up at runtime.

**Command:**
```bash
sozo execute dojo_starter-EgsAdmin set_adapter \
  0x7bb764671f492156e92f62959a1c80fe9fabc0d217d3108111d007bb8526b30 \
  -P sepolia --wait
```

**TX:** `0x06bba64be73251e633789fed5127bc813602d6431174804085ceb14a644359e8`

**Result:** `EgsConfig` model in world state now holds the adapter address. `EndMatch` reads this at match conclusion to decide whether to call the EGS adapter.

---

### Step 4 — adapter.set_authorized_caller(EndMatch)

**Goal:** Allow only the `EndMatch` contract to call `record_result` on the adapter.

**Script used:** `scripts/set-authorized-caller.mjs`

**TX:** `0x157ec6f3d08732d1581c9299bddae42bd2ea755961cd442339f739d753f3a6d`

**Result:** `EndMatch` (`0x54effd85515358ec2b35a4a4094248f9a129da1b45c7bd6ff2b596cc2358e6`) is the only contract authorised to record EGS scores.

---

## Files Changed

| File | What Changed |
|---|---|
| `knock_order/Scarb.toml` | Added `casm = true` to starknet-contract target |
| `knock_order/dojo_sepolia.toml` | Removed `EgsConfig` from writers; added `EgsAdmin` |
| `knock_order/src/systems/egs_config.cairo` | Renamed module `EgsConfig` → `EgsAdmin` |
| `knock_order/manifest_sepolia.json` | Generated — full deployed world manifest |
| `app/lib/dojo/manifest.json` | Copied from manifest_sepolia.json |
| `scripts/deploy-egs-contract.mjs` | Declares + deploys KnockOrderEGS via starknet.js v9 |
| `scripts/make-starkli-account.mjs` | Creates starkli account config from private key |
| `scripts/set-authorized-caller.mjs` | Calls `set_authorized_caller` on the adapter |

---

## Remaining Manual Steps

### Step 5 — Vercel Environment Variables

Set these in your Vercel project dashboard (Settings → Environment Variables):

```
NEXT_PUBLIC_DOJO_WORLD_ADDRESS=0x02e3549fc2e07fbf842c3f1b02fbfedcafb7a89dd222030575a2c8c54ea25811
NEXT_PUBLIC_EGS_ADAPTER_ADDRESS=0x7bb764671f492156e92f62959a1c80fe9fabc0d217d3108111d007bb8526b30
NEXT_PUBLIC_DOJO_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia
```

Redeploy after setting them.

### Step 6 — Register with Provable Games EGS Registry

See `docs/EGS_INTEGRATION.md` for full details. In short:
- Go to the Provable Games EGS Registry
- Submit your adapter address (`0x7bb764671f...`)
- The registry will call `supports_interface(IMINIGAME_ID)` to verify — the adapter returns `true`
- Once listed, your game appears on EGS-compatible platforms and leaderboards

---

## Architecture After Deployment

```
User plays match
     ↓
EndMatch (Dojo contract)
     ↓ reads EgsConfig model from world state
     ↓ gets adapter address
     ↓
KnockOrderEGS adapter (standalone Starknet contract)
     ↓ record_result(match_id, score)
     ↓ stores score + marks game_over = true
     ↓ emits ScoreUpdate + GameOver events
     ↓
EGS Registry / Platforms read score via IMinigameTokenData interface
```

**Score encoding:** `winner_wins * 100 + loser_wins`
- `200` = 2–0 win
- `201` = 2–1 win
- `302` = 3–2 win (if 3-win matches added later)
