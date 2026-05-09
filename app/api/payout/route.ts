import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { redis, getMatch } from "../../lib/redis";
import {
  ERC20_ABI, CUSD_CONTRACT,
  PAYOUT_AMOUNT, PAYOUT_AMOUNT_CELO,
} from "../../lib/cusd";
import { ARENA_ADDRESS, ARENA_ABI, matchIdToBytes32 } from "../../lib/arena";
import {
  GDOLLAR_CONTRACT,
  GDOLLAR_ABI,
  CFA_FORWARDER,
  CFA_FORWARDER_ABI,
  STREAM_FLOW_RATE,
} from "../../lib/gooddollar";
import { ServerMatch } from "../../lib/serverMatch";
import {
  buildPayoutClaimAuthMessage,
  verifyTreasuryActionSignature,
} from "../../lib/treasuryAuth";

interface MatchWagerInfo {
  bothWagered: boolean;
  winnerPayout: bigint;
}

function getMatchWagerInfo(match: ServerMatch): MatchWagerInfo {
  try {
    if (!match.hostWagerTx || !match.joinerWagerTx) return { bothWagered: false, winnerPayout: 0n };
    const hostAmt   = BigInt(match.hostWagerAmount   ?? "0");
    const joinerAmt = BigInt(match.joinerWagerAmount ?? "0");
    const pot = hostAmt + joinerAmt;
    return { bothWagered: true, winnerPayout: pot * 9000n / 10000n };
  } catch {
    return { bothWagered: false, winnerPayout: 0n };
  }
}

const USE_CONTRACT = ARENA_ADDRESS !== "0x0000000000000000000000000000000000000000";
const PAYOUT_LOCK_TTL_SECONDS = 120;

// POST /api/payout
// Body: { matchId: string, currency?: string }
// Returns: { txHash: string, streaming?: boolean }
export async function POST(req: NextRequest) {
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryKey) {
    return NextResponse.json({ error: "Treasury not configured" }, { status: 500 });
  }

  let matchId: string;
  let currency: "cusd" | "celo" | "gdollar" = "cusd";
  let claimantAddress: string;
  let signature: string;
  try {
    const body = await req.json() as { matchId: string; currency?: string; address?: string; signature?: string };
    if (!body.matchId || !body.address) throw new Error("missing fields");
    matchId = body.matchId;
    claimantAddress = body.address;
    signature = body.signature ?? "";
    if (body.currency === "celo")    currency = "celo";
    if (body.currency === "gdollar") currency = "gdollar";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Idempotency — prevent double payout for the same match
  const existingPayout = await redis.get<string>(`payout:${matchId}`);
  if (existingPayout) {
    return NextResponse.json({ txHash: existingPayout, cached: true });
  }

  const lockKey = `payout-lock:${matchId}`;
  const payoutLock = await redis.set(lockKey, Date.now().toString(), { nx: true, ex: PAYOUT_LOCK_TTL_SECONDS });
  if (!payoutLock) {
    return NextResponse.json({ error: "Payout already in progress" }, { status: 409 });
  }

  try {
    const match = await getMatch<ServerMatch>(matchId);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    if (match.mode !== "wager") {
      return NextResponse.json({ error: "Payouts are only available for wager matches" }, { status: 409 });
    }
    if (!match.completedAt || !match.winnerAddress) {
      return NextResponse.json({ error: "Match is not ready for payout" }, { status: 409 });
    }
    const winner = match.winnerAddress as `0x${string}`;
    if (winner.toLowerCase() !== claimantAddress.toLowerCase()) {
      return NextResponse.json({ error: "Only the match winner can claim payout" }, { status: 403 });
    }
    const isValidSignature = await verifyTreasuryActionSignature(
      claimantAddress,
      signature,
      buildPayoutClaimAuthMessage(claimantAddress, matchId, currency),
    );
    if (!isValidSignature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Check if both players wagered and get the actual payout amount from their stakes
    const { bothWagered, winnerPayout: dualPayout } = getMatchWagerInfo(match);
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
          baseFlowRate,
          "0x",
        ],
      });
      txHash = await walletClient.writeContract(request);
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
    } else if (currency === "celo") {
      // Native CELO direct transfer
      const celoAmt = bothWagered && dualPayout > 0n ? dualPayout : PAYOUT_AMOUNT_CELO;
      txHash = await walletClient.sendTransaction({ to: winner, value: celoAmt });
    } else {
      // cUSD direct transfer
      const cusdAmt = bothWagered && dualPayout > 0n ? dualPayout : PAYOUT_AMOUNT;
      const { request } = await publicClient.simulateContract({
        account,
        address: CUSD_CONTRACT,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [winner, cusdAmt],
      });
      txHash = await walletClient.writeContract(request);
    }

    // Record payout so it can't be triggered twice
    await redis.set(`payout:${matchId}`, txHash, { ex: 7200 });

    return NextResponse.json({ txHash, bothWagered });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payout failed";
    console.error("Payout error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}
