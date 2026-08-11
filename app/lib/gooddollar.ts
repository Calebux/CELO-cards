import type { PublicClient } from "viem";

// GoodDollar (G$) token on Celo mainnet. Payouts are bounded one-time
// ERC-20 transfers (Superfluid streaming was removed — it had no enforced end).

// G$ contract address (Celo mainnet)
export const GDOLLAR_CONTRACT = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as `0x${string}`;

// Micro wager — same denomination as cUSD/CELO (18 decimals)
export const WAGER_AMOUNT_GDOLLAR  = 7_000_000_000_000n; // 0.000007 G$
export const PAYOUT_AMOUNT_GDOLLAR = 7_000_000_000_000n; // 0.000007 G$

// Dual-wager G$ payout: 2 × 0.000007 × 90% = 0.0000126 G$
export const DUAL_WAGER_PAYOUT_GDOLLAR = 2n * WAGER_AMOUNT_GDOLLAR * 9000n / 10000n; // 12_600_000_000_000n

// G$ brand color
export const GDOLLAR_COLOR = "#00C58E";

// GoodDollar Identity contract (Celo mainnet) — checks if address is whitelisted/verified
export const IDENTITY_CONTRACT = "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42" as `0x${string}`;

export const IDENTITY_ABI = [
  {
    name: "isWhitelisted",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getWhitelistedRoot",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "lastAuthenticated",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "authenticationPeriod",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Returns the root a wallet is linked to, or the zero address when it is not
  // linked. Unlike getWhitelistedRoot this still answers after the identity has
  // expired, which is the only way to find the root of a lapsed linked wallet.
  {
    name: "connectedAccounts",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Where to send a player who is already G$ Verified on a different wallet.
 *
 * Deliberately the docs page and not GoodDollar's helper app: that helper is
 * currently a CodeSandbox preview (h3n3kp.csb.app) with no address prefill, so
 * using it means leaving the game for a sandbox domain, connecting a second
 * wallet there and pasting an address in by hand — the exact shape of a
 * phishing flow, on a host that can vanish. The docs explain the concept on a
 * domain players can trust. Replace this with GoodDollar's embeddable widget
 * once it ships.
 */
export const GDOLLAR_CONNECT_WALLET_DOCS =
  "https://docs.gooddollar.org/user-guides/connect-another-wallet-address-to-identity";

export type GoodDollarIdentity = {
  /** True when this wallet belongs to a G$ verified identity. */
  isVerified: boolean;
  /** The verified root wallet, or null when the wallet has no identity. */
  root: `0x${string}` | null;
  /** Lowercased key for per-user records. Never the connected wallet when a root exists. */
  identityKey: string;
};

/**
 * Resolves the G$ identity that owns `address`.
 *
 * GoodDollar lets one verified human link several wallets to a single identity,
 * so the wallet a player connects with is often NOT the wallet their
 * verification lives on — social sign-in mints a fresh address, and most people
 * verify in the GoodDollar app or Valora rather than in whatever wallet they
 * play with. `isWhitelisted` returns true only for that root wallet; a linked
 * wallet reads false, which would wrongly reject a verified human who cannot
 * re-verify (a second face verification fails as a duplicate).
 *
 * `getWhitelistedRoot` covers every case in one read: the zero address when the
 * wallet has no identity, the wallet itself when it is its own root, and the
 * root when it is a linked wallet. That makes it a strict superset of
 * `isWhitelisted` — identical for unlinked wallets, correct for linked ones.
 *
 * Callers must key per-user records on `identityKey`, never on the connected
 * address, or one human with several linked wallets holds several accounts.
 * @see https://docs.gooddollar.org/user-guides/connect-another-wallet-address-to-identity
 */
export async function resolveGoodDollarIdentity(
  client: Pick<PublicClient, "readContract">,
  address: string,
): Promise<GoodDollarIdentity> {
  const root = await client.readContract({
    address: IDENTITY_CONTRACT,
    abi: IDENTITY_ABI,
    functionName: "getWhitelistedRoot",
    args: [address as `0x${string}`],
  });

  const isVerified = !!root && root.toLowerCase() !== ZERO_ADDRESS;
  return {
    isVerified,
    root: isVerified ? root : null,
    identityKey: (isVerified ? root : address).toLowerCase(),
  };
}

/**
 * Whether a wallet is verified now, was verified and lapsed, or never was.
 *
 * G$ verification expires after `authenticationPeriod` days (180 at time of
 * writing), and an expired identity is indistinguishable from a brand-new one
 * under `getWhitelistedRoot` alone — both read as the zero address. The
 * difference is `lastAuthenticated`: non-zero means this person completed
 * verification at some point, so they need to renew rather than start over.
 *
 * Read against the identity root, not the connected wallet, since that is where
 * the authentication timestamp lives. For a lapsed *linked* wallet the root is
 * no longer reachable via getWhitelistedRoot, so `connectedAccounts` supplies it.
 */
export type GoodDollarStatus = {
  status: "verified" | "expired" | "never";
  root: `0x${string}` | null;
  identityKey: string;
  /** Epoch ms when the identity lapses (or lapsed). Null when never verified. */
  expiresAt: number | null;
};

/**
 * Server-side counterpart to `useGoodDollarStatus`. Four reads rather than the
 * single one in `resolveGoodDollarIdentity`, so use it only where the extra
 * detail earns its cost — telling a lapsed player to renew rather than to
 * verify, for instance. Plain gating should use `resolveGoodDollarIdentity`.
 */
export async function fetchGoodDollarStatus(
  client: Pick<PublicClient, "readContract">,
  address: string,
): Promise<GoodDollarStatus> {
  const read = (functionName: "getWhitelistedRoot" | "connectedAccounts", account: string) =>
    client.readContract({
      address: IDENTITY_CONTRACT,
      abi: IDENTITY_ABI,
      functionName,
      args: [account as `0x${string}`],
    });

  const [whitelistedRoot, connectedRoot, authenticationPeriodDays] = await Promise.all([
    read("getWhitelistedRoot", address),
    read("connectedAccounts", address),
    client.readContract({
      address: IDENTITY_CONTRACT,
      abi: IDENTITY_ABI,
      functionName: "authenticationPeriod",
    }),
  ]);

  const isZero = (a: string) => !a || a.toLowerCase() === ZERO_ADDRESS;
  const subject = !isZero(whitelistedRoot) ? whitelistedRoot : !isZero(connectedRoot) ? connectedRoot : address;

  const lastAuthenticated = await client.readContract({
    address: IDENTITY_CONTRACT,
    abi: IDENTITY_ABI,
    functionName: "lastAuthenticated",
    args: [subject as `0x${string}`],
  });

  return deriveGoodDollarStatus({
    address,
    whitelistedRoot,
    connectedRoot,
    lastAuthenticated,
    authenticationPeriodDays,
  });
}

export function deriveGoodDollarStatus(args: {
  address: string;
  whitelistedRoot: string;
  connectedRoot: string;
  lastAuthenticated: bigint;
  authenticationPeriodDays: bigint;
}): GoodDollarStatus {
  const { address, whitelistedRoot, connectedRoot, lastAuthenticated, authenticationPeriodDays } = args;

  const isZero = (a: string) => !a || a.toLowerCase() === ZERO_ADDRESS;
  const verified = !isZero(whitelistedRoot);
  // Falls back to the connected root so a lapsed linked wallet still resolves to
  // the identity that actually holds its authentication record.
  const root = verified ? whitelistedRoot : !isZero(connectedRoot) ? connectedRoot : null;

  const expiresAt =
    lastAuthenticated > 0n
      ? Number((lastAuthenticated + authenticationPeriodDays * 86_400n) * 1000n)
      : null;

  return {
    status: verified ? "verified" : lastAuthenticated > 0n ? "expired" : "never",
    root: root as `0x${string}` | null,
    identityKey: (root ?? address).toLowerCase(),
    expiresAt,
  };
}

// GoodDollar UBIScheme — daily UBI claim (Celo mainnet)
export const UBISCHEME_CONTRACT = "0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1" as `0x${string}`;

export const UBISCHEME_ABI = [
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "checkEntitlement",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// G$ is ERC-20 + ERC-677 (transferAndCall) compatible
export const GDOLLAR_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to",    type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "transferAndCall",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to",    type: "address" },
      { name: "value", type: "uint256" },
      { name: "data",  type: "bytes" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value",   type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;


