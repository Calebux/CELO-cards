import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRound, type RoundOptions } from "../app/lib/combatEngine";
import { CHARACTERS, type Card } from "../app/lib/gameData";
import { withMatchLock } from "../app/lib/matchLock";
import {
  slotBindingViolation,
  MATCH_ACTION_TYPED_DOMAIN,
  MATCH_ACTION_TYPED_TYPES,
  buildMatchActionTypedMessage,
  buildMatchActionIntent,
  verifyMatchActionSignature,
} from "../app/lib/matchAuth";
import { privateKeyToAccount } from "viem/accounts";
import { computeOrderCommit, verifyOrderReveal } from "../app/lib/commitReveal";
import { newCommitSalt } from "../app/lib/commitRevealClient";
import {
  TREASURY_ADDRESS,
  TREASURY_MINIPAY_ADDRESS,
  receivingTreasuryFor,
  treasurySelfPurchaseViolation,
} from "../app/lib/cusd";
import {
  BOUNTY_MIN_POINTS_TO_WIN,
  BOUNTY_PARTICIPATION_POOL_USD,
  BOUNTY_POOL_USD,
  BOUNTY_PAUSED_FROM_DAY,
  BOUNTY_PRIZE_SPLIT_USD,
  BOUNTY_RESUMES_ON_DAY,
  BOUNTY_TOP_N,
  bountyDayUTC,
  bountyIsFinalPayingDay,
  bountyPausedOn,
  bountyPrizeForRank,
  isBountyDayClosed,
  isBountyExcluded,
  bountyParticipationRecipients,
  bountyParticipationShareUsd,
  bossWinIsUncapped,
  bestWinPointsTotal,
  HOUSE_LOSS_POINTS_PER_DAY,
  HOUSE_WINS_COUNTED_PER_DAY,
  meetsBountyThreshold,
  usdToGdollar,
} from "../app/lib/bounty";
import { effectiveAiDifficulty, houseMatchPoints, resolveAiDifficulty } from "../app/lib/houseDifficulty";
import { classifyAuthError } from "../app/lib/authTelemetry";
import { friendlyTxError, isGoogleUnreachable } from "../app/lib/txErrors";
import { retryWeb3AuthAuthorization } from "../app/lib/web3authResume";
import { buildBountyClaimAuthMessage } from "../app/lib/treasuryAuth";

// Neutral character for both sides — Riven has no slot-level passive in the
// engine, so results reflect the cards/ults only. Same char both sides cancels
// the tiny priorityStat fraction in the priority comparison.
const RIVEN = CHARACTERS.find((c) => c.id === "riven")!;

let cid = 0;
function card(o: Partial<Card>): Card {
  return {
    id: `c${cid++}`, name: "T", type: "strike", priority: 10, knock: 10,
    energyCost: 1, effect: "", color: "#fff", bgColor: "#000", image: "", ...o,
  };
}
function five(first: Card): Card[] {
  return [first, card({}), card({}), card({}), card({})];
}
const origRandom = Math.random;
function withRandom<T>(v: number, fn: () => T): T {
  Math.random = () => v;
  try { return fn(); } finally { Math.random = origRandom; }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── M-05: Kaira's guaranteed crit must cap at 2×, not stack to 4× ─────────────
test("M-05: guaranteed_crit does not stack with a random crit (caps at 2x)", () => {
  const player = five(card({ type: "strike", priority: 90, knock: 20 })); // wins slot 0 on priority
  const opp = five(card({ type: "strike", priority: 10, knock: 20 }));
  const opts: RoundOptions = { playerUltimateEffect: "guaranteed_crit", playerUltimateSlot: 0 };

  const withRandomCrit = withRandom(0, () => resolveRound(player, opp, RIVEN, RIVEN, opts));    // forces a random crit
  const noRandomCrit = withRandom(0.99, () => resolveRound(player, opp, RIVEN, RIVEN, opts));   // no random crit, ult only

  // Both are 2×. If the cap were broken, the forced-crit run would be 4×.
  assert.equal(withRandomCrit.slots[0].playerKnock, noRandomCrit.slots[0].playerKnock);
});

// ── M-05: the round is won by TOTAL knock, not slot count ─────────────────────
test("M-05: round winner is decided by total knock, not slots won", () => {
  const player = five(card({ type: "strike", priority: 90, knock: 300 })); // one huge slot win
  const opp = [
    card({ type: "strike", priority: 10, knock: 5 }),   // player wins this slot big
    card({ type: "strike", priority: 90, knock: 5 }),   // opponent wins slots 1-4 small
    card({ type: "strike", priority: 90, knock: 5 }),
    card({ type: "strike", priority: 90, knock: 5 }),
    card({ type: "strike", priority: 90, knock: 5 }),
  ];
  const r = withRandom(0.99, () => resolveRound(player, opp, RIVEN, RIVEN, {}));

  const playerSlots = r.slots.filter((s) => s.winner === "player").length;
  assert.ok(playerSlots < 3, `player should win a minority of slots, won ${playerSlots}`);
  assert.ok(r.totalPlayerKnock > r.totalOpponentKnock, "player should have more total knock");
  assert.equal(r.roundWinner, "player");
});

// ── M-05: Elara's priority_surge grants priority (first-strike), not +5 knock ─
test("M-05: priority_surge wins the clash on priority, adds no bonus knock", () => {
  // Same type, player is behind on priority by 2 with equal knock (3).
  const player = five(card({ type: "strike", priority: 10, knock: 3 }));
  const opp = five(card({ type: "strike", priority: 12, knock: 3 }));
  const opts: RoundOptions = { playerUltimateEffect: "priority_surge", playerUltimateSlot: 0 };

  const r = withRandom(0.99, () => resolveRound(player, opp, RIVEN, RIVEN, opts));

  // +5 priority (10→15 > 12) flips the winner to the player, who takes full card
  // knock (3). The old "+5 knock" behavior would instead give a losing player 1+5=6.
  assert.equal(r.slots[0].winner, "player");
  assert.equal(r.slots[0].playerKnock, 3);
});

// ── H-09: per-match lock enforces mutual exclusion — critical sections of
// concurrent writers to the SAME match never overlap ─────────────────────────
test("H-09: concurrent writers to one match never run at the same time", async () => {
  const matchId = `test-lock-${Date.now()}`;
  let active = 0;
  let maxActive = 0;
  const work = async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await sleep(400);
    active--;
    return "OK";
  };
  const onBusy = () => "BUSY";

  await Promise.all([
    withMatchLock(matchId, work, onBusy),
    withMatchLock(matchId, work, onBusy),
    withMatchLock(matchId, work, onBusy),
  ]);

  // If the lock held, only one critical section ever ran at once.
  assert.equal(maxActive, 1);
});

