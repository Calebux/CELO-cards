export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { clearActiveMatchForAddress, getActiveMatchIdForAddress, getMatch } from "../../../lib/redis";
import { matchNeedsPayment, ServerMatch } from "../../../lib/serverMatch";

const INACTIVITY_TIMEOUT = 5 * 60 * 1000;
const WAGER_INACTIVITY_TIMEOUT = 45 * 60 * 1000;

function isTimedOut(match: ServerMatch): boolean {
  const bothJoined = match.host.charId && match.joiner.charId;
  if (bothJoined) return false;
  const timeout = matchNeedsPayment(match) ? WAGER_INACTIVITY_TIMEOUT : INACTIVITY_TIMEOUT;
  return Date.now() - match.lastActivity > timeout;
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim().toLowerCase();
  if (!address) return NextResponse.json({ match: null });

  const matchId = await getActiveMatchIdForAddress(address);
  if (!matchId) return NextResponse.json({ match: null });

  const match = await getMatch<ServerMatch>(matchId);
  if (!match || match.completedAt || match.abortedBy || isTimedOut(match)) {
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
  const phase =
    match.resolvedSlots !== null
      ? "resolved"
      : opponent.charId
        ? "waiting-for-opponent"
        : "lobby";
  const route =
    !self.charId
      ? "/select-character"
      : phase === "resolved"
        ? "/gameplay"
        : phase === "waiting-for-opponent"
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
