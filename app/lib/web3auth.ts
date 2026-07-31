// Web3Auth Modal v10 connector for wagmi v2
// Opens the Web3Auth modal (social logins + external wallets) when user clicks SIGN IN

import { createConnector } from "wagmi";
import { celo } from "wagmi/chains";
import { isMiniPay } from "./minipayRuntime";

const CLIENT_ID = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ?? "";
const DEFAULT_CELO_RPC = "https://forno.celo.org";
const WEB3AUTH_SESSION_KEY = "ao:web3auth-connected";
const WEB3AUTH_RPC_TARGET = (() => {
  const candidate = process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL?.trim();
  if (candidate && /^https?:\/\//i.test(candidate)) return candidate;
  return DEFAULT_CELO_RPC;
})();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let web3authInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initPromise: Promise<any> | null = null;

function persistWeb3AuthSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(WEB3AUTH_SESSION_KEY, "1");
  } catch {}
  try {
    window.localStorage.setItem(WEB3AUTH_SESSION_KEY, "1");
  } catch {}
}

export function clearWeb3AuthSessionHint() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(WEB3AUTH_SESSION_KEY);
  } catch {}
  try {
    window.localStorage.removeItem(WEB3AUTH_SESSION_KEY);
  } catch {}
}

export function hasWeb3AuthSessionHint(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(WEB3AUTH_SESSION_KEY) === "1") return true;
  } catch {}
  try {
    if (window.localStorage.getItem(WEB3AUTH_SESSION_KEY) === "1") return true;
  } catch {}
  return false;
}

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
    const isMobileBrowser = typeof navigator !== "undefined" &&
      /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);

    const instance = new Web3AuthClass({
      clientId: CLIENT_ID,
      web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
      chains: [{ ...fromViemChain(celo), rpcTarget: WEB3AUTH_RPC_TARGET }],
      defaultChainId: `0x${celo.id.toString(16)}`,
      ...(isMobileBrowser && {
        uiConfig: { uxMode: "redirect" as const },
      }),
    });

    // Add timeout to prevent infinite hang on mobile
    await Promise.race([
      instance.init(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Web3Auth init timeout")), 15_000)),
    ]);
    web3authInstance = instance;
    return instance;
  })();

  return initPromise;
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
        provider = await web3auth.connect();
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
      clearWeb3AuthSessionHint();
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
      if (!hasWeb3AuthSessionHint()) return false;
      try {
        const web3auth = await getWeb3Auth();
        return Boolean(web3auth.connected && web3auth.provider);
      } catch {
        clearWeb3AuthSessionHint();
        return false;
      }
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }));
}
