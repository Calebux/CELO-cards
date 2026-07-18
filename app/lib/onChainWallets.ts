// Wallet identities, read from Celo event logs via the Etherscan V2 API.
//
// The contracts expose no enumerable address array — only mappings — so the set
// of wallets that ever signed up or bought a pass exists only in events.
//
// This deliberately does NOT use eth_getLogs against a public RPC. Those cap the
// range at ~1000 blocks (Alchemy's free tier: 10), which turns a few days of
// Celo's ~1s blocks into hundreds of requests, and — worse — forno returns an
// empty array rather than an error on roughly 2 of every 5 queries. A silent
// empty is indistinguishable from a genuinely empty range, so a single-provider
// scan drops events without any failure surfacing. The Etherscan API returns the
// full history in one request, deterministically.

import { decodeEventLog } from "viem";
import { SIGNUPS_CONTRACT } from "./signupsContract";
import { GDOLLAR_SEASON_PASS_CONTRACT } from "./gdollarSeasonPassContract";

const CELO_CHAIN_ID = 42220;
const API_BASE = "https://api.etherscan.io/v2/api";
const PAGE_SIZE = 1000; // Etherscan's max records per page

const SIGNED_UP_EVENT = {
  name: "SignedUp",
  type: "event",
  inputs: [
    { name: "player", type: "address", indexed: true },
    { name: "index", type: "uint256", indexed: true },
    { name: "sponsored", type: "bool", indexed: false },
    { name: "timestamp", type: "uint256", indexed: false },
  ],
} as const;

const PASS_PURCHASED_EVENT = {
  name: "PassPurchased",
  type: "event",
  inputs: [
    { name: "buyer", type: "address", indexed: true },
    { name: "plan", type: "string", indexed: false },
    { name: "amount", type: "uint256", indexed: false },
    { name: "totalSold", type: "uint256", indexed: false },
  ],
} as const;

type EtherscanLog = { topics: `0x${string}`[]; data: `0x${string}` };

export type OnChainWallets = {
  /** Every address that has ever called signUp(), agent wallets included. */
  signers: string[];
  /** Every address that has ever bought a G$ season pass. */
  buyers: string[];
};

async function fetchLogs(address: string): Promise<EtherscanLog[]> {
  const apiKey = process.env.CELOSCAN_API_KEY;
  if (!apiKey) throw new Error("CELOSCAN_API_KEY is not set — cannot read on-chain event logs");

  const out: EtherscanLog[] = [];

  // Paginate defensively. Both contracts are far under one page today, but a
  // truncated page would silently understate wallet counts as usage grows.
  for (let page = 1; ; page++) {
    const url =
      `${API_BASE}?chainid=${CELO_CHAIN_ID}&module=logs&action=getLogs` +
      `&address=${address}&fromBlock=0&toBlock=99999999` +
      `&page=${page}&offset=${PAGE_SIZE}&apikey=${apiKey}`;

    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`Etherscan API HTTP ${res.status} for ${address}`);

    const body = (await res.json()) as { status: string; message: string; result: EtherscanLog[] | string };

    // status "0" with "No records found" is a legitimate empty result; any other
    // status "0" is an error and must throw rather than read as zero events.
    if (body.status !== "1") {
      if (typeof body.result === "string" && /no records found/i.test(body.message)) break;
      throw new Error(`Etherscan API error for ${address}: ${body.message} ${String(body.result)}`);
    }
    if (!Array.isArray(body.result)) throw new Error(`Etherscan API returned no array for ${address}`);

    out.push(...body.result);
    if (body.result.length < PAGE_SIZE) break;
  }

  return out;
}

/**
 * All wallets that have touched the signups or G$ season pass contracts.
 * Throws rather than returning partial data — callers reconcile the signer count
 * against totalSignups, and a silent undercount would defeat that check.
 */
export async function getOnChainWallets(): Promise<OnChainWallets> {
  const [signupLogs, passLogs] = await Promise.all([
    fetchLogs(SIGNUPS_CONTRACT),
    fetchLogs(GDOLLAR_SEASON_PASS_CONTRACT),
  ]);

  const signers = new Set<string>();
  const buyers = new Set<string>();

  for (const log of signupLogs) {
    const decoded = decodeEventLog({ abi: [SIGNED_UP_EVENT], data: log.data, topics: log.topics as never });
    signers.add((decoded.args.player as string).toLowerCase());
  }
  for (const log of passLogs) {
    const decoded = decodeEventLog({ abi: [PASS_PURCHASED_EVENT], data: log.data, topics: log.topics as never });
    buyers.add((decoded.args.buyer as string).toLowerCase());
  }

  return { signers: [...signers], buyers: [...buyers] };
}
