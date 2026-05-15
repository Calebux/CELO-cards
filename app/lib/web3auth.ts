// Web3Auth Modal v10 connector for wagmi v2
// Opens the Web3Auth modal (social logins + external wallets) when user clicks SIGN IN

import { createConnector } from "wagmi";
import { celo } from "wagmi/chains";

const CLIENT_ID = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let web3authInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWeb3Auth(): Promise<any> {
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
      const web3auth = await getWeb3Auth();
      return web3auth.provider;
    },

    async isAuthorized() {
      try {
        if (typeof window === "undefined") return false;
        const web3auth = await getWeb3Auth();
        return web3auth.connected;
      } catch {
        return false;
      }
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }));
}