// Sanity: two DIFFERENT matches are independent and may run concurrently.
test("H-09: different matches are not blocked by each other", async () => {
  let active = 0;
  let maxActive = 0;
  const work = async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await sleep(400);
    active--;
    return "OK";
  };
  const onBusy = () => "BUSY";

  await Promise.all([
    withMatchLock(`test-lock-a-${Date.now()}`, work, onBusy),
    withMatchLock(`test-lock-b-${Date.now()}`, work, onBusy),
  ]);

  assert.equal(maxActive, 2); // independent locks → real concurrency
});

// ── C-01: immutable role binding — a slot's wallet can't be reassigned ────────
test("C-01: wager slot bound to one wallet rejects a different wallet", () => {
  const A = "0x1111111111111111111111111111111111111111";
  const B = "0x2222222222222222222222222222222222222222";
  // Bound to A, someone tries to register B → violation.
  assert.equal(slotBindingViolation({ mode: "wager", boundAddress: A, incomingAddress: B }), true);
  // Same wallet (any case) → fine.
  assert.equal(slotBindingViolation({ mode: "wager", boundAddress: A, incomingAddress: A.toUpperCase() }), false);
  // First bind (slot empty) → fine.
  assert.equal(slotBindingViolation({ mode: "wager", boundAddress: undefined, incomingAddress: A }), false);
});

test("C-01: binding is not enforced on casual until MATCH_AUTH_REQUIRED", () => {
  const A = "0x1111111111111111111111111111111111111111";
  const B = "0x2222222222222222222222222222222222222222";
  // Casual + flag off → not enforced (current behavior unchanged).
  assert.equal(slotBindingViolation({ mode: "casual", boundAddress: A, incomingAddress: B, authRequired: false }), false);
  // Any mode once auth is required → enforced.
  assert.equal(slotBindingViolation({ mode: "casual", boundAddress: A, incomingAddress: B, authRequired: true }), true);
});

// ── C-01/H-08: commit-reveal — a reveal must match the commit exactly ─────────
test("commit-reveal: a correct reveal verifies; tampering does not", () => {
  const order = ["fire", "bite", "headbutt", "jaw_breaker", "go_to_hell"];
  const salt = "s0m3-r4nd0m-salt-value";
  const commit = computeOrderCommit(order, salt);

  assert.match(commit, /^0x[0-9a-f]{64}$/);
  assert.equal(computeOrderCommit(order, salt), commit); // deterministic
  assert.equal(verifyOrderReveal(order, salt, commit), true); // correct reveal

  // Any tampering fails:
  assert.equal(verifyOrderReveal(["bite", "fire", "headbutt", "jaw_breaker", "go_to_hell"], salt, commit), false); // reordered
  assert.equal(verifyOrderReveal(["fire", "bite", "headbutt", "jaw_breaker", "halo_shield"], salt, commit), false); // card swapped
  assert.equal(verifyOrderReveal(order, "different-salt", commit), false); // wrong salt
  assert.equal(verifyOrderReveal(order, "short", commit), false); // salt too short
  assert.equal(verifyOrderReveal(order, salt, "0xdeadbeef"), false); // malformed commit
});

// Two players can't collide: different orders/salts give different commits, so
// one can't be reused for the other.
test("commit-reveal: distinct orders/salts produce distinct commits", () => {
  const c1 = computeOrderCommit(["fire", "bite"], "salt-aaaaaaaa");
  const c2 = computeOrderCommit(["bite", "fire"], "salt-aaaaaaaa");
  const c3 = computeOrderCommit(["fire", "bite"], "salt-bbbbbbbb");
  assert.notEqual(c1, c2);
  assert.notEqual(c1, c3);
});

