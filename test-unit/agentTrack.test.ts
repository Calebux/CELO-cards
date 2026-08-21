import assert from "node:assert/strict";
import test from "node:test";
import {
  isAgentWallet,
  registerAgentWallet,
  getAgentRegistration,
  recordAgentPoints,
  type AgentStore,
} from "../app/lib/agentTrack";

// The agent track is defined by what it refuses to do, and both refusals are
// Redis-shaped: is this wallet registered, and what happens when we cannot
// tell. So the store is stubbed rather than the module — these tests exercise
// the real isAgentWallet/recordAgentPoints logic against a fake Redis.
type Store = Map<string, unknown>;

function fakeStore(store: Store, failing = false): AgentStore {
  const boom = () => { throw new Error("redis down"); };
  return {
    get: async (k: string) => (failing ? boom() : (store.get(k) ?? null)),
    set: async (k: string, v: unknown) => { store.set(k, v); return "OK"; },
    zincrby: async (k: string, by: number, member: string) => {
      const z = (store.get(k) as Record<string, number>) ?? {};
      z[member] = (z[member] ?? 0) + by;
      store.set(k, z);
      return z[member];
    },
    incrby: async (k: string, by: number) => {
      const n = (Number(store.get(k)) || 0) + by;
      store.set(k, n);
      return n;
    },
    incr: async (k: string) => {
      const n = (Number(store.get(k)) || 0) + 1;
      store.set(k, n);
      return n;
    },
    expire: async () => 1,
    hset: async () => 1,
    zrange: async () => [],
    hgetall: async () => null,
  } as unknown as AgentStore;
}



const AGENT = "0xAgEnT0000000000000000000000000000000001".toLowerCase();
const HUMAN = "0x1d935a748644daff3587eab9d7b9ede24ae301e1";

test("agentTrack: an unregistered wallet is not an agent", async () => {
  const s = fakeStore(new Map());
  assert.equal(await isAgentWallet(HUMAN, s), false);
  // A missing address is a human path too — never guess an agent from absence.
  assert.equal(await isAgentWallet(null, s), false);
  assert.equal(await isAgentWallet(undefined, s), false);
});

test("agentTrack: registration is what makes a wallet an agent", async () => {
  const s = fakeStore(new Map());

  await registerAgentWallet(AGENT, "deploy-123", "0xOwner", s);
  assert.equal(await isAgentWallet(AGENT, s), true);
  // Case must not decide membership: an address is an address.
  assert.equal(await isAgentWallet(AGENT.toUpperCase(), s), true);

  const reg = await getAgentRegistration(AGENT, s);
  assert.equal(reg?.deployId, "deploy-123");
  assert.equal(reg?.ownerWallet, "0xowner");
});

test("agentTrack: an unreadable store fails CLOSED, keeping agents off the human board", async () => {
  // The asymmetry is deliberate. Guessing "human" during an outage puts a
  // script on a board where rank decides who gets paid; guessing "agent" costs
  // one match on the wrong leaderboard and nothing else.
  assert.equal(await isAgentWallet(HUMAN, fakeStore(new Map(), true)), true);
});

test("agentTrack: points accumulate per wallet and per day, uncapped", async () => {
  const store: Store = new Map();
  const s = fakeStore(store);

  await recordAgentPoints(AGENT, 200, "Agent Smith", s);
  await recordAgentPoints(AGENT, 300, "Agent Smith", s);

  const day = new Date().toISOString().slice(0, 10);
  const board = store.get(`agent:points:${day}`) as Record<string, number>;
  assert.equal(board[AGENT], 500);
  assert.equal(store.get(`agent:total:${AGENT}`), 500);
  assert.equal(store.get(`agent:matches:${AGENT}`), 2);

  // No daily allowance here: the human caps exist because points are money,
  // and nothing on this board pays out.
  for (let i = 0; i < 40; i++) await recordAgentPoints(AGENT, 300, null, s);
  assert.equal(store.get(`agent:total:${AGENT}`), 500 + 40 * 300);
});

test("agentTrack: scoring never throws, whatever the store does", async () => {
  // Match completion must not be able to fail because a leaderboard write did.
  await recordAgentPoints(AGENT, 200, null, fakeStore(new Map(), true));
  // Junk in, nothing recorded, no throw.
  const store: Store = new Map();
  const s = fakeStore(store);
  await recordAgentPoints(AGENT, 0, null, s);
  await recordAgentPoints(AGENT, Number.NaN, null, s);
  await recordAgentPoints(null, 100, null, s);
  assert.equal(store.size, 0);
});
