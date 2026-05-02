export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getActiveMatchIdForAddress, getMatch, getOpenMatchIds, removeFromOpenMatches } from "../../../lib/redis";
import { ServerMatch, isJoinWindowOpen } from "../../../lib/serverMatch";

type LiveMatchSummary = {
  id: string;
  hostName: string | null;
  hostAddress: string | null;
  createdAt: number;
  mode: ServerMatch["mode"];
  hostCharSelected: boolean;
};

function toLiveMatchSummary(id: string, match: ServerMatch): LiveMatchSummary {
  return {
    id,
    hostName: match.host.playerName ?? null,
    hostAddress: match.host.address ?? null,
    createdAt: match.createdAt,
    mode: match.mode,
    hostCharSelected: !!match.host.charId,
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const address = url.searchParams.get("address")?.trim().toLowerCase() ?? null;
    const ids = await getOpenMatchIds();
    if (!ids.length && !address) return NextResponse.json({ matches: [] });

    const results = await Promise.all(
      ids.map(async (id) => {
        const match = await getMatch<ServerMatch>(id);
        return { id, match };
      })
    );

    const live: LiveMatchSummary[] = [];

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
      // Skip if the host has not explicitly reopened or refreshed the join window
      if (!isJoinWindowOpen(match)) {
        await removeFromOpenMatches(id).catch(() => {});
        continue;
      }

      live.push(toLiveMatchSummary(id, match));
    }

    if (address) {
      const activeMatchId = await getActiveMatchIdForAddress(address);
      if (activeMatchId && !live.some((match) => match.id === activeMatchId)) {
        const activeMatch = await getMatch<ServerMatch>(activeMatchId);
        const isOwnHostWaitingMatch =
          !!activeMatch &&
          !activeMatch.completedAt &&
          !activeMatch.abortedBy &&
          activeMatch.host.address?.toLowerCase() === address &&
          !activeMatch.joiner.charId;
        if (isOwnHostWaitingMatch && activeMatch) {
          live.push(toLiveMatchSummary(activeMatchId, activeMatch));
        }
      }
    }

    live.sort((a, b) => {
      const aOwn = !!(address && a.hostAddress?.toLowerCase() === address);
      const bOwn = !!(address && b.hostAddress?.toLowerCase() === address);
      if (aOwn !== bOwn) return aOwn ? -1 : 1;
      return b.createdAt - a.createdAt;
    });

    return NextResponse.json({ matches: live });
  } catch (e) {
    console.error("Live matches error:", e);
    return NextResponse.json({ matches: [] });
  }
}