// ── C-01: the readable EIP-712 match-action signature signs + verifies e2e, and
// its human-readable `intent` binds the sensitive payload (no blind bytes32) ────
test("match-action signature: readable typed data signs and verifies; tampering fails", async () => {
  const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const issuedAt = 1_700_000_000_000;
  const params = {
    wallet: account.address,
    matchId: "match-abc",
    role: "host" as const,
    action: "wager" as const,
    payload: { wagerCurrency: "usdt", wagerTx: "0xabc1230000000000000000000000000000000000000000000000000000000def" },
    issuedAt,
  };

  // The wallet would render this exact sentence — not an opaque hash.
  assert.match(buildMatchActionIntent(params.action, undefined, params.payload), /^Register wager stake in USDT · tx 0x/);

  const signature = await account.signTypedData({
    domain: MATCH_ACTION_TYPED_DOMAIN,
    types: MATCH_ACTION_TYPED_TYPES,
    primaryType: "MatchAction",
    message: buildMatchActionTypedMessage(params),
  });

  // Correct signer + identical payload → verifies.
  assert.equal(await verifyMatchActionSignature({ ...params, signature, now: issuedAt }), true);

  // Swapping the currency changes the intent the server rebuilds → verify fails
  // (proves the readable string still binds the sensitive payload).
  assert.equal(
    await verifyMatchActionSignature({ ...params, payload: { wagerCurrency: "usdc", wagerTx: params.payload.wagerTx }, signature, now: issuedAt }),
    false,
  );

  // Different action for the same signature → fails.
  assert.equal(await verifyMatchActionSignature({ ...params, action: "quit", signature, now: issuedAt }), false);
});

// ── C-01/H-08: the CLIENT commit the server VERIFIES must agree end-to-end ─────
test("commit-reveal: a client salt + commit verifies on the server", () => {
  const order = ["fire", "bite", "headbutt", "jaw_breaker", "go_to_hell"];
  const salt = newCommitSalt();

  // Salt is opaque enough: 32 hex chars, above the server's 8-char floor.
  assert.match(salt, /^[0-9a-f]{32}$/);
  assert.notEqual(newCommitSalt(), newCommitSalt()); // not constant

  // What the client sends as `commit` is exactly what the server recomputes on reveal.
  const commit = computeOrderCommit(order, salt);
  assert.equal(verifyOrderReveal(order, salt, commit), true);
});

// ── Black market: the treasury can't buy from itself ──────────────────────────
// A self-send (from === to) satisfies the route's on-chain check at zero cost,
// so the buyer is rejected up front when it is the receiving treasury.
test("black market: buyer that is the receiving treasury is rejected", () => {
  // CELO and G$ settle to the main treasury.
  assert.equal(treasurySelfPurchaseViolation(TREASURY_ADDRESS, "celo"), true);
  assert.equal(treasurySelfPurchaseViolation(TREASURY_ADDRESS, "gdollar"), true);
  // The MiniPay stablecoins settle to the MiniPay treasury.
  assert.equal(treasurySelfPurchaseViolation(TREASURY_MINIPAY_ADDRESS, "usdt"), true);
  assert.equal(treasurySelfPurchaseViolation(TREASURY_MINIPAY_ADDRESS, "usdc"), true);
  assert.equal(treasurySelfPurchaseViolation(TREASURY_MINIPAY_ADDRESS, "cusd"), true);
});

test("black market: an ordinary buyer is never blocked", () => {
  const player = "0x1111111111111111111111111111111111111111";
  for (const currency of ["celo", "gdollar", "usdt", "usdc", "cusd"] as const) {
    assert.equal(treasurySelfPurchaseViolation(player, currency), false);
  }
  // Checksummed/mixed case must still match — addresses are compared lowercased.
  assert.equal(treasurySelfPurchaseViolation(TREASURY_ADDRESS.toUpperCase(), "celo"), true);
  assert.equal(treasurySelfPurchaseViolation(TREASURY_ADDRESS.toLowerCase(), "celo"), true);
  // Missing buyer is not a violation — the route rejects it as an invalid address first.
  assert.equal(treasurySelfPurchaseViolation(undefined, "celo"), false);
  assert.equal(treasurySelfPurchaseViolation(null, "celo"), false);
});

// ── Auth telemetry: mislabelled failures send you debugging the wrong thing ──
test("auth telemetry: a plan rejection is not reported as a network fault", () => {
  // Requesting a sessionTime the Base plan disallows failed as error 1003 and
  // reached users as "can't fetch Google API" — the word "fetch" made it look
  // like connectivity when the fix was in the Web3Auth dashboard.
  assert.equal(classifyAuthError(new Error("Could not fetch project config: subscription error 1003")), "subscription");
  assert.equal(classifyAuthError(new Error("error 1003")), "subscription");
  assert.equal(classifyAuthError(new Error("unauthorized client")), "subscription");

  // Genuine connectivity still classifies as network.
  assert.equal(classifyAuthError(new Error("Failed to fetch")), "network");
  assert.equal(classifyAuthError(new Error("Loading chunk 42 failed")), "network");

  // googleapis.com being unreachable is its own failure: MetaMask still works,
  // and the user can sign in with email — so it must not hide inside "network".
  assert.equal(classifyAuthError(new Error("failed to connect to googleapis.com")), "google-unreachable");
  assert.equal(classifyAuthError(new Error("Failed to fetch https://www.googleapis.com/oauth2/v3/userinfo")), "google-unreachable");
  assert.equal(isGoogleUnreachable(new Error("failed to connect to googleapis.com")), true);
  // Nested causes count — SDK errors usually wrap the original.
  assert.equal(isGoogleUnreachable({ message: "connect failed", cause: new Error("googleapis.com unreachable") }), true);
  assert.equal(isGoogleUnreachable(new Error("Failed to fetch")), false);

  // The user-facing text names the working alternative rather than just failing.
  assert.match(friendlyTxError(new Error("failed to connect to googleapis.com"), "x"), /Email/);

  // Other buckets are unaffected.
  assert.equal(classifyAuthError(new Error("Web3Auth init timeout")), "init-timeout");
  assert.equal(classifyAuthError(new Error("User rejected the request")), "user-cancelled");
  assert.equal(classifyAuthError(new Error("popup blocked by browser")), "popup-blocked");
  assert.equal(classifyAuthError(new Error("")), "unknown");
});

