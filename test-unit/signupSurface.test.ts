import assert from "node:assert/strict";
import test from "node:test";

// The surface tag decides whether a wallet is counted as a MiniPay player, and
// it is the only thing in the codebase that answers "where do our players come
// from". What matters is that it never misses a MiniPay session — a missed one
// is silently counted as web, which understates the number we report.
const { resolveSignupSurface } = await import("../app/lib/signupMetrics");

const MINIPAY_UA =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 MiniPay/1.0";
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

test("signupSurface: the client's own detection marks MiniPay", () => {
  // isMiniPay() checks window.ethereum.isMiniPay, which is the better signal.
  assert.equal(resolveSignupSurface(CHROME_UA, true), "minipay");
});

test("signupSurface: the user agent alone still catches MiniPay", () => {
  // A client that never sent the flag — an older bundle, or a request made
  // before the provider was injected — must not be filed as web.
  assert.equal(resolveSignupSurface(MINIPAY_UA), "minipay");
  assert.equal(resolveSignupSurface(MINIPAY_UA, false), "minipay");
});

test("signupSurface: matching is case-insensitive", () => {
  assert.equal(resolveSignupSurface("... minipay/1.0"), "minipay");
});

test("signupSurface: an ordinary browser is web", () => {
  assert.equal(resolveSignupSurface(CHROME_UA), "web");
  assert.equal(resolveSignupSurface(CHROME_UA, false), "web");
});

test("signupSurface: a missing user agent is web, not a crash", () => {
  assert.equal(resolveSignupSurface(null), "web");
  assert.equal(resolveSignupSurface(undefined), "web");
  assert.equal(resolveSignupSurface(""), "web");
});
