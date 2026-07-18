// KnockOrderSignups — on-chain signup registry on Celo mainnet.
// Players call signUp() once with their own wallet (web/mobile); the owner
// can record MiniPay users via signUpFor(player). Both emit SignedUp with
// the player address indexed, so indexers count unique players either way.

export const SIGNUPS_CONTRACT = (
  process.env.NEXT_PUBLIC_SIGNUPS_CONTRACT ?? "0x0000000000000000000000000000000000000000"
) as `0x${string}`;

export const SIGNUPS_ABI = [
  {
    name: "signUp",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "signUpFor",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "player", type: "address" }],
    outputs: [],
  },
  {
    name: "hasSignedUp",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "totalSignups",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "SignedUp",
    type: "event",
    inputs: [
      { name: "player",    type: "address", indexed: true },
      { name: "index",     type: "uint256", indexed: true },
      { name: "sponsored", type: "bool",    indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;
