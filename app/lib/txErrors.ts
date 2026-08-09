// Friendly wallet-transaction error messages. MiniPay review feedback:
// when a user cancels a transaction the raw wallet/viem error ("User
// rejected the request. Details: … Version: viem@…") must not be shown.

export const TX_CANCELLED_MESSAGE =
  "Payment cancelled — you closed the confirmation, so nothing was charged. Tap the button again when you're ready.";

export function isUserRejectedTx(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown };
  if (e.code === 4001 || e.name === "UserRejectedRequestError") return true;
  if (
    typeof e.message === "string" &&
    /user rejected|rejected the request|user denied|user cancel|request rejected|transaction was cancelled/i.test(e.message)
  ) {
    return true;
  }
  return isUserRejectedTx(e.cause);
}

// Google sign-in needs googleapis.com, which is a different domain from
// gmail.com and is blocked or unroutable on some networks and ISPs even when
// Gmail itself works fine. Nothing we deploy can make it reachable, but the
// same modal already offers email sign-in, which does not use it — so the
// message needs to point there instead of saying "couldn't connect".
export const GOOGLE_UNREACHABLE_MESSAGE =
  "Google sign-in can't be reached on this network. Tap SIGN IN again and choose \"Continue with Email\" — it works the same way.";

export function isGoogleUnreachable(err: unknown): boolean {
  if (!err) return false;
  const e = err as { message?: unknown; cause?: unknown };
  if (
    typeof e.message === "string" &&
    /googleapis\.com|googleusercontent|accounts\.google/i.test(e.message)
  ) {
    return true;
  }
  return typeof e === "object" && e !== null ? isGoogleUnreachable(e.cause) : false;
}

// A wallet with nothing in it cannot be fixed by retrying, so "please try
// again" is the one thing this must never say — the player retries, fails, and
// reports the game as broken instead of asking for the top-up that would fix it.
export const NO_GAS_MESSAGE =
  "Your wallet needs a little CELO to cover network fees. Message t.me/actionorder and we'll send you some — it only takes a minute.";

export function isInsufficientFunds(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: unknown; shortMessage?: unknown; name?: unknown; cause?: unknown };
  const text = [e.message, e.shortMessage, e.name].filter((v) => typeof v === "string").join(" ");
  if (/insufficient funds|insufficient balance|exceeds balance|gas required exceeds|InsufficientFunds/i.test(text)) {
    return true;
  }
  return isInsufficientFunds(e.cause);
}

export function friendlyTxError(err: unknown, fallback: string): string {
  if (isUserRejectedTx(err)) return TX_CANCELLED_MESSAGE;
  if (isGoogleUnreachable(err)) return GOOGLE_UNREACHABLE_MESSAGE;
  if (isInsufficientFunds(err)) return NO_GAS_MESSAGE;
  return err instanceof Error && err.message ? err.message.slice(0, 120) : fallback;
}
