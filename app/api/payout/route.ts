import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { redis, getMatch } from "../../lib/redis";
import { ServerMatch } from "../match/[matchId]/route";
import {
  ERC20_ABI, CUSD_CONTRACT,
  PAYOUT_AMOUNT, PAYOUT_AMOUNT_CELO,
  DUAL_WAGER_PAYOUT, DUAL_WAGER_PAYOUT_CELO,
} from "../../lib/cusd";
import { ARENA_ADDRESS, ARENA_ABI, matchIdToBytes32 } from "../../lib/arena";
import {
  GDOLLAR_CONTRACT,
  GDOLLAR_ABI,
  PAYOUT_AMOUNT_GDOLLAR,
  CFA_FORWARDER,
  CFA_FORWARDER_ABI,
  STREAM_FLOW_RATE,
  STREAM_FLOW_RATE_DUAL,
} from "../../lib/gooddollar";

interface MatchWagerInfo {
  bothWagered: boolean;
  winnerPayout: bigint;
}

async function getMatchWagerInfo(matchId: string): Promise<MatchWagerInfo> {
  try {
    const match = await getMatch<ServerMatch>(matchId);
    if (!match?.hostWagerTx || !match?.joinerWagerTx) return { bothWagered: false, winnerPayout: 0n };
    const hostAmt   = BigInt(match.hostWagerAmount   ?? "0");
    const joinerAmt = BigInt(match.joinerWagerAmount ?? "0");
    const pot = hostAmt + joinerAmt;
    return { bothWagered: true, winnerPayout: pot * 9000n / 10000n };
  } catch {
    return { bothWagered: false, winnerPayout: 0n };
  }
}

const USE_CONTRACT = ARENA_ADDRESS !== "0x0000000000000000000000000000000000000000";

// POST /api/payout
// Body: { winner: `0x${string}`, matchId: string, currency?: string }
// Returns: { txHash: string, streaming?: boolean }
export async function POST(req: NextRequest) {
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryKey) {
    return NextResponse.json({ error: "Treasury not configured" }, { status: 500 });
  }

  let winner: `0x${string}`;
  let matchId: string;
  let currency: "cusd" | "celo" | "gdollar" = "cusd";
  let mult = 1n;
  try {
    const body = await req.json() as { winner: string; matchId: string; currency?: string; multiplier?: number };
    if (!body.winner || !body.matchId) throw new Error("missing fields");
    winner = body.winner as `0x${string}`;
    matchId = body.matchId;
    if (body.currency === "celo")    currency = "celo";
    if (body.currency === "gdollar") currency = "gdollar";
    // Clamp multiplier to 1 or 2 (double-down)
    if (typeof body.multiplier === "number" && body.multiplier >= 2) mult = 2n;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Basic address validation
  if (!/^0x[0-9a-fA-F]{40}$/.test(winner)) {
    return NextResponse.json({ error: "Invalid winner address" }, { status: 400 });
  }

  // Idempotency — prevent double payout for the same match
  const existingPayout = await redis.get<string>(`payout:${matchId}`);
  if (existingPayout) {
    console.log(`Payout ${matchId}: already paid — returning cached tx ${existingPayout}`);
    return NextResponse.json({ txHash: existingPayout, cached: true });
  }

  // Check if both players wagered and get the actual payout amount from their stakes
  const { bothWagered, winnerPayout: dualPayout } = await getMatchWagerInfo(matchId);

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

    let txHash: `0x${string}`;

    // ── G$ path: stream payout via Superfluid CFAv1Forwarder ─────────────────
    if (currency === "gdollar") {
      // Both-wagered → flow rate from actual stakes (90% of pot over 24h); solo → standard rate
      const baseFlowRate = bothWagered && dualPayout > 0n
        ? dualPayout / 86_400n
        : STREAM_FLOW_RATE;
      const { request } = await publicClient.simulateContract({
        account,
        address: CFA_FORWARDER,
        abi: CFA_FORWARDER_ABI,
        functionName: "createFlow",
        args: [
          GDOLLAR_CONTRACT,
          account.address,
          winner,
          baseFlowRate * mult,
          "0x",
        ],
      });
      txHash = await walletClient.writeContract(request);
      const payoutTag = bothWagered ? "dual-wager" : "solo";
      console.log(`Payout ${matchId} [${payoutTag}]: G$ stream started to ${winner} @ ${baseFlowRate * mult} wei/sec (×${mult}) — tx ${txHash}`);
      // Note: stream auto-expires on Superfluid after the token balance is drained;
      // serverless setTimeout cannot be used here (function lifetime too short).
      await redis.set(`payout:${matchId}`, txHash, { ex: 7200 });
      return NextResponse.json({ txHash, streaming: true });
    }

    // ── Arena contract path ───────────────────────────────────────────────────
    if (USE_CONTRACT) {
      const { request } = await publicClient.simulateContract({
        account,
        address: ARENA_ADDRESS,
        abi: ARENA_ABI,
        functionName: "completeMatch",
        args: [matchIdToBytes32(matchId), winner],
      });
      txHash = await walletClient.writeContract(request);
      console.log(`Payout ${matchId}: completeMatch(${winner}) — tx ${txHash}`);
    } else if (currency === "celo") {
      // Native CELO direct transfer
      const celoAmt = (bothWagered && dualPayout > 0n ? dualPayout : PAYOUT_AMOUNT_CELO) * mult;
      txHash = await walletClient.sendTransaction({ to: winner, value: celoAmt });
      console.log(`Payout ${matchId} [${bothWagered ? "dual" : "solo"}]: direct CELO ${formatUnits(celoAmt, 18)} (×${mult}) to ${winner} — tx ${txHash}`);
    } else {
      // cUSD direct transfer
      const cusdAmt = (bothWagered && dualPayout > 0n ? dualPayout : PAYOUT_AMOUNT) * mult;
      const { request } = await publicClient.simulateContract({
        account,
        address: CUSD_CONTRACT,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [winner, cusdAmt],
      });
      txHash = await walletClient.writeContract(request);
      console.log(`Payout ${matchId} [${bothWagered ? "dual" : "solo"}]: direct transfer ${formatUnits(cusdAmt, 18)} cUSD (×${mult}) to ${winner} — tx ${txHash}`);
    }

    // Record payout so it can't be triggered twice
    await redis.set(`payout:${matchId}`, txHash, { ex: 7200 });

    return NextResponse.json({ txHash, bothWagered });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payout failed";
    console.error("Payout error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

