# QA Checklist

Legend: ✅ Pass | ❌ Fail | ⏳ Not yet tested | N/A Not applicable

---

## 1. MiniPay wallet connection

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 1.1 | Open app URL in MiniPay WebView | Auto-connects, no wallet modal shown | ⏳ | |
| 1.2 | Cold-start WebView (provider injected with delay) | App retries and connects within ~12 s | ⏳ | |
| 1.3 | Connected address is shown in profile / nav | Address matches MiniPay wallet | ⏳ | |
| 1.4 | Reload WebView mid-session | Reconnects automatically | ⏳ | |

---

## 2. MiniPay wager payment (USDT)

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 2.1 | Create wager match as host | USDT selected automatically, MiniPay USDT transfer popup appears | ⏳ | |
| 2.2 | Wager TX confirmed on Celo mainnet | Match state shows `hostWagered: true` | ⏳ | tx hash: |
| 2.3 | Join wager match as joiner (MiniPay) | USDT transfer popup for same amount | ⏳ | tx hash: |
| 2.4 | Currency mismatch (second player picks different token) | Server returns "same token required" error | ⏳ | |
| 2.5 | Insufficient USDT balance | User sees error + deposit deeplink | ⏳ | |

---

## 3. Payout

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 3.1 | Winner claims payout | Treasury sends USDT, txHash returned | ⏳ | tx hash: |
| 3.2 | Loser attempts to claim same match | 403 "Only the match winner can claim" | ⏳ | |
| 3.3 | Claim same match twice | 200 with `cached: true`, no second TX | ⏳ | |
| 3.4 | Claim without signature (non-MiniPay path) | 401 "Invalid signature" | ⏳ | |
| 3.5 | Claim with `isMiniPay: true` but wrong address | 403 "Only the match winner can claim" | ⏳ | verifies server-side winner check still holds |

---

## 4. Card attunement (EIP-712 auth)

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 4.1 | Attune a card from MiniPay | `eth_signTypedData_v4` popup appears, attunement saved | ⏳ | |
| 4.2 | Attune a card from standard browser wallet | EIP-712 typed-data prompt appears, attunement saved | ⏳ | |
| 4.3 | POST `/api/card-progress` with no signature | 400 "Valid signature required" | ⏳ | |
| 4.4 | POST with valid address but forged/wrong signature | 401 "Wallet signature does not match" | ⏳ | |
| 4.5 | POST with valid signature for different address | 401 "Wallet signature does not match" | ⏳ | |
| 4.6 | Nonce expires (wait > 300 s), then submit | 410 "Auth request expired" | ⏳ | |
| 4.7 | Attune > 2 cards | Client blocks at limit; server rejects with 400 | ⏳ | |

---

## 5. Ranked match / season pass

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 5.1 | Season pass holder enters ranked match | Treasury pays entry, `hostWagerTx` set on match | ⏳ | tx hash: |
| 5.2 | Duplicate season-pass entry (retry / double-tap) | Idempotent: same txHash returned, no second TX | ⏳ | |
| 5.3 | Expired season pass attempts entry | 403 "Season pass expired" | ⏳ | |
| 5.4 | Non-pass-holder calls `/api/season-pass/enter` | 403 "No active season pass" | ⏳ | |

---

## 6. Match flow

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 6.1 | Host creates match, joiner joins via lobby | Both reach character select | ⏳ | |
| 6.2 | Both players submit cards for round | Round resolves, slots returned | ⏳ | |
| 6.3 | One player submits, other reconnects within grace window (30 s) | Round waits, then resolves | ⏳ | |
| 6.4 | One player quits mid-match | Opponent sees "aborted" state | ⏳ | |
| 6.5 | Match goes to 3 rounds won | `completedAt` and `winnerAddress` set | ⏳ | |
| 6.6 | Leaderboard updated after ranked match end | Points visible on leaderboard within 10 s | ⏳ | |

---

## 7. Mobile / MiniPay layout

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 7.1 | Gameplay screen on 390 px viewport (iPhone) | No overflow, all cards tappable | ⏳ | device: |
| 7.2 | Gameplay screen on 360 px viewport (Android) | No overflow, all cards tappable | ⏳ | device: |
| 7.3 | Wager modal on MiniPay | Fits screen, confirm button visible without scroll | ⏳ | |
| 7.4 | Loadout screen on MiniPay | Cards render, no clipping | ⏳ | |
| 7.5 | Portrait overlay shown when device is portrait | Rotate prompt appears | ⏳ | |

---

## 8. Rate limits and idempotency

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 8.1 | 6 payout requests from same address within 60 s | 6th returns 429 | ⏳ | |
| 8.2 | Concurrent payout requests for same matchId | One succeeds, second returns 409 "already in progress" | ⏳ | |
| 8.3 | 11 season-pass entry requests within 60 s | 11th returns 429 | ⏳ | |