// ── The resume must never race a live sign-in ────────────────────────────────
// The session hint is written before the login opens, so mid-sign-in the app
// looks exactly like a returning redirect. A resume starting there issues a
// second connect on top of the OAuth token exchange — the googleapis.com step —
// which is why Google logins broke while MetaMask (sub-second) kept working.
test("resume: polling stops as soon as an interactive sign-in starts", async () => {
  let checks = 0;
  let signingIn = false;
  const authorized = await retryWeb3AuthAuthorization(
    async () => {
      checks++;
      if (checks === 2) signingIn = true; // user taps SIGN IN mid-poll
      return false;
    },
    { attempts: 10, delayMs: 0, shouldAbort: () => signingIn },
  );

  assert.equal(authorized, false);
  // It must give up almost immediately, not run all 10 attempts alongside them.
  assert.ok(checks <= 2, `expected the poll to abort, ran ${checks} checks`);
});

test("resume: a sign-in already in flight stops the poll before it starts", async () => {
  let checks = 0;
  const authorized = await retryWeb3AuthAuthorization(
    async () => { checks++; return true; },
    { attempts: 10, delayMs: 0, shouldAbort: () => true },
  );

  assert.equal(authorized, false);
  assert.equal(checks, 0); // never even queried
});

test("resume: with no sign-in in progress it still polls through a transient false", async () => {
  // The behaviour the poll exists for must survive the abort guard: Modal v10
  // reports false briefly after init() while the redirect session rehydrates.
  let checks = 0;
  const authorized = await retryWeb3AuthAuthorization(
    async () => { checks++; return checks >= 3; },
    { attempts: 10, delayMs: 0 },
  );

  assert.equal(authorized, true);
  assert.equal(checks, 3);
});

// ── Bounty caps: bound farming without punishing weak players ────────────────
test("bounty: the daily allowance is spent by wins, not by losing", () => {
  // Counting losses against it meant a 22%-win-rate player burned all ten slots
  // on defeats worth 10 points each and could never reach the 500 threshold —
  // the bounty locked out exactly the players it exists to attract.
  assert.equal(HOUSE_WINS_COUNTED_PER_DAY, 10);

  // A struggling player can still get there: defeats never eat their win slots,
  // and loss points top up alongside. Asserted as a property rather than a
  // fixed number, so tuning the threshold cannot silently make the bounty
  // unwinnable — raising it to 1500 would need 10 of the 10 available wins.
  const winsNeeded = Math.ceil((BOUNTY_MIN_POINTS_TO_WIN - HOUSE_LOSS_POINTS_PER_DAY) / 150);
  assert.ok(
    winsNeeded <= HOUSE_WINS_COUNTED_PER_DAY,
    `threshold needs ${winsNeeded} moderate wins but only ${HOUSE_WINS_COUNTED_PER_DAY} count per day`,
  );
  // And it should leave headroom rather than demanding a perfect day.
  assert.ok(winsNeeded <= HOUSE_WINS_COUNTED_PER_DAY - 2, "threshold leaves no margin for a bad round");
});

test("bounty: losing on purpose cannot be farmed", () => {
  // Losses no longer consume the win allowance, so they need their own ceiling
  // or defeat becomes an unlimited source of points.
  assert.equal(HOUSE_LOSS_POINTS_PER_DAY, 100);
  // Losses alone must never reach the threshold, however many are played.
  assert.ok(HOUSE_LOSS_POINTS_PER_DAY < BOUNTY_MIN_POINTS_TO_WIN);

  // And the whole day is bounded: max wins at the best rate, plus the loss cap.
  const maxHouse = HOUSE_WINS_COUNTED_PER_DAY * 300 + HOUSE_LOSS_POINTS_PER_DAY; // 300 = hard + flawless
  assert.equal(maxHouse, 3100);
});

// ── VS House difficulty: the player gets the tier they picked ────────────────
test("house: winning does not silently promote a player to Hard", () => {
  // A two-match win streak used to force difficulty 2 whatever the player had
  // selected, so Easy and Moderate stopped being easy exactly when someone
  // started winning — and the reward stayed pinned to the chosen tier, so it
  // was a harder opponent for the same points.
  for (const chosen of [0, 1, 2] as const) {
    assert.equal(
      resolveAiDifficulty({ chosen, upperChamberActive: false, upperChamberRound: 0 }),
      chosen,
      `chosen ${chosen} should be honoured`,
    );
  }
});

