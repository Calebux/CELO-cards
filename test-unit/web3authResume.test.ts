import assert from "node:assert/strict";
import test from "node:test";
import { retryWeb3AuthAuthorization } from "../app/lib/web3authResume";

const noDelay = async () => {};

test("waits through temporary false results until redirect rehydration completes", async () => {
  const results = [false, false, true];
  let checks = 0;

  const authorized = await retryWeb3AuthAuthorization(
    async () => {
      checks += 1;
      return results.shift() ?? false;
    },
    { attempts: 5, sleep: noDelay },
  );

  assert.equal(authorized, true);
  assert.equal(checks, 3);
});

test("returns false only after every authorization check is false", async () => {
  let checks = 0;

  const authorized = await retryWeb3AuthAuthorization(
    async () => {
      checks += 1;
      return false;
    },
    { attempts: 4, sleep: noDelay },
  );

  assert.equal(authorized, false);
  assert.equal(checks, 4);
});

test("retries transient SDK errors and succeeds when the provider appears", async () => {
  let checks = 0;

  const authorized = await retryWeb3AuthAuthorization(
    async () => {
      checks += 1;
      if (checks < 3) throw new Error("SDK still initializing");
      return true;
    },
    { attempts: 4, sleep: noDelay },
  );

  assert.equal(authorized, true);
  assert.equal(checks, 3);
});
