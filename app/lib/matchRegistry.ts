export const MATCH_REGISTRY = (
  process.env.NEXT_PUBLIC_MATCH_REGISTRY ?? "0x0000000000000000000000000000000000000000"
) as `0x${string}`;

export const MATCH_REGISTRY_ACTIVE =
  MATCH_REGISTRY !== "0x0000000000000000000000000000000000000000";

export const MATCH_REGISTRY_ABI = [
  {
    name: "recordMatch",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "string" }],
    outputs: [],
  },
  {
    name: "totalMatches",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "matchesPlayed",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "MatchRecorded",
    type: "event",
    inputs: [
      { name: "player",      type: "address", indexed: true },
      { name: "matchId",     type: "string",  indexed: false },
      { name: "playerTotal", type: "uint256", indexed: false },
      { name: "globalTotal", type: "uint256", indexed: false },
    ],
  },
] as const;