test("house: an Easy-only day cannot reach the bounty threshold", () => {
  // Easy is practice. The best possible Easy day is ten flawless wins plus the
  // whole loss allowance, and that must still fall short of qualifying —
  // otherwise the tier with the highest win rate is also the cheapest route to
  // the prize pool.
  const bestEasyWin = houseMatchPoints({ won: true, flawless: true, rewardDifficulty: 0 });
  const perfectEasyDay = bestEasyWin * HOUSE_WINS_COUNTED_PER_DAY + HOUSE_LOSS_POINTS_PER_DAY;
  assert.ok(
    perfectEasyDay < BOUNTY_MIN_POINTS_TO_WIN,
    `a flawless Easy day scores ${perfectEasyDay}, which qualifies at ${BOUNTY_MIN_POINTS_TO_WIN}`,
  );

  // Moderate remains a real route in, so the bounty is not Hard-only.
  const bestModerateDay =
    houseMatchPoints({ won: true, flawless: true, rewardDifficulty: 1 }) * HOUSE_WINS_COUNTED_PER_DAY;
  assert.ok(bestModerateDay > BOUNTY_MIN_POINTS_TO_WIN);
});

test("bounty: the BEST ten wins score, not the first ten", () => {
  // Ten Easy wins then four Hard wins. Counting the first ten scored 1300 and
  // threw the Hard wins away, so a player who warmed up on Easy and then moved
  // up was punished for improving. The best ten must displace the weak ones.
  const easyThenHard = [100, 150, 150, 150, 150, 100, 100, 150, 150, 100, 200, 200, 200, 300];
  assert.equal(bestWinPointsTotal(easyThenHard), 300 + 200 + 200 + 200 + 150 * 6);

  // Order must not matter — the same day's matches score the same however they
  // are played.
  const shuffled = [...easyThenHard].reverse();
  assert.equal(bestWinPointsTotal(shuffled), bestWinPointsTotal(easyThenHard));

  // Under ten wins, everything counts.
  assert.equal(bestWinPointsTotal([200, 100, 150]), 450);
  assert.equal(bestWinPointsTotal([]), 0);

  // Never more than ten, however much is played.
  assert.equal(bestWinPointsTotal(new Array(50).fill(300)), 3000);
});

test("bounty: House Boss wins are exempt from the daily win allowance", () => {
  // A run is five fights and each spends a win slot, so ten wins is two runs.
  // The boss is fights 4 and 5, so a clear reliably lands past the cap — which
  // is how a genuine House Boss win scored zero points.
  assert.equal(bossWinIsUncapped(3, "2026-08-09"), true);
  assert.equal(bossWinIsUncapped(3, "2026-09-01"), true);

  // Only the boss tier. Easy/Moderate/Hard volume stays capped, which is what
  // stops a season pass turning into unlimited points.
  assert.equal(bossWinIsUncapped(0, "2026-09-01"), false);
  assert.equal(bossWinIsUncapped(1, "2026-09-01"), false);
  assert.equal(bossWinIsUncapped(2, "2026-09-01"), false);
  assert.equal(bossWinIsUncapped(undefined, "2026-09-01"), false);

  // Never retroactive: days that already closed keep the rules they were played
  // under, so settled standings and anything already claimed stay fixed.
  assert.equal(bossWinIsUncapped(3, "2026-08-08"), false);
  assert.equal(bossWinIsUncapped(3, "2026-07-31"), false);
});

test("house: only the Boss finale exceeds the chosen difficulty", () => {
  // The finale is meant to be hard and the player opted into it.
  assert.equal(resolveAiDifficulty({ chosen: 0, upperChamberActive: true, upperChamberRound: 3 }), 3);
  assert.equal(resolveAiDifficulty({ chosen: 1, upperChamberActive: true, upperChamberRound: 4 }), 3);
  // Earlier chamber rounds still play at the selected tier.
  assert.equal(resolveAiDifficulty({ chosen: 0, upperChamberActive: true, upperChamberRound: 0 }), 0);
  assert.equal(resolveAiDifficulty({ chosen: 1, upperChamberActive: true, upperChamberRound: 2 }), 1);
  // And the chamber flag alone changes nothing.
  assert.equal(resolveAiDifficulty({ chosen: 1, upperChamberActive: false, upperChamberRound: 9 }), 1);
});

// ── VS House difficulty: the reward must reflect the match actually played ───
test("house: switching to hard on the winning round cannot buy the hard reward", () => {
  // The exploit: play the match on easy, send hard on the round that wins it.
  // Reward is paid on the pinned starting difficulty, so it stays an easy win.
  const startedOnEasy = houseMatchPoints({ won: true, flawless: false, rewardDifficulty: 0 });
  const honestHard = houseMatchPoints({ won: true, flawless: false, rewardDifficulty: 2 });
  assert.equal(startedOnEasy, 50); // Easy is 0.5x — a practice tier
  assert.equal(honestHard, 200);
  assert.ok(honestHard > startedOnEasy);
});

test("house: the AI can be escalated mid-match but never eased", () => {
  // Upper chamber and win streaks legitimately raise difficulty mid-match, and
  // a harder opponent is never an exploit — so upward is honoured.
  assert.equal(effectiveAiDifficulty(1, 3), 3);
  assert.equal(effectiveAiDifficulty(0, 2), 2);
  // Downward is ignored: a hard match can't be quietly softened round by round.
  assert.equal(effectiveAiDifficulty(2, 0), 2);
  assert.equal(effectiveAiDifficulty(2, 1), 2);
  // Junk input falls back to the pinned value rather than easing the match.
  assert.equal(effectiveAiDifficulty(2, undefined), 2);
  assert.equal(effectiveAiDifficulty(2, "nonsense"), 2);
  assert.equal(effectiveAiDifficulty(1, -5), 1);
  assert.equal(effectiveAiDifficulty(1, 99), 3); // clamped to the top tier
});

