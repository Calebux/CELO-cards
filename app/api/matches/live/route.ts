export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getMatch, getOpenMatchIds, removeFromOpenMatches } from "../../../lib/redis";
import { isPaidMultiplayerMode } from "../../../lib/matchmaking";
import { ServerMatch } from "../../../lib/serverMatch";

export async function GET() {
  try {
    const ids = await getOpenMatchIds();
    if (!ids.length) return NextResponse.json({ matches: [] });

    const results = await Promise.all(
      ids.map(async (id) => {
        const match = await getMatch<ServerMatch>(id);
        return { id, match };
      })
    );

    const now = Date.now();
    const STALE_MS        = 10 * 60 * 1000; // 10 min — free matches
    const WAGER_STALE_MS  = 60 * 60 * 1000; // 60 min — paid matches stay visible longer

    const live: { id: string; hostName: string | null; hostAddress: string | null; createdAt: number; mode: ServerMatch["mode"] }[] = [];

    for (const { id, match } of results) {
      if (!match) {
        // Match expired from Redis — clean up the set
        await removeFromOpenMatches(id).catch(() => {});
        continue;
      }
      // Skip if joiner already joined
      if (match.joiner.charId) {
        await removeFromOpenMatches(id).catch(() => {});
        continue;
      }
      // Skip if stale (wager matches get a much longer window)
      const staleLimit = isPaidMultiplayerMode(match.mode) ? WAGER_STALE_MS : STALE_MS;
      if (now - match.lastActivity > staleLimit) {
        await removeFromOpenMatches(id).catch(() => {});
        continue;
      }

      live.push({
        id,
        hostName: match.host.playerName ?? null,
        hostAddress: match.host.address ?? null,
        createdAt: match.createdAt,
        mode: match.mode,
      });
    }

    // Sort newest first
    live.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ matches: live });
  } catch (e) {
    console.error("Live matches error:", e);
    return NextResponse.json({ matches: [] });
  }
}
