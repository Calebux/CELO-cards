import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { ERC20_ABI, CUSD_CONTRACT, PAYOUT_AMOUNT, PAYOUT_AMOUNT_CELO } from "../../lib/cusd";
import { ARENA_ADDRESS, ARENA_ABI, matchIdToBytes32 } from "../../lib/arena";
import {
  GDOLLAR_CONTRACT,
  GDOLLAR_ABI,
  PAYOUT_AMOUNT_GDOLLAR,
  CFA_FORWARDER,
  CFA_FORWARDER_ABI,
  STREAM_FLOW_RATE,
} from "../../lib/gooddollar";

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
  try {
    const body = await req.json() as { winner: string; matchId: string; currency?: string };
    if (!body.winner || !body.matchId) throw new Error("missing fields");
    winner = body.winner as `0x${string}`;
    matchId = body.matchId;
    if (body.currency === "celo")    currency = "celo";
    if (body.currency === "gdollar") currency = "gdollar";
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

    // ── G$ path: stream payout via Superfluid CFAv1Forwarder ─────────────────
    if (currency === "gdollar") {
      // Create a Superfluid stream from treasury → winner at STREAM_FLOW_RATE wei/sec
      // At this rate, 0.000007 G$ arrives over 24 hours
      const { request } = await publicClient.simulateContract({
        account,
        address: CFA_FORWARDER,
        abi: CFA_FORWARDER_ABI,
        functionName: "createFlow",
        args: [
          GDOLLAR_CONTRACT,
          account.address,
          winner,
          STREAM_FLOW_RATE,       // int96 flow rate (wei/sec)
          "0x",                   // userData
        ],
      });
      txHash = await walletClient.writeContract(request);
      console.log(`Payout ${matchId}: G$ stream started to ${winner} @ ${STREAM_FLOW_RATE} wei/sec — tx ${txHash}`);

      // Schedule stream deletion after 24h (fire and forget — best effort)
      void scheduleStreamDeletion(walletClient, account, account.address, winner).catch((e) =>
        console.error("Stream deletion scheduling failed:", e)
      );

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
      txHash = await walletClient.sendTransaction({
        to: winner,
        value: PAYOUT_AMOUNT_CELO,
      });
      console.log(`Payout ${matchId}: direct CELO ${formatUnits(PAYOUT_AMOUNT_CELO, 18)} to ${winner} — tx ${txHash}`);
    } else {
      // cUSD direct transfer
      const { request } = await publicClient.simulateContract({
        account,
        address: CUSD_CONTRACT,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [winner, PAYOUT_AMOUNT],
      });
      txHash = await walletClient.writeContract(request);
      console.log(`Payout ${matchId}: direct transfer ${formatUnits(PAYOUT_AMOUNT, 18)} cUSD to ${winner} — tx ${txHash}`);
    }

    return NextResponse.json({ txHash });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payout failed";
    console.error("Payout error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Best-effort: delete the G$ stream after 24 hours so treasury doesn't keep draining
async function scheduleStreamDeletion(
  walletClient: ReturnType<typeof createWalletClient>,
  account: ReturnType<typeof privateKeyToAccount>,
  sender: `0x${string}`,
  receiver: `0x${string}`
) {
  await new Promise((resolve) => setTimeout(resolve, 86_400_000)); // 24h
  await walletClient.writeContract({
    address: CFA_FORWARDER,
    abi: CFA_FORWARDER_ABI,
    functionName: "deleteFlow",
    args: [GDOLLAR_CONTRACT, sender, receiver, "0x"],
    account,
    chain: celo,
  });
  console.log(`G$ stream from ${sender} to ${receiver} deleted after 24h`);
}
