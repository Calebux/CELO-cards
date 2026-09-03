import assert from "node:assert/strict";
import test from "node:test";
import { orderBountyRows, bountyPrizeForRank, BOUNTY_PRIZE_SPLIT_USD } from "../app/lib/bountyConfig";

// The daily cap makes the top of the board tie: 25 flawless Hard wins plus the
// loss allowance is 7,600 and nothing beats it. Three players held exactly that
// on 2026-09-03, so whatever orders a tie is handing out real money.

const row = (address: string, points: number, reachedAt = 0) => ({ address, points, reachedAt });

test("points decide the order before anything else", () => {
  const out = orderBountyRows([row("0xa", 100), row("0xb", 7600), row("0xc", 5000)]);
  assert.deepEqual(out.map((r) => r.points), [7600, 5000, 100]);
});

test("a tie goes to whoever reached the score first", () => {
  const out = orderBountyRows([
    row("0xaaa", 7600, 1_800),
    row("0xbbb", 7600, 1_200),
    row("0xccc", 7600, 1_500),
  ]);
  assert.deepEqual(out.map((r) => r.address), ["0xbbb", "0xccc", "0xaaa"]);
  // And that is what the prize follows.
  assert.equal(bountyPrizeForRank(1), BOUNTY_PRIZE_SPLIT_USD[0]);
});

test("a player with a timestamp outranks one without", () => {
  // Never let missing data beat a player who demonstrably got there.
  const out = orderBountyRows([row("0xaaa", 7600, 0), row("0xbbb", 7600, 9_999)]);
  assert.deepEqual(out.map((r) => r.address), ["0xbbb", "0xaaa"]);
});

test("a tie with no timestamps keeps the order the board already used", () => {
  // Days played before this existed must not be reshuffled: that would move
  // prize money between players after the fact. ZRANGE rev ordered equal
  // scores by member descending, so that is preserved as the last resort.
  const out = orderBountyRows([
    row("0x8dcfb960", 7600),
    row("0xe0bc834a", 7600),
    row("0xbf989a46", 7600),
  ]);
  assert.deepEqual(out.map((r) => r.address), ["0xe0bc834a", "0xbf989a46", "0x8dcfb960"]);
});

test("ranks are positional, so the pool is never overcommitted", () => {
  const tied = orderBountyRows([row("0xa", 7600, 3), row("0xb", 7600, 2), row("0xc", 7600, 1)]);
  const paid = tied.map((_, i) => bountyPrizeForRank(i + 1));
  assert.deepEqual(paid, [...BOUNTY_PRIZE_SPLIT_USD]);
  // Three tied players used to be told rank 1 each — $15 out of a $10 pool.
  const pool = BOUNTY_PRIZE_SPLIT_USD.reduce((a, b) => a + b, 0);
  assert.equal(paid.reduce((a, b) => a + b, 0), pool);
});

test("ordering does not mutate its input", () => {
  const rows = [row("0xa", 1), row("0xb", 2)];
  const copy = [...rows];
  orderBountyRows(rows);
  assert.deepEqual(rows, copy);
});

// ── The dated win allowance ──────────────────────────────────────────────────
// Raised 25 → 30 from 2026-09-04. Dated rather than edited in place: the slot
// array is truncated at write time, so a mid-day raise cannot restore wins the
// old cap already discarded — it would only reward whoever was still playing.

import {
  bountyWinsPerDay,
  BOUNTY_WINS_PER_DAY,
  BOUNTY_WINS_PER_DAY_RAISED,
  BOUNTY_WINS_RAISED_FROM_DAY,
  BOUNTY_MIN_POINTS_TO_WIN,
} from "../app/lib/bountyConfig";

test("days before the raise keep the allowance they were played under", () => {
  assert.equal(bountyWinsPerDay("2026-09-03"), BOUNTY_WINS_PER_DAY);
  assert.equal(bountyWinsPerDay("2026-08-18"), BOUNTY_WINS_PER_DAY);
});

test("the raise applies from its day onward", () => {
  assert.equal(bountyWinsPerDay(BOUNTY_WINS_RAISED_FROM_DAY), BOUNTY_WINS_PER_DAY_RAISED);
  assert.equal(bountyWinsPerDay("2026-09-04"), 30);
  assert.equal(bountyWinsPerDay("2027-01-01"), BOUNTY_WINS_PER_DAY_RAISED);
});

test("the threshold stays winnable under both allowances", () => {
  // A Hard flawless win is 300 and the loss allowance adds 100. The threshold
  // must sit under the ceiling or the campaign cannot be won at all — this is
  // the invariant the config comment insists on.
  const ceiling = (wins: number) => wins * 300 + 100;
  assert.ok(BOUNTY_MIN_POINTS_TO_WIN < ceiling(BOUNTY_WINS_PER_DAY), "25-win day");
  assert.ok(BOUNTY_MIN_POINTS_TO_WIN < ceiling(BOUNTY_WINS_PER_DAY_RAISED), "30-win day");
  assert.equal(ceiling(BOUNTY_WINS_PER_DAY), 7600);
  assert.equal(ceiling(BOUNTY_WINS_PER_DAY_RAISED), 9100);
});

test("the raise only ever loosens the cap", () => {
  assert.ok(BOUNTY_WINS_PER_DAY_RAISED > BOUNTY_WINS_PER_DAY);
});
