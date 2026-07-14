# Web3Auth re-prompting on every page (mobile web only) — FIXED

## What was reported
On mobile browsers (not MiniPay), Web3Auth's sign-in flow was re-triggering
after navigating to almost every page, instead of staying signed in for the
session.

## Root cause
`app/layout.tsx` (the Next.js **root** layout, meant to persist across all
client-side navigation) conditionally wrapped `children` in `<AppProviders>`
based on the current request path (`shouldWrapWithProviders = matchedPath !== "/"`,
added in commit `0ef2d5b` to keep the wallet bundle off the landing page for
Lighthouse). Branching a root layout's output on a per-request header breaks
Next.js's guarantee that the root layout's component tree survives
navigation — so `WagmiProvider` / `WalletSync` / the Web3Auth connector were
being torn down and rebuilt around page changes instead of mounting once.

On mobile, Web3Auth runs in `uxMode: "redirect"` (`app/lib/web3auth.ts:79-81`,
required because popups get blocked). Every remount forced `WalletSync`'s
resume effect (`app/lib/wallet.tsx:69-86`) to re-attempt session resumption;
when that race lost, `connect()` fell through to firing a real redirect-mode
auth flow again — the visible "pop up again" symptom.

This explains why several earlier fixes didn't fully land: `e8806f3 Resume
Web3Auth sessions across routes`, `112fa11 Fix double Web3Auth sign-in
trigger`, `5b66eed Fix mobile auth persistence and modals`, `f199c68 Fix
Web3Auth on mobile: use redirect mode`. All of those patched the resume
logic; none removed the remount trigger itself.

**Explicitly out of scope / untouched:** MiniPay. It never uses Web3Auth
(blocked outright in `web3auth.ts:58-60`) and auto-connects through its own
injected-provider path in `app/minipay-providers.tsx`. Nothing about its
detection or connection logic changed.

## Fix applied (2026-07-08)
Moved every route except the landing page into a Next.js route group,
`app/(app)/`, with its own layout that unconditionally mounts `AppProviders`
once:

- `app/(app)/layout.tsx` (new) — reads the `MiniPay` UA header and mounts
  `AppProviders`, same as before, but with no pathname branching. This layout
  is shared by every route under the group, so Next.js now preserves it
  (and everything inside it — wagmi context, `WalletSync`, the Web3Auth
  instance) across every navigation between those routes.
- `app/layout.tsx` — no longer imports or renders `AppProviders` at all;
  it's back to being a plain, pathname-invariant root shell (`<html>`/`<head>`/`<body>{children}</body>`).
- All 22 route folders (`black-market`, `cards`, `challenges`, `characters`,
  `create`, `deck`, `game-action`, `gameplay`, `history`, `join`,
  `leaderboard`, `loadout`, `lobby`, `ops`, `privacy`, `profile`, `ready`,
  `select-character`, `settings`, `stats`, `terms`, `tournament`, `trade`)
  moved via `git mv` into `app/(app)/` — route groups don't affect the URL,
  so every path (`/create`, `/gameplay`, etc.) resolves identically.
  `app/page.tsx` (the landing page) stays where it is, outside the group,
  with no wallet providers — preserving the original Lighthouse-motivated
  optimization.
- Relative imports inside the moved files (`../lib/...`, `../components/...`,
  including ones inside dynamic `import(...)` calls, not just `from`
  imports) were updated by one extra `../` level to account for the new
  nesting depth.

## Verification
- `npx tsc --noEmit` — clean (only stale `.next/dev/types/validator.ts`
  cache errors referencing pre-move paths, which is gitignored and
  regenerates automatically).
- Fresh `npm run dev` boot: `/`, `/create`, `/gameplay`, `/leaderboard` all
  returned 200 with no runtime errors in the server log.

## Still worth doing
Manually re-test the actual mobile Web3Auth redirect flow on a real device
(sign in on one page, navigate through several others, confirm no re-prompt)
— the fix addresses the structural cause but hasn't been observed end-to-end
on-device yet.
