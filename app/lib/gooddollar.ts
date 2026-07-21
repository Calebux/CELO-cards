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
] as const;

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


