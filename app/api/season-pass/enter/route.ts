import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { redis, getMatch, setMatch } from "../../../lib/redis";
import { ServerMatch } from "../../match/[matchId]/route";
import { ARENA_ADDRESS, ARENA_ABI, matchIdToBytes32 } from "../../../lib/arena";
import { WAGER_AMOUNT_CELO } from "../../../lib/cusd";

// POST /api/season-pass/enter
// Called by the lobby when a season pass holder needs to enter a ranked match.
// Treasury calls enterMatchWithCelo on-chain on the player's behalf, then
// registers the wager TX so the match flow proceeds identically to a normal entry.
export async function POST(req: NextRequest) {
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryKey) {
    return NextResponse.json({ error: "Treasury not configured" }, { status: 500 });
  }

  if (ARENA_ADDRESS === "0x0000000000000000000000000000000000000000") {
    return NextResponse.json({ error: "Arena contract not configured" }, { status: 500 });
  }

  let address: string, matchId: string, role: "host" | "joiner";
  try {
    const body = await req.json() as { address?: string; matchId?: string; role?: string };
    if (!body.address || !body.matchId || (body.role !== "host" && body.role !== "joiner")) {
      throw new Error("missing fields");
    }
    address = body.address;
    matchId = body.matchId;
    role    = body.role;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Verify this address has an active season pass
  const passKey = `season-pass:${address.toLowerCase()}`;
  const raw = await redis.get(passKey) as string | null;
  if (!raw) {
    return NextResponse.json({ error: "No active season pass" }, { status: 403 });
  }
  const { expiry } = JSON.parse(raw) as { expiry: number };
  if (expiry < Date.now()) {
    await redis.del(passKey);
    return NextResponse.json({ error: "Season pass expired" }, { status: 403 });
  }

  // Idempotency — one entry per player per match
  const entryKey = `season-pass-entry:${matchId}:${role}`;
  const existing = await redis.get(entryKey) as string | null;
  if (existing) {
    // Already entered — return the cached tx and re-register in case the lobby missed it
    await registerWagerOnMatch(matchId, role, existing);
    return NextResponse.json({ txHash: existing, cached: true });
  }

  try {
    const account = privateKeyToAccount(treasuryKey as `0x${string}`);

    const publicClient = createPublicClient({
      chain: celo,
      transport: http(),
    });

    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: http(),
    });

    // Pre-check: treasury must have enough CELO for the entry fee
    const treasuryBalance = await publicClient.getBalance({ address: account.address });
    if (treasuryBalance < WAGER_AMOUNT_CELO) {
      console.error(`Treasury balance too low: ${treasuryBalance} < ${WAGER_AMOUNT_CELO}`);
      return NextResponse.json({ error: "Service temporarily unavailable — please pay manually or contact support" }, { status: 503 });
    }

    // Treasury calls enterMatchWithCelo on behalf of the season pass holder
    const matchIdBytes32 = matchIdToBytes32(matchId);
    const { request } = await publicClient.simulateContract({
      account,
      address: ARENA_ADDRESS,
      abi: ARENA_ABI,
      functionName: "enterMatchWithCelo",
      args: [matchIdBytes32],
      value: WAGER_AMOUNT_CELO,
    });

    const txHash = await walletClient.writeContract(request);
    console.log(`SeasonPass enter ${matchId} [${role}] for ${address}: tx ${txHash}`);

    // Cache so duplicate calls return the same tx
    await redis.set(entryKey, txHash, { ex: 3600 });

    // Register the wager on the match record so lobby polling sees both players as paid
    await registerWagerOnMatch(matchId, role, txHash);

    return NextResponse.json({ txHash });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Entry failed";
    console.error("SeasonPass enter error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Write directly to Redis — avoids fragile HTTP self-calls in serverless
async function registerWagerOnMatch(matchId: string, role: "host" | "joiner", txHash: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const match = await getMatch<ServerMatch>(matchId);
      if (!match) return;
      if (role === "host") {
        match.hostWagerTx     = txHash;
        match.hostWagerAmount = WAGER_AMOUNT_CELO.toString();
      } else {
        match.joinerWagerTx     = txHash;
        match.joinerWagerAmount = WAGER_AMOUNT_CELO.toString();
      }
      await setMatch(matchId, match);
      return;
    } catch {
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
    }
  }
  console.error(`registerWagerOnMatch: failed after 5 attempts for ${matchId} [${role}]`);
}
