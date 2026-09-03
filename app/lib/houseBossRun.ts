// House Boss run verification: did this win end a real five-fight chamber run,
// and was it won outright or ground out on retries?
//
// Kept out of the route so the rules can be tested directly against a match
// list rather than through Redis and the activity log.
//
// The route used to answer only the first question, using "the four matches
// before the finale were all wins" as its proxy. That proxy was aimed at
// difficulty — an Easy run's final fight is stored identically to a Hard one,
// so the tier had to be read off the fights leading in. What it actually
// caught was RETRIES: the boss wins roughly 96% of the time and the client
// lets you rematch it, so almost every genuine kill has losses sitting right
// behind it. Players were told COMPLETE on screen, offered the prize, and then
// refused by the server — and the prize was close to unclaimable.
//
// Retrying the boss does not make a run easier. It is the same tier-3 opponent
// every attempt. So a retry no longer disqualifies; it earns the smaller award
// and no reward code.

/** A run is five fights: four chamber opponents, then the mirror-match boss. */
export const CHAMBER_FIGHTS = 5;

/** Beat the boss with no losses anywhere in the run. Carries the reward. */
export const HOUSE_BOSS_POINTS_CLEAN = 5000;
/** Beat the boss after losing at least once. Points only, no reward. */
export const HOUSE_BOSS_POINTS_RETRIED = 2000;

/**
 * How far back to look for the run's four wins. Bounded so a string of losses
 * cannot walk the search into an unrelated earlier run.
 */
export const MAX_RUN_LOOKBACK = 40;

export type ChamberFight = {
  matchId: string;
  outcome: "win" | "loss";
  /** The tier the player SELECTED, not the escalated value the AI played at. */
  chosenDifficulty?: number;
};

export type RunVerdict =
  /** Not a completed chamber run, or some fight in it was below Hard. */
  | { qualified: false }
  /** A real run. `clean` means it was won without a single loss. */
  | { qualified: true; clean: boolean };

/**
 * Consecutive entries sharing a matchId are the same match recorded twice.
 *
 * The resolve route had no idempotency guard, so a double-submitted final round
 * scored — and logged — the match twice. Counting those as separate fights
 * would let three wins look like four.
 */
function dedupeByMatchId(fights: readonly ChamberFight[]): ChamberFight[] {
  const seen = new Set<string>();
  const out: ChamberFight[] = [];
  for (const f of fights) {
    if (seen.has(f.matchId)) continue;
    seen.add(f.matchId);
    out.push(f);
  }
  return out;
}

/**
 * Classify the run leading into a finale.
 *
 * `earlier` is the player's own matches from strictly before the finale,
 * newest first.
 *
 * Fails CLOSED on a short history: the activity log is a rolling window shared
 * by every player, so a genuine run's opening fights can age out. Rejecting is
 * the safe answer — a manual review can still pay it — and paying on a guess
 * cannot be taken back.
 */
export function classifyBossRun(earlier: readonly ChamberFight[]): RunVerdict {
  const fights = dedupeByMatchId(earlier).slice(0, MAX_RUN_LOOKBACK);

  let wins = 0;
  let sawLoss = false;

  for (const fight of fights) {
    if (fight.outcome === "loss") {
      // A retry, not a disqualifier. It costs the reward, not the run.
      sawLoss = true;
      continue;
    }
    // Every fight of the run itself must have been chosen at Hard or above.
    // This is the check the whole walk-back exists for.
    if ((fight.chosenDifficulty ?? -1) < 2) return { qualified: false };
    if (++wins >= CHAMBER_FIGHTS - 1) return { qualified: true, clean: !sawLoss };
  }

  return { qualified: false };
}

/** Points a qualifying run is worth. */
export function houseBossPoints(clean: boolean): number {
  return clean ? HOUSE_BOSS_POINTS_CLEAN : HOUSE_BOSS_POINTS_RETRIED;
}
