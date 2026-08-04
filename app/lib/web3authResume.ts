type AuthorizationCheck = () => Promise<boolean>;

type RetryOptions = {
  attempts?: number;
  delayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  /**
   * Stop early and report not-authorized. Used to bail out the moment the user
   * starts an interactive sign-in, so a poll begun beforehand cannot run on
   * alongside their attempt.
   */
  shouldAbort?: () => boolean;
};

const defaultSleep = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

/**
 * Web3Auth can report false briefly after init() while its redirect session is
 * still rehydrating. Polling is read-only: it never opens the login modal.
 */
export async function retryWeb3AuthAuthorization(
  check: AuthorizationCheck,
  options: RetryOptions = {},
): Promise<boolean> {
  const attempts = Math.max(1, options.attempts ?? 10);
  const delayMs = Math.max(0, options.delayMs ?? 750);
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;

  const shouldAbort = options.shouldAbort ?? (() => false);

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (shouldAbort()) return false;
    try {
      if (await check()) return true;
      lastError = undefined;
    } catch (error) {
      lastError = error;
    }
    if (shouldAbort()) return false;

    if (attempt < attempts - 1) await sleep(delayMs);
  }

  if (lastError) throw lastError;
  return false;
}
