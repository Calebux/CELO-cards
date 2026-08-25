import assert from "node:assert/strict";
import test from "node:test";
import { trackAgentWallet } from "../app/lib/goodagent-server";
import type { PartnerAgentSnapshot } from "../app/lib/goodagent-server";
import { isAgentWallet, type AgentStore } from "../app/lib/agentTrack";

// The seam that puts an agent on its own board is trackAgentWallet: until it
// runs, isAgentWallet() answers false and the agent's match scores on the
// human leaderboard and the daily bounty, where prizes go by rank. These
// tests are about that one guarantee, so only the store is faked.
type Store = Map<string, unknown>;

function fakeStore(store: Store, opts: { readFails?: boolean; writeFails?: boolean } = {}): AgentStore {
  return {
    get: async (k: string) => {
      if (opts.readFails) throw new Error("redis down");
      return store.get(k) ?? null;
    },
    set: async (k: string, v: unknown) => {
      if (opts.writeFails) throw new Error("redis down");
      store.set(k, v);
      return "OK";
    },
    zincrby: async () => 0,
    incrby: async () => 0,
    incr: async () => 0,
    expire: async () => 1,
    hset: async () => 1,
    zrange: async () => [],
    hgetall: async () => null,
  } as unknown as AgentStore;
}

const AGENT = "0xAgEnT0000000000000000000000000000000001".toLowerCase();
const OWNER = "0x1d935a748644daff3587eab9d7b9ede24ae301e1";

function snapshot(over: Partial<PartnerAgentSnapshot> = {}): PartnerAgentSnapshot {
  return {
    deployId: "deploy1234ab",
    displayName: "Agent Smith",
    agentAddress: AGENT,
    ownerWallet: OWNER,
    status: "running",
    verified: true,
    readyToPlay: true,
    dailyCapReached: false,
    matchesToday: 0,
    dailyMatchCap: 20,
    configuration: {},
    ...over,
  };
}

test("goodagent: a played agent is on the agent board before its first round", async () => {
  const store: Store = new Map();
  const s = fakeStore(store);

  assert.equal(await isAgentWallet(AGENT, s), false);
  assert.equal(await trackAgentWallet(snapshot(), s), true);
  assert.equal(await isAgentWallet(AGENT, s), true);

  const rec = store.get(`agent:wallet:${AGENT}`) as { deployId: string; ownerWallet: string };
  assert.equal(rec.deployId, "deploy1234ab");
  assert.equal(rec.ownerWallet, OWNER.toLowerCase());
});

test("goodagent: an unwritable registry reports failure, so play-once can refuse", async () => {
  // play-once turns this into a 503 rather than playing the match: the board
  // an unregistered agent would land on is the one that pays money.
  const s = fakeStore(new Map(), { writeFails: true });
  assert.equal(await trackAgentWallet(snapshot(), s), false);
});

test("goodagent: a failed read still registers rather than trusting the miss", async () => {
  // getAgentRegistration swallows read errors and answers null. Treating that
  // as "already registered" would be the one wrong turn here.
  const store: Store = new Map();
  const reads = { failed: false };
  const s = {
    ...fakeStore(store),
    get: async (k: string) => {
      if (!reads.failed) { reads.failed = true; throw new Error("redis down"); }
      return store.get(k) ?? null;
    },
  } as unknown as AgentStore;

  assert.equal(await trackAgentWallet(snapshot(), s), true);
  assert.equal(await isAgentWallet(AGENT, s), true);
});

test("goodagent: re-registering keeps the first registeredAt", async () => {
  const store: Store = new Map();
  const s = fakeStore(store);

  await trackAgentWallet(snapshot(), s);
  const first = store.get(`agent:wallet:${AGENT}`) as { registeredAt: number };

  await new Promise((r) => setTimeout(r, 5));
  await trackAgentWallet(snapshot(), s);
  const second = store.get(`agent:wallet:${AGENT}`) as { registeredAt: number };
  assert.equal(second.registeredAt, first.registeredAt);

  // A moved binding is a real change and does rewrite the record.
  await trackAgentWallet(snapshot({ deployId: "deploy5678cd" }), s);
  const moved = store.get(`agent:wallet:${AGENT}`) as { deployId: string };
  assert.equal(moved.deployId, "deploy5678cd");
});

test("goodagent: an unprovisioned deploy is a no-op, not a failure", async () => {
  const store: Store = new Map();
  const s = fakeStore(store);
  assert.equal(await trackAgentWallet(snapshot({ agentAddress: null }), s), true);
  assert.equal(store.size, 0);
});
