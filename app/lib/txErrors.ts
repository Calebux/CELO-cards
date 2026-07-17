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

export function friendlyTxError(err: unknown, fallback: string): string {
  if (isUserRejectedTx(err)) return TX_CANCELLED_MESSAGE;
  return err instanceof Error && err.message ? err.message.slice(0, 120) : fallback;
}
