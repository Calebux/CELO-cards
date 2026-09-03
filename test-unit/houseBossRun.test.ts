import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyBossRun,
  houseBossPoints,
  HOUSE_BOSS_POINTS_CLEAN,
  HOUSE_BOSS_POINTS_RETRIED,
  MAX_RUN_LOOKBACK,
  type ChamberFight,
} from "../app/lib/houseBossRun";

// The rule this replaces refused any run with a loss behind it, which meant a
// boss that wins ~96% of the time was effectively unclaimable — the screen said
// COMPLETE and the server said no. What must still be refused is a run played
// below Hard, and a "run" that was never actually five fights.

let n = 0;
const win = (chosenDifficulty = 2): ChamberFight =>
  ({ matchId: `W${++n}`, outcome: "win", chosenDifficulty });
const loss = (): ChamberFight => ({ matchId: `L${++n}`, outcome: "loss", chosenDifficulty: 3 });

test("clean run: four Hard wins behind the finale pays the full award", () => {
  const v = classifyBossRun([win(), win(), win(), win()]);
  assert.deepEqual(v, { qualified: true, clean: true });
  assert.equal(houseBossPoints(true), HOUSE_BOSS_POINTS_CLEAN);
});

test("retried run: losses no longer disqualify, they downgrade", () => {
  // ABM's actual shape: four chamber wins, then the boss beaten on a retry.
  const v = classifyBossRun([loss(), loss(), loss(), loss(), win(3), win(3), win(), win()]);
  assert.deepEqual(v, { qualified: true, clean: false });
  assert.equal(houseBossPoints(false), HOUSE_BOSS_POINTS_RETRIED);
});

test("a single lost fight anywhere in the run counts as a retry", () => {
  const v = classifyBossRun([win(), loss(), win(), win(), win()]);
  assert.equal(v.qualified, true);
  assert.equal(v.qualified && v.clean, false);
});

test("a run below Hard never qualifies, retried or not", () => {
  assert.deepEqual(classifyBossRun([win(2), win(1), win(2), win(2)]), { qualified: false });
  assert.deepEqual(classifyBossRun([win(0), win(0), win(0), win(0)]), { qualified: false });
  // Moderate is still not Hard even when the rest of the run is clean.
  assert.deepEqual(classifyBossRun([win(2), win(2), win(2), win(1)]), { qualified: false });
});

test("fewer than four preceding wins fails closed", () => {
  assert.deepEqual(classifyBossRun([win(), win(), win()]), { qualified: false });
  assert.deepEqual(classifyBossRun([]), { qualified: false });
  // All losses and no run at all.
  assert.deepEqual(classifyBossRun([loss(), loss(), loss()]), { qualified: false });
});

test("a double-recorded match cannot stand in for a missing fight", () => {
  // Three real wins, one of them logged twice by the duplicate-settle bug.
  const dupe: ChamberFight = { matchId: "DUP", outcome: "win", chosenDifficulty: 2 };
  assert.deepEqual(classifyBossRun([dupe, dupe, win(), win()]), { qualified: false });
  // With a genuine fourth win it qualifies.
  assert.equal(classifyBossRun([dupe, dupe, win(), win(), win()]).qualified, true);
});

test("the walk-back is bounded so an older run cannot be borrowed", () => {
  const farBack = [...Array(MAX_RUN_LOOKBACK).fill(null).map(() => loss()), win(), win(), win(), win()];
  assert.deepEqual(classifyBossRun(farBack), { qualified: false });
});

test("higher tiers than Hard are accepted", () => {
  // The chamber escalates its last fights to tier 3 on its own.
  assert.deepEqual(classifyBossRun([win(3), win(3), win(2), win(2)]), { qualified: true, clean: true });
});
