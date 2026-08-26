import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../lib/redis";
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import {
  GDOLLAR_CONTRACT,
  GDOLLAR_ABI,
  resolveGoodDollarIdentity,
} from "../../lib/gooddollar";
import { checkRateLimit } from "../../lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * 100 G$ — the price of a season pass, so it is spendable rather than dust.
 * A player who buys a pass with it produces a second on-chain interaction from
 * their own wallet, which is worth more than this one.
 */
const WELCOME_AMOUNT = parseEther("100");

/** A year: the point is that nobody is ever welcomed twice. */
const WELCOME_TTL_SECONDS = 365 * 24 * 60 * 60;

/**
 * POST /api/welcome-bonus  — body { address }
 *
 * Pays a newly GoodDollar-verified player once, unprompted. The client only
 * says "this address is here"; everything that decides whether money moves is
 * checked here — the wallet must actually be whitelisted on-chain, and the
 * claim is reserved before the transfer so two calls cannot both pay.
 *
 * Why it exists: a player who verifies and then only plays VS House leaves no
 * on-chain trace at all, because those matches settle in Redis. This gives
 * every verified player one interaction with the treasury, which is what makes
 * them visible to anyone counting from the chain rather than from our database.
 *
 * Keyed on the GoodDollar identity root, not the wallet, for the same reason
 * the daily reward is: otherwise one person with several linked wallets is
 * welcomed once per wallet.
 */
export async function POST(req: NextRequest) {
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryKey) {
    return NextResponse.json({ error: "Treasury not configured" }, { status: 503 });
  }

  let body: { address?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = body.address?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  // This is pinged on load, so most calls are a no-op for someone already
  // welcomed. The limit is here to stop a loop hammering the identity contract.
  if (!(await checkRateLimit(`welcome:${address}`, 5, 300))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const publicClient = createPublicClient({ chain: celo, transport: http() });

  let identity;
  try {
    identity = await resolveGoodDollarIdentity(publicClient, address);
  } catch {
    // Fail closed: never pay a wallet whose verification we could not read.
    return NextResponse.json({ error: "Could not verify eligibility" }, { status: 503 });
  }
  if (!identity.isVerified) {
    return NextResponse.json({ verified: false });
  }

  // Reserve before paying, so concurrent calls cannot both transfer. A failed
  // transfer below releases it again.
  const claimKey = `welcome:${identity.identityKey}`;
  const reserved = await redis.set(claimKey, Date.now(), { nx: true, ex: WELCOME_TTL_SECONDS });
  if (!reserved) {
    return NextResponse.json({ alreadySent: true });
  }

  try {
    const account = privateKeyToAccount(treasuryKey as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: celo, transport: http() });

    // simulateContract estimates the gas. G$ is not a plain ERC-20 — a transfer
    // to a new holder measures around 229,000 — so a hardcoded limit is how you
    // send a batch that all reverts.
    const { request } = await publicClient.simulateContract({
      account,
      address: GDOLLAR_CONTRACT,
      abi: GDOLLAR_ABI,
      functionName: "transfer",
      args: [address as `0x${string}`, WELCOME_AMOUNT],
    });
    const txHash = await walletClient.writeContract(request);

    return NextResponse.json({ sent: true, txHash });
  } catch (e) {
    await redis.del(claimKey).catch(() => {});
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
