import assert from "node:assert/strict";
import test from "node:test";
import type { AgentStore } from "../app/lib/agentTrack";

// The registry only learns about agents that come through our own routes, and
// the host runs its own autopilot loop that never does — the action-order
// skill ships MAX_MATCHES / MATCH_INTERVAL_SECONDS / DAILY_MATCH_CAP, so its
// matches arrive straight at the resolve route. These tests cover the refresh
// that closes that gap, and the fail-closed verdict it must not overturn.
//
// The partner key is read at module scope, so it is set before the first
// import of goodagent-server below.
process.env.GOODAGENT_PARTNER_API_KEY = "test-partner-key";
process.env.GOODAGENT_HOST_URL = "https://host.test/host";

const AGENT = "0xAgEnT0000000000000000000000000000000009".toLowerCase();
const HUMAN = "0x1d935a748644daff3587eab9d7b9ede24ae301e1";

type Store = Map<string, unknown>;

function fakeStore(store: Store, opts: { readFails?: boolean } = {}): AgentStore {
  return {
    get: async (k: string) => {
      if (opts.readFails) throw new Error("redis down");
      return store.get(k) ?? null;
    },
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => {
      if (o?.nx && store.has(k)) return null;
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

function hostReturns(agents: unknown[], calls: { n: number }) {
  return async (url: string | URL) => {
    calls.n++;
    assert.match(String(url), /\/partners\/action-order\/agents$/);
    return new Response(JSON.stringify({ agents }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

const snapshot = {
  deployId: "deployautopil",
  displayName: "Autopilot",
  agentAddress: AGENT,
  ownerWallet: "0xowner00000000000000000000000000000000001",
  status: "running",
  verified: true,
  readyToPlay: true,
  dailyCapReached: false,
  matchesToday: 3,
  dailyMatchCap: 50,
  configuration: {},
};

test("registry sync: an autopilot agent we have never seen is caught on first scoring", async () => {
  const { resolveAgentStatus } = await import("../app/lib/goodagent-server");
  const store: Store = new Map();
  const s = fakeStore(store);
  const calls = { n: 0 };
  const original = globalThis.fetch;
  globalThis.fetch = hostReturns([snapshot], calls) as typeof fetch;

  try {
    // Nothing routed through play-once or control, so the registry is empty —
    // and without the refresh this match would score on the human bounty.
    assert.equal(await resolveAgentStatus(AGENT, s), true);
    assert.equal(calls.n, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("registry sync: one host call per window, not one per match", async () => {
  const { resolveAgentStatus } = await import("../app/lib/goodagent-server");
  const store: Store = new Map();
  const s = fakeStore(store);
  const calls = { n: 0 };
  const original = globalThis.fetch;
  globalThis.fetch = hostReturns([snapshot], calls) as typeof fetch;

  try {
    await resolveAgentStatus(AGENT, s);
    // A registered wallet answers from the registry and never reaches the host.
    await resolveAgentStatus(AGENT, s);
    // A human misses the registry every time; the SET NX guard absorbs it.
    for (let i = 0; i < 5; i++) assert.equal(await resolveAgentStatus(HUMAN, s), false);
    assert.equal(calls.n, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("registry sync: an unreachable host decides nothing", async () => {
  const { resolveAgentStatus } = await import("../app/lib/goodagent-server");
  const store: Store = new Map();
  const s = fakeStore(store);
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("host down");
  }) as typeof fetch;

  try {
    // Unknown and unverifiable is not "agent" — that would sweep real players
    // off the human board every time GoodAgent had an outage.
    assert.equal(await resolveAgentStatus(HUMAN, s), false);
  } finally {
    globalThis.fetch = original;
  }
});

test("registry sync: an unreadable registry still fails closed", async () => {
  const { resolveAgentStatus } = await import("../app/lib/goodagent-server");
  const s = fakeStore(new Map(), { readFails: true });
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("should not be reached");
  }) as typeof fetch;

  try {
    // isAgentWallet answers "agent" when it cannot read, and the refresh must
    // not be able to overturn that into "human, put them on the prize board".
    assert.equal(await resolveAgentStatus(HUMAN, s), true);
  } finally {
    globalThis.fetch = original;
  }
});
