// KnockOrderArena contract — on-chain match registry on Celo mainnet.
// Deploy: npx tsx scripts/deploy.ts --network celo
// Then set NEXT_PUBLIC_ARENA_ADDRESS in .env.local + Vercel.

import { keccak256, toHex } from "viem";

export const ARENA_ADDRESS = (
  process.env.NEXT_PUBLIC_ARENA_ADDRESS ?? "0x0000000000000000000000000000000000000000"
) as `0x${string}`;

/** Convert a string matchId like "KO-ABCD-1" to a bytes32 for the contract */
export function matchIdToBytes32(matchId: string): `0x${string}` {
  return keccak256(toHex(matchId));
}

export const ARENA_ABI = [
  // ── Player ──────────────────────────────────────────────────────────────
  {
    name: "enterMatch",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "enterMatchWithCelo",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [],
  },
  // ── Owner (server) ───────────────────────────────────────────────────────
  {
    name: "completeMatch",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "bytes32" },
      { name: "winner",  type: "address" },
    ],
    outputs: [],
  },
  {
    name: "refundMatch",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "withdrawFees",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "to",     type: "address" },
    ],
    outputs: [],
  },
  {
    name: "withdrawCelo",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "to",     type: "address" },
    ],
    outputs: [],
  },
  // ── Views ────────────────────────────────────────────────────────────────
  {
    name: "getMatch",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [
      { name: "player",    type: "address" },
      { name: "status",    type: "uint8" },
      { name: "startedAt", type: "uint64" },
      { name: "currency",  type: "uint8" },
    ],
  },
  {
    name: "contractBalance",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "celoBalance",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  // ── Events ───────────────────────────────────────────────────────────────
  {
    name: "MatchEntered",
    type: "event",
    inputs: [
      { name: "matchId",   type: "bytes32", indexed: true },
      { name: "player",    type: "address", indexed: true },
      { name: "entryFee",  type: "uint256", indexed: false },
      { name: "currency",  type: "uint8",   indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    name: "MatchCompleted",
    type: "event",
    inputs: [
      { name: "matchId",   type: "bytes32", indexed: true },
      { name: "winner",    type: "address", indexed: true },
      { name: "player",    type: "address", indexed: true },
      { name: "payout",    type: "uint256", indexed: false },
      { name: "currency",  type: "uint8",   indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

// ERC-20 ABI additions needed for approve+allowance
export const APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner",   type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
