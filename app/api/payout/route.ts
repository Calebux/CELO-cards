import { NextRequest, NextResponse } from "next/server";
import { redis, getMatch } from "../../lib/redis";
import { ServerMatch } from "../../lib/serverMatch";
import {
  buildPayoutClaimAuthMessage,
  verifyTreasuryActionSignature,
} from "../../lib/treasuryAuth";
import {
  attributeStakeOnChain,
  completeMatchOnChain,
  getArenaMatch,
  waitForArenaReceipt,
} from "../../lib/arenaV2Server";
import { checkRateLimit } from "../../lib/rateLimit";

const PAYOUT_LOCK_TTL_SECONDS = 120;

// Wager payouts are escrow-only: every wager that can be created stakes into
// the verified KnockOrderArenaV2 contract, so settlement always comes from the
// contract's recorded pot to one of its recorded stakers. There is NO direct
// treasury-transfer fallback — Redis wager amounts are caller-supplied and
// must never size a treasury payment (C-02).
const ESCROW_CURRENCIES = new Set(["usdt", "usdc", "cusd"]);

// POST /api/payout
// Body: { matchId: string, currency: string, address: string, signature: string }
// Returns: { txHash: string } (202 + pending:true while the settlement tx is
// still confirming — safe to re-poll).
export async function POST(req: NextRequest) {
  if (!process.env.TREASURY_PRIVATE_KEY) {
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

  // Permanent settlement finality — a match settles exactly once (C-02).
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
    // which asset to be paid in (C-02).
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
    if (!ESCROW_CURRENCIES.has(matchCurrency)) {
      // G$/CELO wager creation is rejected server-side, so this only matches
      // records that predate the escrow-only gate. Those are settled manually.
      return NextResponse.json({ error: "This wager predates escrow settlement — contact support" }, { status: 409 });
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

    // ── ArenaV2 escrow settlement ────────────────────────────────────────────
    // The contract is the sole source of truth for participants and amounts:
    // the winner MUST be one of the two on-chain stakers and is paid 90% of the
    // contract-recorded pot. Forged Redis state can never size or redirect a
    // payment (C-02).
    let arena = await getArenaMatch(matchId);
    if (!arena || !arena.active) {
      // Self-heal: stake attribution at wager time is best-effort (the tx may
      // not have been mined yet). Retry it now from the recorded stake txs
      // before concluding the escrow is missing (H-07).
      const retries: Promise<boolean>[] = [];
      if (match.hostWagerTx && match.host?.address && match.hostWagerAmount) {
        retries.push(attributeStakeOnChain({
          matchId, player: match.host.address, currency: matchCurrency,
          amount: match.hostWagerAmount, txHash: match.hostWagerTx,
        }));
      }
      if (match.joinerWagerTx && match.joiner?.address && match.joinerWagerAmount) {
        retries.push(attributeStakeOnChain({
          matchId, player: match.joiner.address, currency: matchCurrency,
          amount: match.joinerWagerAmount, txHash: match.joinerWagerTx,
        }));
      }
      if (retries.length > 0) {
        await Promise.allSettled(retries);
        arena = await getArenaMatch(matchId);
      }
    }
    if (!arena || !arena.active) {
      return NextResponse.json({ error: "No escrow stakes found for this match" }, { status: 409 });
    }
    const isStaker = arena.stakers.some((s: `0x${string}`) => s.toLowerCase() === winner.toLowerCase());
    if (!isStaker) {
      return NextResponse.json({ error: "Winner is not a participant in this match" }, { status: 403 });
    }

    // A previous attempt may have broadcast but not confirmed before we
    // recorded finality — resolve it before broadcasting again (H-07).
    const attemptKey = `payout-attempt:${matchId}`;
    const priorAttempt = await redis.get<string>(attemptKey);
    if (priorAttempt) {
      const status = await waitForArenaReceipt(priorAttempt as `0x${string}`, 15_000);
      if (status === "success") {
        await redis.set(`payout:${matchId}`, priorAttempt);
        await redis.del(attemptKey).catch(() => {});
        return NextResponse.json({ txHash: priorAttempt, escrow: true });
      }
      if (status === "pending") {
        return NextResponse.json({ txHash: priorAttempt, pending: true, escrow: true }, { status: 202 });
      }
      // Confirmed revert — clear and settle fresh.
      await redis.del(attemptKey).catch(() => {});
    }

    const arenaTx = await completeMatchOnChain(matchId, winner);
    if (!arenaTx) {
      return NextResponse.json({ error: "Escrow settlement failed" }, { status: 500 });
    }
    await redis.set(attemptKey, arenaTx);

    // Only a confirmed receipt becomes permanent finality — a broadcast hash
    // that later reverts must never be cached as a successful payout (H-07).
    const receiptStatus = await waitForArenaReceipt(arenaTx, 30_000);
    if (receiptStatus === "success") {
      await redis.set(`payout:${matchId}`, arenaTx);
      await redis.del(attemptKey).catch(() => {});
      return NextResponse.json({ txHash: arenaTx, escrow: true });
    }
    if (receiptStatus === "reverted") {
      await redis.del(attemptKey).catch(() => {});
      return NextResponse.json({ error: "Escrow settlement reverted" }, { status: 500 });
    }
    // Still confirming — the attempt record lets the next claim resolve it.
    return NextResponse.json({ txHash: arenaTx, pending: true, escrow: true }, { status: 202 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payout failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}
