import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// The 1440×823 design reaches a portrait phone by rotating 90°, so "landscape"
// is a transform that must be applied EXACTLY once between the viewport and the
// content. Both halves of that are one-line mistakes nobody notices on a
// desktop browser, and MiniPay review caught both in the same pass:
//
//   applied zero times → the page sits upright while its neighbours are
//     rotated, so walking between them looks like the device is spinning.
//     That was /lobby, sitting between /ready and /gameplay.
//   applied twice → the content lands upside down at a squared scale. That was
//     the share card, which scaled itself while already inside the gameplay
//     canvas.
//
// Neither shows up in a typecheck or a build, so they are asserted here.

const APP = join(process.cwd(), "app");

/** Pages that legitimately render upright, and why. */
const NO_FRAME_EXPECTED: Record<string, string> = {
  "(app)/challenges/page.tsx": "redirect() only — renders nothing",
  "(app)/ops/page.tsx": "internal ops dashboard, never in the player flow",
  "(app)/stats/page.tsx": "internal, opened in a new tab from the profile",
  "(app)/privacy/page.tsx": "document, opened in a new tab",
  "(app)/terms/page.tsx": "document, opened in a new tab",
  "(app)/agents/page.tsx": "web-only lane, gated out of the MiniPay bundle",
};

/**
 * Does this file, or a component it hands straight off to, carry the frame?
 *
 * A page is often a thin server component that delegates to a client one
 * (`page.tsx` -> `PublicProfileClient.tsx`), and the frame lives in the child.
 * Following one level of local import is what keeps that from reading as a bug
 * — and is also how a genuinely unframed page would try to hide.
 */
function carriesFrame(file: string, src: string, depth = 1): boolean {
  // data-ao-frame is the one universal marker. Pages reach the transform three
  // different ways — the shared hook, the pre-paint --ao-tr variable, or a
  // hand-rolled scale() that assigns style.transform directly — and the marker
  // is what all three must carry, because it is what tells a nested frame to
  // stand down.
  if (src.includes("data-ao-frame")) return true;
  if (depth <= 0) return false;

  for (const m of src.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    for (const ext of [".tsx", "/index.tsx"]) {
      const target = resolve(dirname(file), m[1] + ext);
      try {
        if (carriesFrame(target, readFileSync(target, "utf8"), depth - 1)) return true;
      } catch {
        // Not a local .tsx module — a lib import, or an extension we do not follow.
      }
    }
  }
  return false;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

const pages = walk(APP).map((f) => {
  const src = readFileSync(f, "utf8");
  return { rel: f.slice(APP.length + 1), src, framed: carriesFrame(f, src) };
});

test("gameFrame: every player-facing page renders through the frame", () => {
  assert.ok(pages.length > 15, `expected to find the app's pages, found ${pages.length}`);

  const unframed: string[] = [];
  for (const { rel, framed } of pages) {
    if (!framed && !(rel in NO_FRAME_EXPECTED)) unframed.push(rel);
  }

  assert.deepEqual(
    unframed,
    [],
    `these pages render upright while the rest of the game is rotated — give them ` +
      `useGameFrameScale, or add them to NO_FRAME_EXPECTED with a reason:\n  ${unframed.join("\n  ")}`,
  );
});

test("gameFrame: exemptions stay honest", () => {
  // An exemption that silently starts carrying a frame, or names a page that no
  // longer exists, is a stale reason nobody will re-check.
  for (const [rel, reason] of Object.entries(NO_FRAME_EXPECTED)) {
    const page = pages.find((p) => p.rel === rel);
    assert.ok(page, `NO_FRAME_EXPECTED names ${rel}, which no longer exists (${reason})`);
    assert.equal(page.framed, false, `${rel} now carries a frame — drop it from NO_FRAME_EXPECTED`);
  }
});

test("gameFrame: every frame marks itself so nested frames can skip", () => {
  // useGameFrameScale decides whether to transform by looking for an ancestor
  // marked data-ao-frame. A frame that forgets the marker is invisible to that
  // check, so any framed modal rendered inside it doubles the transform — the
  // share card bug. The marker must be in the markup, not set from the effect:
  // child effects run before parent effects, so a parent-written marker would
  // not exist yet when the child looks for it.
  const offenders: string[] = [];
  for (const dir of [APP]) {
    for (const file of walkAll(dir)) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("ref={wrapRef}")) continue;
      const refs = src.split("ref={wrapRef}").length - 1;
      const marks = src.split("data-ao-frame").length - 1;
      if (marks < refs) offenders.push(`${file.slice(APP.length + 1)} (${refs} frames, ${marks} marked)`);
    }
  }
  assert.deepEqual(offenders, [], `unmarked frames:\n  ${offenders.join("\n  ")}`);
});

function walkAll(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkAll(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}
