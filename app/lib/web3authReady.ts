type Web3AuthEventNames = {
  READY: string;
  CONNECTED: string;
  REHYDRATION_ERROR: string;
};

type Web3AuthStatuses = {
  NOT_READY: string;
  CONNECTING: string;
};

type Web3AuthLike = {
  connected?: boolean;
  provider?: unknown;
  status?: string;
  once: unknown;
  removeListener: unknown;
};

/**
 * Web3Auth Modal v10 can resolve init() before its auth connector finishes
 * rehydrating. Wait for the connector-level result so callers do not mistake
 * that intermediate state for a signed-out user.
 */
export function waitForWeb3AuthReady(
  instance: Web3AuthLike,
  events: Web3AuthEventNames,
  statuses: Web3AuthStatuses,
  timeoutMs = 45_000,
): Promise<void> {
  const once = instance.once as (event: string, listener: () => void) => unknown;
  const removeListener = instance.removeListener as (event: string, listener: () => void) => unknown;
  const isPending = () =>
    instance.status === statuses.NOT_READY || instance.status === statuses.CONNECTING;

  if ((instance.connected && instance.provider) || !isPending()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      clearTimeout(timeout);
      removeListener.call(instance, events.READY, finish);
      removeListener.call(instance, events.CONNECTED, finish);
      removeListener.call(instance, events.REHYDRATION_ERROR, finish);
    };
    const finish = () => {
      cleanup();
      resolve();
    };

    once.call(instance, events.READY, finish);
    once.call(instance, events.CONNECTED, finish);
    once.call(instance, events.REHYDRATION_ERROR, finish);
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Web3Auth connector initialization timeout"));
    }, timeoutMs);
  });
}
