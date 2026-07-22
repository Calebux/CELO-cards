// KnockOrderArenaV2 — verified multi-stablecoin wager escrow on Celo mainnet.
// Source verified on Celoscan:
//   https://celoscan.io/address/0x473df985d05a0b635706e58ac8e7452dcc3e9a01
//
// This is the hardened deployment: completeMatch requires two equal stakes and
// a winner who is one of the stakers, refundExpiredMatch is a permissionless
// 24h timeout refund, and ownership transfer is two-step. (Superseded the
// earlier 0x8475ca3d… deployment.)
//
// MiniPay stakes are plain ERC-20 transfers TO this contract; the server
// attributes them via recordStake and settles via completeMatch (owner =
// treasury key). Pure constants only — imported by both client and server.

export const ARENA_V2_ADDRESS = (
  process.env.NEXT_PUBLIC_ARENA_V2_ADDRESS ?? "0x473df985d05a0b635706e58ac8e7452dcc3e9a01"
) as `0x${string}`;

export const ARENA_V2_ACTIVE = ARENA_V2_ADDRESS !== "0x0000000000000000000000000000000000000000";

export const ARENA_V2_ABI = [
  {
    name: "recordStake", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "bytes32" },
      { name: "player", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "enterMatch", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "bytes32" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "completeMatch", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "bytes32" },
      { name: "winner", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "refundMatch", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "getMatch", type: "function", stateMutability: "view",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [
      { name: "token", type: "address" },
      { name: "status", type: "uint8" },
      { name: "startedAt", type: "uint64" },
      { name: "pot", type: "uint256" },
      { name: "stakers", type: "address[2]" },
      { name: "stakes", type: "uint256[2]" },
    ],
  },
] as const;

// MatchStatus enum values on the contract
export const ARENA_V2_STATUS = { None: 0, Active: 1, Completed: 2, Refunded: 3 } as const;
