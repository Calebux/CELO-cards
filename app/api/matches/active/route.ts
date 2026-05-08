export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { clearActiveMatchForAddress, getActiveMatchIdForAddress, getMatch } from "../../../lib/redis";
import { ServerMatch } from "../../../lib/serverMatch";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim().toLowerCase();
  if (!address) return NextResponse.json({ match: null });

  const matchId = await getActiveMatchIdForAddress(address);
  if (!matchId) return NextResponse.json({ match: null });

  const match = await getMatch<ServerMatch>(matchId);
  if (!match || match.completedAt || match.abortedBy) {
    await clearActiveMatchForAddress(address, matchId).catch(() => {});
    return NextResponse.json({ match: null });
  }

  const role =
    match.host.address?.toLowerCase() === address
      ? "host"
      : match.joiner.address?.toLowerCase() === address
        ? "joiner"
        : null;

  if (!role) {
    await clearActiveMatchForAddress(address, matchId).catch(() => {});
    return NextResponse.json({ match: null });
  }

  const self = role === "host" ? match.host : match.joiner;
  const opponent = role === "host" ? match.joiner : match.host;
  const bothCharsSelected = !!self.charId && !!opponent.charId;
  const hostReadyRoute = match.mode === "ranked"
    ? "/ready?ranked=true"
    : "/ready";
  const route =
    match.resolvedSlots !== null
      ? "/gameplay"
      : role === "host" && !opponent.charId
        ? hostReadyRoute
        : !self.charId
          ? role === "host"
            ? hostReadyRoute
            : `/join?id=${matchId}`
          : bothCharsSelected
            ? "/loadout"
            : "/lobby";

  return NextResponse.json({
    match: {
      matchId,
      role,
      mode: match.mode,
      route,
      selfCharId: self.charId,
      opponentCharId: opponent.charId,
      opponentName: opponent.playerName,
    },
  });
}
