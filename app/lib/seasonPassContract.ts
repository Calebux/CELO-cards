export const SEASON_PASS_CONTRACT = (
  process.env.NEXT_PUBLIC_SEASON_PASS_CONTRACT ?? "0x0000000000000000000000000000000000000000"
) as `0x${string}`;

export const SEASON_PASS_ABI = [
  {
    name: "buySeasonPass",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "plan", type: "string" }],
    outputs: [],
  },
  {
    name: "totalPassesSold",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalPurchases",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "buyer", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "PassPurchased",
    type: "event",
    inputs: [
      { name: "buyer",     type: "address", indexed: true },
      { name: "plan",      type: "string",  indexed: false },
      { name: "amount",    type: "uint256", indexed: false },
      { name: "totalSold", type: "uint256", indexed: false },
    ],
  },
] as const;
