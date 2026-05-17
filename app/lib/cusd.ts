// cUSD (Celo Dollar) ERC-20 contract config

// Platform treasury addresses
export const TREASURY_ADDRESS = "0xBa37dd0890AFc659a25331871319f66E7EBA3522" as `0x${string}`;
export const TREASURY_MINIPAY_ADDRESS = "0xbEa347EeBdB3dCb0Bd1feC287561504804f4bA4b" as `0x${string}`;

export const CUSD_ADDRESS = {
  alfajores: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1" as `0x${string}`,
  mainnet:   "0x765DE816845861e75A25fCA122bb6898B8B1282a" as `0x${string}`,
} as const;

export const CUSD_CONTRACT = CUSD_ADDRESS.mainnet;
export const USDT_CONTRACT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as `0x${string}`;
export const USDT_FEE_CURRENCY = "0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72" as `0x${string}`;

// Micro wager amounts — optimised for agent activity volume
export const WAGER_AMOUNT  = 7_000_000_000_000n; // 0.000007 cUSD
export const PAYOUT_AMOUNT = 7_000_000_000_000n; // 0.000007 cUSD (entry == payout)

export const WAGER_AMOUNT_CELO  = 7_000_000_000_000n; // 0.000007 CELO
export const PAYOUT_AMOUNT_CELO = 7_000_000_000_000n; // 0.000007 CELO
export const WAGER_AMOUNT_USDT  = 7n; // 0.000007 USDT (6 decimals)
export const PAYOUT_AMOUNT_USDT = 7n; // 0.000007 USDT (entry == payout)

// Platform fee — 10% from each player when both wager (winner-takes-all)
export const PLATFORM_FEE_BPS = 1000n; // 10% in basis points (1000/10000)

// Dual-wager payout: winner gets 90% of the combined pot (both players' wagers)
// = 2 × WAGER_AMOUNT × (1 − 10%) = 0.0000126
export const DUAL_WAGER_PAYOUT      = 2n * WAGER_AMOUNT      * (10000n - PLATFORM_FEE_BPS) / 10000n;
export const DUAL_WAGER_PAYOUT_CELO = 2n * WAGER_AMOUNT_CELO * (10000n - PLATFORM_FEE_BPS) / 10000n;
export const DUAL_WAGER_PAYOUT_USDT = 2n * WAGER_AMOUNT_USDT * (10000n - PLATFORM_FEE_BPS) / 10000n;

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
