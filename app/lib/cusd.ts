// cUSD (Celo Dollar) ERC-20 contract config

export const CUSD_ADDRESS = {
  alfajores: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1" as `0x${string}`,
  mainnet:   "0x765DE816845861e75A25fCA122bb6898B8B1282a" as `0x${string}`,
} as const;

export const CUSD_CONTRACT = CUSD_ADDRESS.mainnet;

// Micro wager amounts — optimised for agent activity volume
export const WAGER_AMOUNT  = 7_000_000_000_000n; // 0.000007 cUSD
export const PAYOUT_AMOUNT = 7_000_000_000_000n; // 0.000007 cUSD (entry == payout)

export const WAGER_AMOUNT_CELO  = 7_000_000_000_000n; // 0.000007 CELO
export const PAYOUT_AMOUNT_CELO = 7_000_000_000_000n; // 0.000007 CELO

// Platform fee — 10% from each player when both wager (winner-takes-all)
export const PLATFORM_FEE_BPS = 1000n; // 10% in basis points (1000/10000)

// Dual-wager payout: winner gets 90% of the combined pot (both players' wagers)
// = 2 × WAGER_AMOUNT × (1 − 10%) = 0.0000126
export const DUAL_WAGER_PAYOUT      = 2n * WAGER_AMOUNT      * (10000n - PLATFORM_FEE_BPS) / 10000n;
export const DUAL_WAGER_PAYOUT_CELO = 2n * WAGER_AMOUNT_CELO * (10000n - PLATFORM_FEE_BPS) / 10000n;

// Minimal ERC-20 ABI — only what we need
export const ERC20_ABI = [
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
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
