import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { waitForWeb3AuthReady } from "../app/lib/web3authReady";

const events = {
  READY: "ready",
  CONNECTED: "connected",
  REHYDRATION_ERROR: "rehydration_error",
};
const statuses = {
  NOT_READY: "not_ready",
  CONNECTING: "connecting",
};

class FakeWeb3Auth extends EventEmitter {
  connected = false;
  provider: unknown = null;
  status = statuses.NOT_READY;
}

test("waits for connector rehydration after init has returned", async () => {
  const instance = new FakeWeb3Auth();
  let settled = false;
  const ready = waitForWeb3AuthReady(instance, events, statuses, 100).then(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);

  instance.status = "connected";
  instance.connected = true;
  instance.provider = {};
  instance.emit(events.CONNECTED);

  await ready;
  assert.equal(settled, true);
});

test("returns immediately when Web3Auth is already ready", async () => {
  const instance = new FakeWeb3Auth();
  instance.status = "ready";

  await waitForWeb3AuthReady(instance, events, statuses, 100);
});

test("treats a completed rehydration failure as an initialized signed-out SDK", async () => {
  const instance = new FakeWeb3Auth();
  const ready = waitForWeb3AuthReady(instance, events, statuses, 100);

  instance.status = "ready";
  instance.emit(events.REHYDRATION_ERROR);

  await ready;
});
