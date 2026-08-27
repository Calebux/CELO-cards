import assert from "node:assert/strict";
import test from "node:test";
import { consumeFreeGame, FREE_GAMES, type FreeGameStore } from "../app/lib/freeGames";

// The two free matches are the only thing between a player and unlimited free
// play, so what matters is the ways this can wrongly say yes — and the one case
// where saying yes wrongly is correct, which is a store it cannot reach.
//
// The store is injected rather than the module stubbed: mutating the shared
// redis export does not take effect here, and the tests then run against the
// live database, which is how a stray key ended up in production once already.
type Store = Map<string, unknown>;

function fakeStore(store: Store, failing = false): FreeGameStore {
  const boom = () => { throw new Error("redis down"); };
  return {
    get: async (k: string) => (failing ? boom() : (store.get(k) ?? null)),
    incr: async (k: string) => {
      if (failing) boom();
      const n = (Number(store.get(k)) || 0) + 1;
      store.set(k, n);
      return n;
    },
    incrby: async (k: string, by: number) => {
      const n = (Number(store.get(k)) || 0) + by;
      store.set(k, n);
      return n;
    },
  } as unknown as FreeGameStore;
}

const PLAYER = "0x00000000000000000000000000000000000f1234";
const freeKey = `free-games:${PLAYER}`;
const passKey = `season-pass:${PLAYER}`;

test("freeGames: exactly two matches, then the gate closes", async () => {
  const store: Store = new Map();
  const s = fakeStore(store);
  assert.equal((await consumeFreeGame(PLAYER, s)).allowed, true);
  assert.equal((await consumeFreeGame(PLAYER, s)).allowed, true);
  assert.equal((await consumeFreeGame(PLAYER, s)).allowed, false, "the third VS House match must need a pass");
  assert.equal(FREE_GAMES, 2);
});

test("freeGames: a blocked attempt does not inflate the count", async () => {
  const store: Store = new Map();
  const s = fakeStore(store);
  for (let i = 0; i < 7; i++) await consumeFreeGame(PLAYER, s);
  // Five refusals on top of two plays must leave the counter at the allowance.
  // Otherwise a player who later buys a pass and lets it lapse is further
  // behind than the matches they actually played.
  assert.equal(Number(store.get(freeKey)), FREE_GAMES);
});

test("freeGames: an active pass is never metered", async () => {
  const store: Store = new Map([[passKey, { expiry: Date.now() + 86_400_000 }]]);
  const s = fakeStore(store);
  for (let i = 0; i < 5; i++) {
    assert.equal((await consumeFreeGame(PLAYER, s)).allowed, true);
  }
  assert.equal(store.get(freeKey), undefined, "a pass holder should not touch the counter at all");
});

test("freeGames: an expired pass is not a pass", async () => {
  const store: Store = new Map([[passKey, { expiry: Date.now() - 1000 }]]);
  const s = fakeStore(store);
  await consumeFreeGame(PLAYER, s);
  await consumeFreeGame(PLAYER, s);
  assert.equal((await consumeFreeGame(PLAYER, s)).allowed, false);
});

test("freeGames: a pass stored as a JSON string still counts", async () => {
  // Both shapes exist in Redis; reading only the object one would meter a
  // paying customer.
  const store: Store = new Map([[passKey, JSON.stringify({ expiry: Date.now() + 86_400_000 })]]);
  assert.equal((await consumeFreeGame(PLAYER, fakeStore(store))).allowed, true);
});

test("freeGames: an unreachable store lets the match run", async () => {
  // Fails OPEN on purpose. Refusing to let someone play because a cache
  // blinked is worse than one unmetered match; this is a business rule, not a
  // safety one.
  assert.equal((await consumeFreeGame(PLAYER, fakeStore(new Map(), true))).allowed, true);
});
