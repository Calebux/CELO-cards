import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { redis, getMatch, setMatch } from "../../../lib/redis";
import { ARENA_ADDRESS, ARENA_ABI, matchIdToBytes32 } from "../../../lib/arena";
import { WAGER_AMOUNT_CELO } from "../../../lib/cusd";
import { ServerMatch } from "../../../lib/serverMatch";

// POST /api/season-pass/enter
// Called by the lobby when a season pass holder needs an on-chain ranked entry.
// Treasury pays the fixed arena entry, then the tx is recorded on the shared match
// so the existing lobby "both paid" flow can proceed.
export async function POST(req: NextRequest) {
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryKey) {
    return NextResponse.json({ error: "Treasury not configured" }, { status: 500 });
  }

  if (ARENA_ADDRESS === "0x0000000000000000000000000000000000000000") {
    return NextResponse.json({ error: "Arena contract not configured" }, { status: 500 });
  }

  let address: string;
  let matchId: string;
  let role: "host" | "joiner";
  try {
    const body = await req.json() as { address?: string; matchId?: string; role?: string };
    if (!body.address || !body.matchId || (body.role !== "host" && body.role !== "joiner")) {
      throw new Error("missing fields");
    }
    address = body.address;
    matchId = body.matchId;
    role = body.role;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const passKey = `season-pass:${address.toLowerCase()}`;
  const passData = await redis.get<{ expiry: number }>(passKey);
  if (!passData) {
    return NextResponse.json({ error: "No active season pass" }, { status: 403 });
  }
  if (passData.expiry < Date.now()) {
    await redis.del(passKey);
    return NextResponse.json({ error: "Season pass expired" }, { status: 403 });
  }

  const match = await getMatch<ServerMatch>(matchId);
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.mode !== "ranked") {
    return NextResponse.json({ error: "Sponsored entry is only available for ranked matches" }, { status: 409 });
  }
  const expectedAddress = role === "host" ? match.host.address : match.joiner.address;
  if (!expectedAddress || expectedAddress.toLowerCase() !== address.toLowerCase()) {
    return NextResponse.json({ error: "Address does not match ranked player slot" }, { status: 409 });
  }

  const entryKey = `season-pass-entry:${matchId}:${role}`;
  const cachedTx = await redis.get<string>(entryKey);
  if (cachedTx) {
    await registerEntryOnMatch(matchId, role, cachedTx);
    return NextResponse.json({ txHash: cachedTx, cached: true });
  }

  try {
    const account = privateKeyToAccount(treasuryKey as `0x${string}`);
    const publicClient = createPublicClient({ chain: celo, transport: http() });
    const walletClient = createWalletClient({ account, chain: celo, transport: http() });

    const treasuryBalance = await publicClient.getBalance({ address: account.address });
    if (treasuryBalance < WAGER_AMOUNT_CELO) {
      return NextResponse.json({ error: "Treasury balance too low for ranked entry" }, { status: 503 });
    }

    // The treasury is the on-chain sender for both players, so the role is included
    // in the contract match id to avoid duplicate sender collisions.
    const rankedEntryId = matchIdToBytes32(`${matchId}:${role}`);
    const { request } = await publicClient.simulateContract({
      account,
      address: ARENA_ADDRESS,
      abi: ARENA_ABI,
      functionName: "enterMatchWithCelo",
      args: [rankedEntryId],
      value: WAGER_AMOUNT_CELO,
    });

    const txHash = await walletClient.writeContract(request);
    await redis.set(entryKey, txHash, { ex: 3600 });
    await registerEntryOnMatch(matchId, role, txHash);

    return NextResponse.json({ txHash });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ranked entry failed";
    console.error("Season pass ranked entry error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function registerEntryOnMatch(matchId: string, role: "host" | "joiner", txHash: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const match = await getMatch<ServerMatch>(matchId);
      if (!match) return;
      if (role === "host") {
        match.hostWagerTx = txHash;
        match.hostWagerAmount = WAGER_AMOUNT_CELO.toString();
      } else {
        match.joinerWagerTx = txHash;
        match.joinerWagerAmount = WAGER_AMOUNT_CELO.toString();
      }
      await setMatch(matchId, match);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));
    }
  }
  console.error(`registerEntryOnMatch failed for ${matchId} [${role}]`);
}