test("house: harder difficulty pays strictly more, and losing is unaffected", () => {
  const points = ([0, 1, 2, 3] as const).map((d) =>
    houseMatchPoints({ won: true, flawless: false, rewardDifficulty: d }),
  );
  for (let i = 1; i < points.length; i++) assert.ok(points[i] > points[i - 1]);

  // Flawless scales with difficulty too, so it stays worth chasing on hard.
  assert.ok(
    houseMatchPoints({ won: true, flawless: true, rewardDifficulty: 2 }) >
      houseMatchPoints({ won: true, flawless: true, rewardDifficulty: 0 }),
  );

  // A loss pays participation only — difficulty must not multiply it, or
  // losing on hard would out-earn winning on easy.
  for (const d of [0, 1, 2, 3] as const) {
    assert.equal(houseMatchPoints({ won: false, flawless: false, rewardDifficulty: d }), 10);
  }
});

// ── Bounty pause: the window is closed, and it never moves backwards ─────────
test("bounty pause: paused days pay nothing, earlier days keep their prize", () => {
  const dayBefore = bountyDayUTC(Date.parse(`${BOUNTY_PAUSED_FROM_DAY}T00:00:00Z`) - 24 * 60 * 60 * 1000);

  // The whole point of a window rather than a boolean: a day played before the
  // pause was played for money and must stay claimable forever.
  assert.equal(bountyPausedOn(dayBefore), false);
  assert.equal(bountyPausedOn("2026-01-01"), false);
  // The first paused day, and everything after it while the window is open.
  assert.equal(bountyPausedOn(BOUNTY_PAUSED_FROM_DAY), true);

  if (BOUNTY_RESUMES_ON_DAY) {
    // Once a resume day is set, it and everything after it pays again, and the
    // days inside the window stay unpaid rather than becoming claimable at once.
    assert.equal(bountyPausedOn(BOUNTY_RESUMES_ON_DAY), false);
    assert.ok(BOUNTY_RESUMES_ON_DAY > BOUNTY_PAUSED_FROM_DAY);
    const lastPaused = bountyDayUTC(Date.parse(`${BOUNTY_RESUMES_ON_DAY}T00:00:00Z`) - 24 * 60 * 60 * 1000);
    assert.equal(bountyPausedOn(lastPaused), true);
  } else {
    // Open-ended pause: no future day pays.
    assert.equal(bountyPausedOn("2099-01-01"), true);
  }
});

test("bounty pause: the final paying day is the one before the window", () => {
  // Drives the "last paying day" warning, so players are told before the prize
  // stops rather than finding out from an empty prize column.
  const dayBefore = bountyDayUTC(Date.parse(`${BOUNTY_PAUSED_FROM_DAY}T00:00:00Z`) - 24 * 60 * 60 * 1000);
  assert.equal(bountyIsFinalPayingDay(dayBefore), true);
  // Not the paused day itself, and not any ordinary paying day before it.
  assert.equal(bountyIsFinalPayingDay(BOUNTY_PAUSED_FROM_DAY), false);
  assert.equal(bountyIsFinalPayingDay(bountyDayUTC(Date.parse(`${dayBefore}T00:00:00Z`) - 24 * 60 * 60 * 1000)), false);
});

// ── Bounty claim timing: nothing is payable until the day has closed ─────────
test("bounty claim: today and future days are never claimable", () => {
  const today = bountyDayUTC();
  const yesterday = bountyDayUTC(Date.now() - 24 * 60 * 60 * 1000);
  const tomorrow = bountyDayUTC(Date.now() + 24 * 60 * 60 * 1000);
  const nextYear = bountyDayUTC(Date.now() + 365 * 24 * 60 * 60 * 1000);

  // Paying a live day would let someone claim 1st place and then be overtaken.
  assert.equal(isBountyDayClosed(today), false);
  // A caller-supplied future date must not slip past the check either.
  assert.equal(isBountyDayClosed(tomorrow), false);
  assert.equal(isBountyDayClosed(nextYear), false);
  // Only a finished day pays.
  assert.equal(isBountyDayClosed(yesterday), true);
  assert.equal(isBountyDayClosed("2020-01-01"), true);
});

