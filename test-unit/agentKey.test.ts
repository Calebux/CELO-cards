import assert from "node:assert/strict";
import test from "node:test";

// The scoped key is the only thing on the vs-house path allowed to say "this
// wallet is a bot", so the ways it can wrongly answer yes are what matter.
process.env.ACTIONORDER_AGENT_API_KEY = "test-agent-key-0123456789";
const { isAgentKeyRequest } = await import("../app/lib/agentKey");

const req = (headers: Record<string, string> = {}) =>
  new Request("https://example.test/api/match/vshouse/start", { method: "POST", headers });

test("agentKey: the configured key is accepted", () => {
  assert.equal(isAgentKeyRequest(req({ "x-agent-key": "test-agent-key-0123456789" })), true);
});

test("agentKey: a wrong key of the same length is rejected", () => {
  // Same length on purpose — this is the case a naive length check would pass.
  assert.equal(isAgentKeyRequest(req({ "x-agent-key": "test-agent-key-9876543210" })), false);
});

test("agentKey: a mismatched length is rejected rather than throwing", () => {
  // timingSafeEqual throws on unequal lengths; that must not become a 500.
  assert.doesNotThrow(() => isAgentKeyRequest(req({ "x-agent-key": "short" })));
  assert.equal(isAgentKeyRequest(req({ "x-agent-key": "short" })), false);
  assert.equal(isAgentKeyRequest(req({ "x-agent-key": "" })), false);
});

test("agentKey: no header is not an agent", () => {
  assert.equal(isAgentKeyRequest(req()), false);
});

test("agentKey: with no key configured, nobody is an agent", async () => {
  // An unset env var must not turn every caller into a trusted agent — that
  // would put every human player on the agent board and off the bounty.
  delete process.env.ACTIONORDER_AGENT_API_KEY;
  // Re-imported through a variable so the module is evaluated again with the
  // env var gone; a literal path would be served from the module cache.
  const spec = "../app/lib/agentKey.ts?nokey";
  const fresh = (await import(spec)) as { isAgentKeyRequest: (r: Request) => boolean };
  assert.equal(fresh.isAgentKeyRequest(req({ "x-agent-key": "anything" })), false);
});
