export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  getActiveMatchIdForAddress,
  getMatch,
  getOpenMatchIds,
  getOpenMatchSummaries,
  removeFromOpenMatches,
  removeOpenMatchSummary,
} from "../../../lib/redis";
import { ServerMatch, isJoinWindowOpen } from "../../../lib/serverMatch";
import type { OpenMatchSummary as LiveMatchSummary } from "../../../lib/redis";

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

    const live: LiveMatchSummary[] = [];
    const summaries = await getOpenMatchSummaries(ids);
    const missingIds: string[] = [];

    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      const summary = summaries[index];
      if (summary) {
        live.push(summary);
      } else {
        missingIds.push(id);
      }
    }

    if (missingIds.length) {
      const results = await Promise.all(
        missingIds.map(async (id) => {
          const match = await getMatch<ServerMatch>(id);
          return { id, match };
        })
      );

      for (const { id, match } of results) {
        if (!match || match.joiner.charId || !isJoinWindowOpen(match)) {
          await Promise.allSettled([
            removeFromOpenMatches(id),
            removeOpenMatchSummary(id),
          ]);
          continue;
        }
        live.push(toLiveMatchSummary(id, match));
      }
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
  } catch {
    return NextResponse.json({ matches: [] });
  }
}
