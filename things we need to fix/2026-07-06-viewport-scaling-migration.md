# Viewport scale/rotate migration — finish moving screens onto useGameFrameScale

## Why this matters

`app/lib/mobile.ts` exposes `useGameFrameScale(wrapRef, options)`, which
handles the fixed-1440x823-design-rotated-to-fit-portrait-phones transform
in one place — it listens to `window` resize/orientationchange AND
`visualViewport` resize/scroll, which the hand-rolled copies mostly do not.

Five components were already migrated onto it in the last pass
(`HouseWinnerModal`, `ShareCard`, `SoundSettings`, `TutorialModal`,
`WagerModal`). But a repo-wide scan shows **12 more files still carry their
own copy-pasted version of the same isPortrait/translate/rotate/scale math**,
each slightly divergent in what events it listens to. That's exactly the
brittleness called out in review: any future fix to the scaling logic (a new
edge case, a Dynamic Island/notch adjustment, a MiniPay webview quirk) has to
be manually re-applied to every one of these, and it's easy to miss one —
which is how the original duplication happened in the first place.

A guardrail script now exists to catch regressions:
`scripts/audit-viewport-scaling.mjs` — run `node scripts/audit-viewport-scaling.mjs`.
It scans `app/` for the `isPortrait = vh > vw` pattern outside
`app/lib/mobile.ts` and exits 1 if it finds an unreviewed copy. Wire it into
CI once the migration below is done, so the count can't silently creep back up.

## Files still needing migration (12)

Each of these has its own `isPortrait = vh > vw` + `translate(...) rotate(90deg) scale(...)`
block that should be replaced with a `wrapRef` + `useGameFrameScale(wrapRef)`
call, same pattern as the already-migrated components.

| File | Line (isPortrait check) |
|---|---|
| `app/page.tsx` | 94 |
| `app/ready/page.tsx` | 48 |
| `app/trade/page.tsx` | 46 |
| `app/loadout/page.tsx` | 353 |
| `app/components/SeasonPassModal.tsx` | 121 |
| `app/components/UsernameModal.tsx` | 38 |
| `app/components/CardPreviewModal.tsx` | 664 |
| `app/profile/page.tsx` | 304 |
| `app/profile/[address]/PublicProfileClient.tsx` | 76 |
| `app/gameplay/page.tsx` | 385 |
| `app/select-character/page.tsx` | 82 |
| `app/create/page.tsx` | 168 |

**Migration steps per file** (mirrors what was already done to `WagerModal.tsx` etc.):
1. Import `useGameFrameScale` from `../lib/mobile` (adjust relative path).
2. Delete the local `useEffect`/`useLayoutEffect` that computes `isPortrait`,
   builds the `transform` string, and manually wires
   `resize`/`orientationchange` listeners.
3. Call `useGameFrameScale(wrapRef)` (pass `{ enabled }` if the effect was
   conditionally gated, e.g. only running while a modal is open — check the
   original `if (!el || !show) return;` guards).
4. If the file used `onCompactChange`-style logic (checking for a
   `compactThreshold` breakpoint) baked into the same effect, pass it through
   the hook's `onCompactChange` option instead of keeping a second effect.
5. Confirm no other code still reads a local `isPortrait` variable that was
   being set as a side effect of the deleted logic — some of these files may
   use `isPortrait` for more than the transform (e.g. conditional layout),
   in which case keep computing it separately via a small shared helper
   rather than re-deriving it from the hook (the hook only writes to the DOM
   directly, it doesn't expose the boolean).
6. Re-run `node scripts/audit-viewport-scaling.mjs` — the file should drop
   out of the offender list.

`gameplay/page.tsx`, `select-character/page.tsx`, and `create/page.tsx` are
the highest-traffic screens in the app (every match goes through them) —
prioritize those three first since they're the most likely to actually be
hit by a viewport edge case in production, and test them on a real device
after migrating, not just the simulator.

## Reviewed exceptions — do NOT migrate these

- **`app/layout.tsx`** — the transform math is duplicated in a raw inline
  `<script>` tag that runs before React hydrates, specifically to avoid a
  first-paint flash while JS parses on slow mobile connections. A React hook
  cannot run before hydration, so this one is structurally exempt. Left as
  the sole intentional duplicate; if the transform math ever changes, this
  inline script must be updated to match by hand.
- **`app/components/GameLoadingScreen.tsx`** — rotates to landscape using raw
  `vw`/`vh` sizing without fitting to the `DESIGN_W`/`DESIGN_H` frame, because
  it's a full-bleed loading overlay that doesn't need to align with the game
  canvas underneath — it just needs to face the same direction. Different
  problem, correctly solved differently.

Both are already whitelisted in `scripts/audit-viewport-scaling.mjs`'s
`ALLOWED` set so the audit script won't flag them.
