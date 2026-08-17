import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../../lib/redis";
import {
  BOUNTY_TOP_N,
  bountyDayUTC,
  getBountyDayResult,
  isBountyDayClosed,
} from "../../../lib/bounty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DAYS = 30;

/**
 * GET /api/bounty/history?days=14 → past daily bounty winners, newest first.
 *
 * Only closed days appear. A day still in progress has no winners yet, and
 * showing a provisional leader as "the winner" would be a lie the moment
 * someone overtakes them.
 */
export async function GET(req: NextRequest) {
  const requested = Number(req.nextUrl.searchParams.get("days") ?? 14);
  const days = Math.max(1, Math.min(MAX_DAYS, Number.isFinite(requested) ? requested : 14));

  const results = await Promise.all(
    Array.from({ length: days }, async (_, i) => {
      // i + 1 so today — still open — is never included.
      const day = bountyDayUTC(Date.now() - (i + 1) * 24 * 60 * 60 * 1000);
      if (!isBountyDayClosed(day)) return null;

      const standings = await getBountyDayResult(day).catch(() => []);
      const winners = standings.filter((s) => s.totalUsd > 0).slice(0, BOUNTY_TOP_N);
      if (!winners.length) return { day, winners: [], totalPaidUsd: 0 };

      // Whether each winner actually collected, so the page shows what was paid
      // rather than only what was owed.
      const claimed = await Promise.all(
        winners.map((w) =>
          redis
            .get<{ txHash?: string }>(`bounty:claim:${day}:${w.address.toLowerCase()}`)
            .catch(() => null),
        ),
      );

      return {
        day,
        totalPaidUsd: Math.round(winners.reduce((sum, w) => sum + w.totalUsd, 0) * 100) / 100,
        winners: winners.map((w, idx) => ({
          rank: w.rank,
          address: w.address,
          name: w.name,
          points: w.points,
          usd: w.totalUsd,
          claimed: !!claimed[idx]?.txHash,
          txHash: claimed[idx]?.txHash ?? null,
        })),
      };
    }),
  );

  const history = results.filter((r): r is NonNullable<typeof r> => !!r && r.winners.length > 0);

  return NextResponse.json({
    days: history,
    totalPaidUsd: Math.round(history.reduce((sum, d) => sum + d.totalPaidUsd, 0) * 100) / 100,
  });
}
