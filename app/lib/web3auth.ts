// Web3Auth Modal v10 connector for wagmi v2
// Opens the Web3Auth modal (social logins + external wallets) when user clicks SIGN IN

import { createConnector } from "wagmi";
import { celo } from "wagmi/chains";
import { isMiniPay } from "./minipayRuntime";
import {
  clearWeb3AuthSessionHint as clearHint,
  hasWeb3AuthSessionHint as hasHint,
  persistWeb3AuthSession,
  setWeb3AuthSignInInFlight,
} from "./web3authSession";

const CLIENT_ID = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ?? "";
const DEFAULT_CELO_RPC = "https://forno.celo.org";
const WEB3AUTH_RPC_TARGET = (() => {
  const candidate = process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL?.trim();
  if (candidate && /^https?:\/\//i.test(candidate)) return candidate;
  return DEFAULT_CELO_RPC;
})();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let web3authInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initPromise: Promise<any> | null = null;

// Session-hint helpers live in the dependency-free web3authSession module so the
// landing page can read them without pulling wagmi into its critical bundle.
export { clearWeb3AuthSessionHint, hasWeb3AuthSessionHint } from "./web3authSession";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWeb3Auth(): Promise<any> {
  // Never initialize Web3Auth (or its MetaMask SDK dependency) inside MiniPay.
  // Doing so causes MetaMask SDK to open a metamask:// deeplink that MiniPay's
  // WebView cannot handle (ERR_UNKNOWN_URL_SCHEME).
  if (typeof window !== "undefined" && isMiniPay()) {
    throw new Error("Web3Auth is not available in MiniPay.");
  }
  if (!CLIENT_ID) throw new Error("NEXT_PUBLIC_WEB3AUTH_CLIENT_ID is not configured.");
  if (web3authInstance) return web3authInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // All @web3auth imports are dynamic — nothing from the SDK lands in the
    // critical bundle. The full SDK only loads when user clicks "Social Login".
    const { Web3Auth: Web3AuthClass, WEB3AUTH_NETWORK, fromViemChain } = await import("@web3auth/modal");

    // On mobile browsers popups are blocked — use redirect mode instead.
    //
    // The UA test alone never matches an iPad: since iPadOS 13 Safari browses
    // desktop-class and reports "Macintosh", with no iPad token. Same for an
    // iPhone with "Request Desktop Website" on. Those devices fell through to
    // popup mode, where the await-heavy init below burns the user-gesture window
    // and Safari blocks the popup — so the first SIGN IN tap silently did
    // nothing and only a second tap (SDK now cached) got through. A "Mac" that
    // reports touch points is the giveaway.
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isDesktopModeIOS = typeof navigator !== "undefined" &&
      /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    const isMobileBrowser =
      /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(ua) || isDesktopModeIOS;

    const instance = new Web3AuthClass({
      clientId: CLIENT_ID,
      web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
      chains: [{ ...fromViemChain(celo), rpcTarget: WEB3AUTH_RPC_TARGET }],
      defaultChainId: `0x${celo.id.toString(16)}`,
      // Let the dashboard supply the session duration. The Base plan only
      // supports its default duration; requesting 30 days makes Web3Auth reject
      // social/email initialization with subscription error 1003.
      ...(isMobileBrowser && {
        uiConfig: { uxMode: "redirect" as const },
      }),
    });

    // Timeout so a hung init can't block the UI forever. The init keeps running
    // though: on a slow phone it often lands a second or two late, and throwing
    // that away meant the next attempt constructed a brand-new Web3Auth and
    // started the whole download again. Publishing the instance when it does
    // land means a retry finds it ready instead.
    const init = instance.init();
    void init.then(
      () => { web3authInstance = instance; },
      () => {},
    );

    await Promise.race([
      init,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Web3Auth init timeout")), 15_000)),
    ]);
    web3authInstance = instance;
    return instance;
  })();

  // A failed init must not poison every later attempt. Without this, one 15s
  // timeout leaves a rejected promise cached above, and every subsequent
  // getWeb3Auth() returns that same rejection instantly — so no retry, and no
  // amount of tapping, can re-init for the rest of the page's life.
  initPromise.catch(() => {
    initPromise = null;
  });

  return initPromise;
}

