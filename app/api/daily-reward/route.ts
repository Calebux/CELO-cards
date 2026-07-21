import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../lib/redis";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import {
  GDOLLAR_CONTRACT,
  GDOLLAR_ABI,
  PAYOUT_AMOUNT_GDOLLAR,
  IDENTITY_CONTRACT,
  IDENTITY_ABI,
} from "../../lib/gooddollar";
import { checkRateLimit } from "../../lib/rateLimit";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Seconds remaining until 00:00 UTC — the per-address claim key expires then,
// so a new day naturally allows one fresh claim.
function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
  return Math.max(60, Math.ceil((midnight - now.getTime()) / 1000));
}

// POST /api/daily-reward
// Body: { address: string }
// Returns: { txHash } | { claimed: true } | { error }
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

  // Rate limit: 3 attempts per address per 10 minutes
  const allowed = await checkRateLimit(`ratelimit:daily-reward:${address.toLowerCase()}`, 3, 600);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
  }

  const publicClient = createPublicClient({ chain: celo, transport: http() });

  // Eligibility (C-04): only a GoodDollar-verified wallet can claim, matching
  // the real UBI claim's gate. This ties the free G$ to a unique verified human
  // instead of any address, so the treasury can't be sprayed across throwaways.
  let isVerified = false;
  try {
    isVerified = await publicClient.readContract({
      address: IDENTITY_CONTRACT,
      abi: IDENTITY_ABI,
      functionName: "isWhitelisted",
      args: [address as `0x${string}`],
    });
  } catch {
    // Identity read failed — fail closed rather than paying an unverified wallet.
    return NextResponse.json({ error: "Could not verify eligibility. Try again." }, { status: 503 });
  }
  if (!isVerified) {
    return NextResponse.json({ error: "Claim your GoodDollar verification to receive daily rewards." }, { status: 403 });
  }

  // Atomic one-time-per-day claim (C-04): reserve the day key before paying so
  // concurrent requests can't both pass and double-pay. Reserving up front also
  // means a failed transfer below releases the key so the user can retry.
  const claimKey = `daily-reward:${address.toLowerCase()}:${todayStr()}`;
  const reserved = await redis.set(claimKey, "1", { nx: true, ex: secondsUntilUtcMidnight() });
  if (!reserved) {
    return NextResponse.json({ claimed: true });
  }

  try {
    const account = privateKeyToAccount(treasuryKey as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: celo, transport: http() });

    // Bounded one-time G$ transfer (was a Superfluid stream with no enforced end).
    const { request } = await publicClient.simulateContract({
      account,
      address: GDOLLAR_CONTRACT,
      abi: GDOLLAR_ABI,
      functionName: "transfer",
      args: [address as `0x${string}`, PAYOUT_AMOUNT_GDOLLAR],
    });
    const txHash = await walletClient.writeContract(request);

    return NextResponse.json({ txHash });
  } catch (e) {
    // Release the day's claim so a genuine retry can succeed.
    await redis.del(claimKey).catch(() => {});
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
