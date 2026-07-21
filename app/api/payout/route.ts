import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { redis, getMatch } from "../../lib/redis";
import {
  ERC20_ABI, CUSD_CONTRACT, USDT_CONTRACT, USDC_CONTRACT,
  PAYOUT_AMOUNT, PAYOUT_AMOUNT_CELO, PAYOUT_AMOUNT_USDT,
} from "../../lib/cusd";
import { ARENA_ADDRESS, ARENA_ABI, matchIdToBytes32 } from "../../lib/arena";
import {
  GDOLLAR_CONTRACT,
  GDOLLAR_ABI,
  PAYOUT_AMOUNT_GDOLLAR,
} from "../../lib/gooddollar";
import { ServerMatch } from "../../lib/serverMatch";
import {
  buildPayoutClaimAuthMessage,
  verifyTreasuryActionSignature,
} from "../../lib/treasuryAuth";
import { completeMatchOnChain, getArenaMatch } from "../../lib/arenaV2Server";
import { checkRateLimit } from "../../lib/rateLimit";

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
// Returns: { txHash: string }
export async function POST(req: NextRequest) {
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryKey) {
    return NextResponse.json({ error: "Treasury not configured" }, { status: 500 });
  }

  let matchId: string;
  let currency: "cusd" | "celo" | "gdollar" | "usdt" | "usdc" = "cusd";
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
    if (body.currency === "usdt")    currency = "usdt";
    if (body.currency === "usdc")    currency = "usdc";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Rate limit: 5 payout attempts per address per minute
  const allowed = await checkRateLimit(`ratelimit:payout:${claimantAddress.toLowerCase()}`, 5, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
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

    // Derive the payout currency from match state — the caller cannot choose
    // which treasury asset to be paid in (C-02).
    const hostCur = match.hostWagerCurrency;
    const joinCur = match.joinerWagerCurrency;
    if (hostCur && joinCur && hostCur !== joinCur) {
      return NextResponse.json({ error: "Wager currency mismatch" }, { status: 409 });
    }
    const matchCurrency = hostCur ?? joinCur;
    if (!matchCurrency) {
      return NextResponse.json({ error: "Match has no recorded wager currency" }, { status: 409 });
    }
    if (currency !== matchCurrency) {
      return NextResponse.json({ error: "Currency does not match the wager" }, { status: 403 });
    }

    // Every payout claim must be signed by the winner's wallet. (MiniPay wagers
    // are disabled, so there is no legitimate unsigned-claim path — the previous
    // isMiniPay bypass is removed, C-02.)
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

    // ── ArenaV2 escrow path ──────────────────────────────────────────────────
    // Stablecoin stakes land in the verified KnockOrderArenaV2 contract. When an
    // on-chain match is Active, the escrow is the source of truth: the winner
    // MUST be one of the two real stakers, and the payout comes from the pot the
    // contract recorded (90%). This binds settlement to actual participants and
    // amounts even though the Redis match state is forgeable — so a forged
    // winnerAddress pointing at a non-participant can never be paid, and an
    // active escrow match never falls back to a direct treasury transfer (C-02).
    if (currency === "usdt" || currency === "usdc" || currency === "cusd") {
      const arena = await getArenaMatch(matchId);
      if (arena && arena.active) {
        const isStaker = arena.stakers.some((s: `0x${string}`) => s.toLowerCase() === winner.toLowerCase());
        if (!isStaker) {
          return NextResponse.json({ error: "Winner is not a participant in this match" }, { status: 403 });
        }
        const arenaTx = await completeMatchOnChain(matchId, winner);
        if (!arenaTx) {
          return NextResponse.json({ error: "Escrow settlement failed" }, { status: 500 });
        }
        // Permanent settlement record — a match settles exactly once.
        await redis.set(`payout:${matchId}`, arenaTx);
        return NextResponse.json({ txHash: arenaTx, bothWagered, escrow: true });
      }
      // No active escrow match → legacy/direct fall-through below.
    }

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

    // ── G$ path: bounded one-time transfer ───────────────────────────────────
    // Previously a Superfluid stream, which had no enforced end (it ran until
    // the treasury drained). Now a single fixed-amount ERC-20 transfer, capped
    // at exactly the winner payout.
    if (currency === "gdollar") {
      const gdollarAmt = bothWagered && dualPayout > 0n ? dualPayout : PAYOUT_AMOUNT_GDOLLAR;
      const { request } = await publicClient.simulateContract({
        account,
        address: GDOLLAR_CONTRACT,
        abi: GDOLLAR_ABI,
        functionName: "transfer",
        args: [winner, gdollarAmt],
      });
      txHash = await walletClient.writeContract(request);
      await redis.set(`payout:${matchId}`, txHash);
      return NextResponse.json({ txHash, bothWagered });
    }

    // ── Arena contract path ───────────────────────────────────────────────────
    // USDT/USDC stakes are always direct treasury transfers, and MiniPay
    // USDm (cusd) stakes are too — those never entered the arena contract,
    // so their payouts must also be direct transfers.
    if (USE_CONTRACT && currency !== "usdt" && currency !== "usdc") {
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
    } else if (currency === "usdt" || currency === "usdc") {
      const stableAmt = bothWagered && dualPayout > 0n ? dualPayout : PAYOUT_AMOUNT_USDT;
      const { request } = await publicClient.simulateContract({
        account,
        address: currency === "usdc" ? USDC_CONTRACT : USDT_CONTRACT,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [winner, stableAmt],
      });
      txHash = await walletClient.writeContract(request);
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

    // Permanent settlement record — a match settles exactly once (no TTL that
    // would restore claimability, C-02).
    await redis.set(`payout:${matchId}`, txHash);

    return NextResponse.json({ txHash, bothWagered });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payout failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}
