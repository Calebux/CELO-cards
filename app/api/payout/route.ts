import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { ERC20_ABI, CUSD_CONTRACT, PAYOUT_AMOUNT, PAYOUT_AMOUNT_CELO } from "../../lib/cusd";
import { ARENA_ADDRESS, ARENA_ABI, matchIdToBytes32 } from "../../lib/arena";

const USE_CONTRACT = ARENA_ADDRESS !== "0x0000000000000000000000000000000000000000";

// POST /api/payout
// Body: { winner: `0x${string}`, matchId: string }
// Returns: { txHash: string }
export async function POST(req: NextRequest) {
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryKey) {
    return NextResponse.json({ error: "Treasury not configured" }, { status: 500 });
  }

  let winner: `0x${string}`;
  let matchId: string;
  let currency: "cusd" | "celo" = "cusd";
  try {
    const body = await req.json() as { winner: string; matchId: string; currency?: string };
    if (!body.winner || !body.matchId) throw new Error("missing fields");
    winner = body.winner as `0x${string}`;
    matchId = body.matchId;
    if (body.currency === "celo") currency = "celo";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Basic address validation
  if (!/^0x[0-9a-fA-F]{40}$/.test(winner)) {
    return NextResponse.json({ error: "Invalid winner address" }, { status: 400 });
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

    let txHash: `0x${string}`;

    if (USE_CONTRACT) {
      // Call arena.completeMatch — emits MatchCompleted event for Talent Protocol indexing
      const { request } = await publicClient.simulateContract({
        account,
        address: ARENA_ADDRESS,
        abi: ARENA_ABI,
        functionName: "completeMatch",
        args: [matchIdToBytes32(matchId), winner],
      });
      txHash = await walletClient.writeContract(request);
      console.log(`Payout ${matchId}: completeMatch(${winner}) — tx ${txHash}`);
    } else {
      // Fallback: direct transfer (no contract deployed)
      if (currency === "celo") {
        // Native CELO payout
        txHash = await walletClient.sendTransaction({
          to: winner,
          value: PAYOUT_AMOUNT_CELO,
        });
        console.log(`Payout ${matchId}: direct CELO transfer to ${winner} — tx ${txHash}`);
      } else {
        // cUSD payout
        const { request } = await publicClient.simulateContract({
          account,
          address: CUSD_CONTRACT,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [winner, PAYOUT_AMOUNT],
        });
        txHash = await walletClient.writeContract(request);
        console.log(`Payout ${matchId}: direct transfer ${parseUnits("0.18", 18)} cUSD to ${winner} — tx ${txHash}`);
      }
    }

    return NextResponse.json({ txHash });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payout failed";
    console.error("Payout error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
