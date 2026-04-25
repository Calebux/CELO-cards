import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../lib/redis";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import {
  GDOLLAR_CONTRACT,
  CFA_FORWARDER,
  CFA_FORWARDER_ABI,
  STREAM_FLOW_RATE,
} from "../../lib/gooddollar";

const CLAIMS_KEY = "daily-claims";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readClaims(): Promise<Record<string, string>> {
  const data = await redis.get<Record<string, string>>(CLAIMS_KEY);
  return data ?? {};
}

async function writeClaims(claims: Record<string, string>): Promise<void> {
  await redis.set(CLAIMS_KEY, claims);
}

// POST /api/daily-reward
// Body: { address: string }
// Returns: { txHash, streaming: true } | { claimed: true }
export async function POST(req: NextRequest) {
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryKey) {
    return NextResponse.json({ error: "Treasury not configured" }, { status: 500 });
  }

  let address: string;
  try {
    const body = await req.json() as { address: string };
    if (!body.address || !/^0x[0-9a-fA-F]{40}$/.test(body.address)) throw new Error("invalid address");
    address = body.address;
  } catch {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const today = todayStr();
  const claims = await readClaims();
  const key = address.toLowerCase();

  if (claims[key] === today) {
    return NextResponse.json({ claimed: true });
  }

  try {
    const account = privateKeyToAccount(treasuryKey as `0x${string}`);

    const publicClient = createPublicClient({ chain: celo, transport: http() });
    const walletClient = createWalletClient({ account, chain: celo, transport: http() });

    // Check if a stream already exists from treasury to this address
    const existingRate = await publicClient.readContract({
      address: CFA_FORWARDER,
      abi: CFA_FORWARDER_ABI,
      functionName: "getFlowrate",
      args: [GDOLLAR_CONTRACT, account.address, address as `0x${string}`],
    });

    let txHash: string;
    if (existingRate > 0n) {
      // Stream already running — no new tx needed
      txHash = "existing-stream";
    } else {
      const { request } = await publicClient.simulateContract({
        account,
        address: CFA_FORWARDER,
        abi: CFA_FORWARDER_ABI,
        functionName: "createFlow",
        args: [
          GDOLLAR_CONTRACT,
          account.address,
          address as `0x${string}`,
          STREAM_FLOW_RATE,
          "0x",
        ],
      });
      txHash = await walletClient.writeContract(request);
    }

    claims[key] = today;
    await writeClaims(claims);

    console.log(`Daily reward: G$ stream to ${address} — tx ${txHash}`);
    return NextResponse.json({ txHash, streaming: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    console.error("Daily reward error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