/**
 * Start loading and initialising the SDK before the user commits to signing in.
 *
 * The click handler otherwise has to pull ~1.3 MB and await init() before
 * anything appears on screen, so a cold first click looks like a dead button —
 * reproduced on desktop, and worse on a phone. Call this on hover/pointerdown
 * over the sign-in control: by the time the click lands the work is already in
 * flight, and on mobile it also keeps connect() closer to the user gesture.
 *
 * Never called on page load: that would put the SDK back in the critical path
 * for visitors who never sign in.
 */
export function prewarmWeb3Auth(): void {
  if (typeof window === "undefined") return;
  if (web3authInstance || initPromise) return;
  void getWeb3Auth().catch(() => {
    // Prewarming is best-effort; the real attempt reports its own errors.
  });
}

export function createWeb3AuthConnector() {
  return createConnector(() => ({
    id: "web3auth",
    name: "Social Login",
    type: "web3auth" as const,

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async connect(_parameters?: any) {
      const web3auth = await getWeb3Auth();
      // In redirect mode, init() restores the session automatically.
      // Only open the modal if user is not already connected.
      let provider;
      if (web3auth.connected && web3auth.provider) {
        provider = web3auth.provider;
      } else {
        // Persist the session hint BEFORE connecting. On mobile, connect() uses
        // redirect uxMode and navigates away, so any code after it never runs on
        // this page load — the hint is what lets WalletSync re-attach the restored
        // session once the OAuth redirect returns (including back to the landing "/").
        persistWeb3AuthSession();
        // ...but that hint makes an in-progress login indistinguishable from a
        // returning redirect, so mark the interactive attempt for its whole
        // duration. Without this, WalletSync starts a resume while the user is
        // still on Google's screen and fires a competing connect straight into
        // the token exchange.
        setWeb3AuthSignInInFlight(true);
        try {
          provider = await web3auth.connect();
        } finally {
          setWeb3AuthSignInInFlight(false);
        }
      }
      if (!provider) throw new Error("Web3Auth: no provider after connect");
      persistWeb3AuthSession();
      const accounts = (await provider.request({ method: "eth_accounts" })) as `0x${string}`[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { accounts: accounts as readonly `0x${string}`[], chainId: celo.id } as any;
    },

    async disconnect() {
      const web3auth = await getWeb3Auth();
      await web3auth.logout();
      clearHint();
    },

    async getAccounts() {
      const web3auth = await getWeb3Auth();
      if (!web3auth.provider) return [];
      const accounts = (await web3auth.provider.request({ method: "eth_accounts" })) as string[];
      return accounts as `0x${string}`[];
    },

    async getChainId() {
      return celo.id;
    },

    async getProvider() {
      // Never trigger web3auth init just to check availability.
      // RainbowKit calls getProvider() on all connectors at startup to detect
      // which wallets are "installed". Calling getWeb3Auth() here would load
      // 1.3 MB from auth.web3auth.io on every page load.
      // Return null when not connected — the actual init happens in connect().
      if (!web3authInstance?.provider) return null;
      return web3authInstance.provider;
    },

    async isAuthorized() {
      if (typeof window === "undefined") return false;
      if (isMiniPay()) return false;
      if (web3authInstance?.connected) return true;
      if (!hasHint()) return false;
      // Rethrow rather than dropping the hint: a slow SDK load or an init
      // timeout is transient, and clearing here would disable auto-resume for
      // every future page load. The caller decides what a throw means.
      const web3auth = await getWeb3Auth();
      return Boolean(web3auth.connected && web3auth.provider);
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }));
}
