// GoodDollar (G$) token — native Superfluid SuperToken on Celo mainnet

// G$ contract address (Celo mainnet)
export const GDOLLAR_CONTRACT = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as `0x${string}`;

// Superfluid CFAv1Forwarder (Celo mainnet)
export const CFA_FORWARDER = "0xcfA132E353cB4E398080B9700609bb008eceB125" as `0x${string}`;

// Micro wager — same denomination as cUSD/CELO (18 decimals)
export const WAGER_AMOUNT_GDOLLAR  = 7_000_000_000_000n; // 0.000007 G$
export const PAYOUT_AMOUNT_GDOLLAR = 7_000_000_000_000n; // 0.000007 G$

// Stream the payout over 24 hours
// flowRate (wei/sec) = amount / duration_in_seconds
export const STREAM_DURATION_SECS = 86_400n; // 24 hours
export const STREAM_FLOW_RATE = PAYOUT_AMOUNT_GDOLLAR / STREAM_DURATION_SECS; // ≈81,018,519 wei/sec

// G$ brand color
export const GDOLLAR_COLOR = "#00C58E";

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
] as const;

// Superfluid CFAv1Forwarder — create/delete constant-rate flows
export const CFA_FORWARDER_ABI = [
  {
    name: "createFlow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token",    type: "address" },
      { name: "sender",   type: "address" },
      { name: "receiver", type: "address" },
      { name: "flowrate", type: "int96" },
      { name: "userData", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "deleteFlow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token",    type: "address" },
      { name: "sender",   type: "address" },
      { name: "receiver", type: "address" },
      { name: "userData", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getFlowrate",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "token",    type: "address" },
      { name: "sender",   type: "address" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "flowrate", type: "int96" }],
  },
] as const;