test("bounty claim: day keys compare correctly as strings", () => {
  // isBountyDayClosed relies on lexicographic comparison of ISO dates, so the
  // zero-padding matters — "2026-9-01" would sort wrong and open a live day.
  assert.match(bountyDayUTC(), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok("2026-08-09" < "2026-08-10");
  assert.ok("2026-08-31" < "2026-09-01");
  assert.ok("2026-12-31" < "2027-01-01");
});

test("bounty claim: one day can never pay more than both pools", () => {
  // The ceiling the endpoint checks every payout and every day total against,
  // computed independently of anything stored in Redis.
  const ceiling = usdToGdollar(BOUNTY_POOL_USD + BOUNTY_PARTICIPATION_POOL_USD);
  // Even first place plus the entire participation pool stays inside it.
  assert.ok(usdToGdollar(BOUNTY_PRIZE_SPLIT_USD[0] + BOUNTY_PARTICIPATION_POOL_USD) <= ceiling);
  // And the full podium plus the pool is exactly the ceiling, never above.
  const everything = BOUNTY_PRIZE_SPLIT_USD.reduce((a, b) => a + b, 0) + BOUNTY_PARTICIPATION_POOL_USD;
  assert.equal(usdToGdollar(everything), ceiling);
});

// ── Bounty claim auth: the signature must not be replayable ──────────────────
test("bounty claim: a signature is bound to one wallet and one day", () => {
  const A = "0x1111111111111111111111111111111111111111";
  const B = "0x2222222222222222222222222222222222222222";

  // Same inputs are stable, so a valid signature verifies.
  assert.equal(buildBountyClaimAuthMessage(A, "2026-08-05"), buildBountyClaimAuthMessage(A, "2026-08-05"));
  // A different day must not verify against yesterday's signature, or a winner
  // could replay one claim across every day.
  assert.notEqual(buildBountyClaimAuthMessage(A, "2026-08-05"), buildBountyClaimAuthMessage(A, "2026-08-06"));
  // Nor should another wallet's signature work.
  assert.notEqual(buildBountyClaimAuthMessage(A, "2026-08-05"), buildBountyClaimAuthMessage(B, "2026-08-05"));
  // Address case must not change the message, or the same wallet could claim twice.
  assert.equal(buildBountyClaimAuthMessage(A.toUpperCase(), "2026-08-05"), buildBountyClaimAuthMessage(A, "2026-08-05"));

  // The message states what is being authorised, in plain language.
  const msg = buildBountyClaimAuthMessage(A, "2026-08-05");
  assert.match(msg, /Daily Bounty Claim/);
  assert.match(msg, /2026-08-05/);
});

test("bounty claim: one day can never pay out more than both pools", () => {
  // Backstop independent of anything read from Redis — the ceiling the claim
  // endpoint checks every payout against.
  const ceiling = usdToGdollar(BOUNTY_POOL_USD + BOUNTY_PARTICIPATION_POOL_USD);
  assert.equal(ceiling, usdToGdollar(14));
  // A single first-place prize must sit well inside it.
  assert.ok(usdToGdollar(BOUNTY_PRIZE_SPLIT_USD[0]) < ceiling);
  // And the full podium plus the participation pool must exactly reach it.
  const everything = BOUNTY_PRIZE_SPLIT_USD.reduce((s, n) => s + n, 0) + BOUNTY_PARTICIPATION_POOL_USD;
  assert.equal(usdToGdollar(everything), ceiling);
});

// ── Daily bounty: real money, so who is eligible matters most ────────────────
test("bounty: treasury and display bots can never win a prize", () => {
  // The treasury funds the prizes; it must not also collect them.
  assert.equal(isBountyExcluded(TREASURY_ADDRESS), true);
  assert.equal(isBountyExcluded(TREASURY_MINIPAY_ADDRESS), true);
  assert.equal(isBountyExcluded(TREASURY_ADDRESS.toUpperCase()), true);

  // BOT_PLAYERS are merged into /api/leaderboard and share this prefix, so they
  // would otherwise rank — and they have hundreds of fabricated points.
  assert.equal(isBountyExcluded("0xB071d7A6F3EA0000000000000000000000000001"), true);
  assert.equal(isBountyExcluded("0xb071d7a6f3ea000000000000000000000000000A"), true);

  // A real player is eligible.
  assert.equal(isBountyExcluded("0x1111111111111111111111111111111111111111"), false);
});

test("bounty: a day is only payable once it has closed", () => {
  const today = bountyDayUTC();
  const yesterday = bountyDayUTC(Date.now() - 24 * 60 * 60 * 1000);

  // Paying a day still in progress means standings can still move underneath.
  assert.equal(isBountyDayClosed(today), false);
  assert.equal(isBountyDayClosed(yesterday), true);

  // UTC day keys must sort lexicographically for that comparison to hold.
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(yesterday < today);
});

test("bounty: a player below the daily threshold wins nothing", () => {
  assert.equal(meetsBountyThreshold(BOUNTY_MIN_POINTS_TO_WIN), true); // boundary is inclusive
  assert.equal(meetsBountyThreshold(BOUNTY_MIN_POINTS_TO_WIN - 1), false);
  assert.equal(meetsBountyThreshold(0), false);

  // The threshold exists so a single match on a quiet day can't take the pool.
  // A ranked win is 150 and a boss win at most 300 flawless, so no single match
  // can clear it.
  assert.ok(BOUNTY_MIN_POINTS_TO_WIN > 300);

  // And it must stay reachable inside the daily cap, or the bounty is
  // unwinnable by design: ten counted wins is the most anyone can score.
  const ceilingPerDay = HOUSE_WINS_COUNTED_PER_DAY * 300 + HOUSE_LOSS_POINTS_PER_DAY;
  assert.ok(
    BOUNTY_MIN_POINTS_TO_WIN < ceilingPerDay / 2,
    "threshold should need well under a perfect day",
  );
});

test("bounty: an unqualified player can never block a prize slot", () => {
  // Standings are sorted by points descending, so qualifiers are always a
  // prefix of the list. If that ever stopped holding, someone below the
  // threshold could sit at rank 2 and strand the second prize.
  const points = [900, 700, 400, 100];
  const qualified = points.map(meetsBountyThreshold);
  const firstUnqualified = qualified.indexOf(false);
  assert.ok(firstUnqualified !== -1);
  // Nothing after the first non-qualifier may qualify.
  assert.equal(qualified.slice(firstUnqualified).some(Boolean), false);
  // Sorted descending is the property that guarantees it.
  for (let i = 1; i < points.length; i++) assert.ok(points[i - 1] >= points[i]);
});

test("bounty: the participation pool is capped no matter how many qualify", () => {
  // A fixed pool, not a fixed per-head amount — otherwise the daily cost grows
  // without limit as the player base does.
  for (const n of [1, 3, 7, 40, 500]) {
    const share = bountyParticipationShareUsd(n);
    // Flooring to whole cents can leave the pool slightly underspent, never over.
    assert.ok(share * n <= BOUNTY_PARTICIPATION_POOL_USD, `pool overspent at ${n} recipients`);
    assert.ok(share >= 0);
  }
  assert.equal(bountyParticipationShareUsd(4), 1);
  assert.equal(bountyParticipationShareUsd(0), 0); // nobody eligible → nothing paid
});

test("bounty: a lone winner takes the prize only, never the participation pool", () => {
  // The bug this fixes: one qualifier finished 1st and collected $5 + the whole
  // $4 pool, so a "$5 for winning" day paid $9. The pool is for players who
  // turned up without placing, so the podium is excluded from it.
  assert.equal(bountyParticipationRecipients(1), 0);
  assert.equal(bountyParticipationRecipients(3), 0); // podium only — nobody below it
  assert.equal(bountyParticipationRecipients(4), 1); // 4th place alone
  assert.equal(bountyParticipationRecipients(10), 7);
  assert.equal(bountyParticipationRecipients(0), 0);

  // With a single qualifier the winner is owed exactly the first-place prize.
  const loneWinner = bountyPrizeForRank(1) + bountyParticipationShareUsd(bountyParticipationRecipients(1));
  assert.equal(loneWinner, 5);
});

test("bounty: total daily spend never exceeds the two pools, at any turnout", () => {
  for (const qualifiers of [0, 1, 3, 4, 12, 60]) {
    const recipients = bountyParticipationRecipients(qualifiers);
    const tiered = BOUNTY_PRIZE_SPLIT_USD
      .slice(0, Math.min(qualifiers, BOUNTY_TOP_N))
      .reduce((sum, n) => sum + n, 0);
    const spend = tiered + bountyParticipationShareUsd(recipients) * recipients;
    assert.ok(
      spend <= BOUNTY_POOL_USD + BOUNTY_PARTICIPATION_POOL_USD,
      `spend ${spend} exceeds pools at ${qualifiers} qualifiers`,
    );
  }
});

test("bounty: total daily spend stays within both pools combined", () => {
  // The whole point of fixed pools is a predictable daily number.
  const qualifiers = 12;
  const share = bountyParticipationShareUsd(qualifiers);
  const tiered = BOUNTY_PRIZE_SPLIT_USD.reduce((sum, n) => sum + n, 0);
  const worstCase = tiered + share * qualifiers;
  assert.ok(
    worstCase <= BOUNTY_POOL_USD + BOUNTY_PARTICIPATION_POOL_USD,
    `daily spend ${worstCase} exceeds the two pools`,
  );
});

test("bounty: USD converts to whole G$ for the manual payout block", () => {
  // Emitted into scripts/reward-players.mjs, which takes whole-token amounts.
  assert.equal(Number.isInteger(usdToGdollar(5)), true);
  assert.equal(Number.isInteger(usdToGdollar(1.33)), true);
  assert.equal(usdToGdollar(0), 0);
  assert.ok(usdToGdollar(5) > usdToGdollar(3));
});

test("bounty: the tiered split pays out exactly the daily pool, no more", () => {
  assert.equal(BOUNTY_TOP_N, 3);
  // The whole point of a fixed pool is that daily spend is bounded — if the
  // tiers ever stop summing to it, the budget silently drifts.
  const total = BOUNTY_PRIZE_SPLIT_USD.reduce((sum, n) => sum + n, 0);
  assert.equal(total, BOUNTY_POOL_USD);
  assert.equal(BOUNTY_PRIZE_SPLIT_USD.length, BOUNTY_TOP_N);

  // Ranks are 1-indexed and descending; 4th place and beyond win nothing.
  assert.equal(bountyPrizeForRank(1), 5);
  assert.equal(bountyPrizeForRank(2), 3);
  assert.equal(bountyPrizeForRank(3), 2);
  assert.equal(bountyPrizeForRank(4), 0);
  assert.equal(bountyPrizeForRank(999), 0);
  for (let rank = 2; rank <= BOUNTY_TOP_N; rank++) {
    assert.ok(bountyPrizeForRank(rank - 1) >= bountyPrizeForRank(rank));
  }
});

test("black market: each currency maps to the treasury the route verifies against", () => {
  // This mapping must stay in lockstep with verifyPayment(), which checks the
  // transfer landed at exactly this address.
  assert.equal(receivingTreasuryFor("celo"), TREASURY_ADDRESS);
  assert.equal(receivingTreasuryFor("gdollar"), TREASURY_ADDRESS);
  assert.equal(receivingTreasuryFor("usdt"), TREASURY_MINIPAY_ADDRESS);
  assert.equal(receivingTreasuryFor("usdc"), TREASURY_MINIPAY_ADDRESS);
  assert.equal(receivingTreasuryFor("cusd"), TREASURY_MINIPAY_ADDRESS);
  // The two treasuries are distinct, so the mapping is meaningful.
  assert.notEqual(TREASURY_ADDRESS.toLowerCase(), TREASURY_MINIPAY_ADDRESS.toLowerCase());
});
