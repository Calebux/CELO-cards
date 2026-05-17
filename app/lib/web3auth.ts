// Web3Auth Modal v10 connector for wagmi v2
// Opens the Web3Auth modal (social logins + external wallets) when user clicks SIGN IN

import { createConnector } from "wagmi";
import { celo } from "wagmi/chains";
import { isMiniPay } from "./minipay";

const CLIENT_ID = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let web3authInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWeb3Auth(): Promise<any> {
  // Never initialize Web3Auth (or its MetaMask SDK dependency) inside MiniPay.
  // Doing so causes MetaMask SDK to open a metamask:// deeplink that MiniPay's
  // WebView cannot handle (ERR_UNKNOWN_URL_SCHEME).
  if (typeof window !== "undefined" && isMiniPay()) {
    throw new Error("Web3Auth is not available in MiniPay.");
  }
  if (web3authInstance) return web3authInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // All @web3auth imports are dynamic — nothing from the SDK lands in the
    // critical bundle. The full SDK only loads when user clicks "Social Login".
    const { Web3Auth: Web3AuthClass, WEB3AUTH_NETWORK, fromViemChain } = await import("@web3auth/modal");

    const instance = new Web3AuthClass({
      clientId: CLIENT_ID,
      web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
      chains: [{ ...fromViemChain(celo), rpcTarget: "https://celo-mainnet.g.alchemy.com/v2/5TkObpGZSAQ-ntN5ZFswA" }],
      defaultChainId: `0x${celo.id.toString(16)}`,
    });

    await instance.init();
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
      const provider = await web3auth.connect();
      if (!provider) throw new Error("Web3Auth: no provider after connect");
      const accounts = (await provider.request({ method: "eth_accounts" })) as `0x${string}`[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { accounts: accounts as readonly `0x${string}`[], chainId: celo.id } as any;
    },

    async disconnect() {
      const web3auth = await getWeb3Auth();
      await web3auth.logout();
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
      // Do NOT call getWeb3Auth() here — wagmi invokes isAuthorized() on every
      // connector at startup. If we called getWeb3Auth(), it would trigger the
      // dynamic import of @web3auth/modal, loading 1.3MB from auth.web3auth.io
      // on every page load. Instead, return false unless the SDK is already
      // initialised (user connected in this session).
      if (typeof window === "undefined") return false;
      if (isMiniPay()) return false;
      return web3authInstance?.connected ?? false;
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }));
}
