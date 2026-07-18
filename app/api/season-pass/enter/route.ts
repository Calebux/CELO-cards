import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { redis, getMatch, setMatch } from "../../../lib/redis";
import { ARENA_ADDRESS, ARENA_ABI, matchIdToBytes32 } from "../../../lib/arena";
import { WAGER_AMOUNT_CELO } from "../../../lib/cusd";
import { ServerMatch } from "../../../lib/serverMatch";
import { checkRateLimit } from "../../../lib/rateLimit";

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
  let playerTxHash: `0x${string}` | null = null;
  try {
    const body = await req.json() as { address?: string; matchId?: string; role?: string; txHash?: string };
    if (!body.address || !body.matchId || (body.role !== "host" && body.role !== "joiner")) {
      throw new Error("missing fields");
    }
    address = body.address;
    matchId = body.matchId;
    role = body.role;
    if (typeof body.txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(body.txHash)) {
      playerTxHash = body.txHash as `0x${string}`;
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Rate limit: 10 entry attempts per address per minute
  const allowed = await checkRateLimit(`ratelimit:season-enter:${address.toLowerCase()}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
  }

  // Check free games before season pass — allows entry without a pass
  const freeGamesKey = `free-games:${address.toLowerCase()}`;
  const freeGamesUsed = Number(await redis.get(freeGamesKey)) || 0;
  const hasFreeGames = freeGamesUsed < 2;

  const passKey = `season-pass:${address.toLowerCase()}`;
  const rawPassData = await redis.get<unknown>(passKey);
  const passData = typeof rawPassData === "string"
    ? (() => {
        try { return JSON.parse(rawPassData) as { expiry?: number }; } catch { return null; }
      })()
    : rawPassData as { expiry?: number } | null;

  let hasActivePass = false;
  if (passData) {
    const expiry = Number(passData.expiry);
    if (Number.isFinite(expiry) && expiry >= Date.now()) {
      hasActivePass = true;
    } else {
      await redis.del(passKey);
    }
  }

  if (!hasActivePass && !hasFreeGames) {
    return NextResponse.json({ error: "No active season pass and free games exhausted" }, { status: 403 });
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

  // Player-signed entry (web/mobile): the player's own wallet already called
  // enterMatchWithCelo, so their address is the on-chain sender. Verify the tx
  // and record it — no treasury entry needed.
  if (playerTxHash) {
    try {
      const publicClient = createPublicClient({ chain: celo, transport: http() });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: playerTxHash, timeout: 30_000 });
      if (receipt.status !== "success") {
        return NextResponse.json({ error: "Entry transaction reverted" }, { status: 403 });
      }
      const expectedId = matchIdToBytes32(`${matchId}:${role}`).toLowerCase();
      const entries = parseEventLogs({ abi: ARENA_ABI, eventName: "MatchEntered", logs: receipt.logs });
      const ok = entries.some(l =>
        l.address.toLowerCase() === ARENA_ADDRESS.toLowerCase() &&
        l.args.matchId.toLowerCase() === expectedId &&
        l.args.player.toLowerCase() === address.toLowerCase()
      );
      if (!ok) {
        return NextResponse.json({ error: "MatchEntered event not found for player" }, { status: 403 });
      }
      await redis.set(entryKey, playerTxHash, { ex: 3600 });
      await registerEntryOnMatch(matchId, role, playerTxHash);
      return NextResponse.json({ txHash: playerTxHash, selfSigned: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Entry verification failed";
      return NextResponse.json({ error: msg }, { status: 403 });
    }
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
}
