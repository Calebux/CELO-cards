import { privateKeyToAccount } from "viem/accounts";

// Agent / automation wallets controlled by this project — NOT real players.
// They generate on-chain activity and MUST be excluded from every user / growth
// metric, or signups etc. read many times their true value.
//
// The set is sourced from the environment at runtime and is NEVER hardcoded, so
// the repository does not expose the wallet list. All sources are server-only
// (none are NEXT_PUBLIC), so this resolves to an EMPTY set on the client:
//   • AGENT_ADDRESSES — comma-separated addresses (the portable prod input)
//   • any *_KEY the app already holds — TREASURY / DEPLOYER / TOURNAMENT /
//     BOT_WALLET_* — derived to their address
function deriveAgentSet(): ReadonlySet<string> {
  const set = new Set<string>();

  for (const raw of (process.env.AGENT_ADDRESSES ?? "").split(",")) {
    const addr = raw.trim().toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(addr)) set.add(addr);
  }

  const keys = [
    process.env.TREASURY_PRIVATE_KEY,
    process.env.DEPLOYER_PRIVATE_KEY,
    process.env.TOURNAMENT_TREASURY_PRIVATE_KEY,
    ...Object.keys(process.env)
      .filter((k) => /^BOT_WALLET_.*_KEY$/.test(k))
      .map((k) => process.env[k]),
  ];
  for (const key of keys) {
    if (!key) continue;
    try {
      const hex = (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
      set.add(privateKeyToAccount(hex).address.toLowerCase());
    } catch {
      // ignore malformed keys
    }
  }
  return set;
}

let cached: ReadonlySet<string> | null = null;
function agentWallets(): ReadonlySet<string> {
  return (cached ??= deriveAgentSet());
}

export function isAgentWallet(address: string): boolean {
  return agentWallets().has(address.toLowerCase());
}
