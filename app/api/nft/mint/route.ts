import { NextRequest, NextResponse } from "next/server";
import { getMintRecord, getAllMintedCards, recordMint } from "../../../lib/nft";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getCardForgeProgress } from "../../../lib/cardMastery";
import type { CardPerformanceStats } from "../../../lib/cardProgress";

export const dynamic = "force-dynamic";

// GET /api/nft/mint?address=0x...
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const minted = await getAllMintedCards(address);
  return NextResponse.json({ minted });
}

// POST /api/nft/mint
// Body: { address, cardId, stats: CardPerformanceStats, txHash? }
export async function POST(req: NextRequest) {
  let body: {
    address?: string;
    cardId?: string;
    stats?: CardPerformanceStats;
    txHash?: string | null;
  };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = body.address?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const { cardId, stats, txHash = null } = body;
  if (!cardId || typeof cardId !== "string") {
    return NextResponse.json({ error: "cardId is required" }, { status: 400 });
  }

  const allowed = await checkRateLimit(`ratelimit:nft-mint:${address}`, 5, 300);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
  }

  // Check if already minted
  const existing = await getMintRecord(address, cardId);
  if (existing) {
    return NextResponse.json({ error: "Card already minted", record: existing }, { status: 409 });
  }

  // Validate forge requirements using client-provided stats
  if (stats) {
    const forgeProgress = getCardForgeProgress(stats);
    if (!forgeProgress.ready) {
      const unmet = forgeProgress.requirements.filter(r => !r.complete).map(r => `${r.label}: ${r.current}/${r.target}`);
      return NextResponse.json({ error: `Forge requirements not met: ${unmet.join(", ")}` }, { status: 400 });
    }
  }

  const record = await recordMint(address, cardId, txHash ?? null);
  return NextResponse.json({ ok: true, record });
}
