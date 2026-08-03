import { NextRequest, NextResponse } from "next/server";
import { requireOpsSession } from "../../../lib/admin";
import {
  BOUNTY_PRIZE_USD,
  BOUNTY_TOP_N,
  bountyDayUTC,
  getBountyPaid,
  getBountyWinners,
  isBountyDayClosed,
  markBountyPaid,
} from "../../../lib/bounty";

export const dynamic = "force-dynamic";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function resolveDay(req: NextRequest): string {
  const requested = req.nextUrl.searchParams.get("day");
  if (requested && DAY_PATTERN.test(requested)) return requested;
  // Default to yesterday: today's standings are still moving.
  return bountyDayUTC(Date.now() - 24 * 60 * 60 * 1000);
}

// GET /api/bounty/payout?day=YYYY-MM-DD
// Ops-gated. Who is owed for that day, whether it has been paid, and a
// paste-ready PAYOUTS block for scripts/reward-players.mjs.
export async function GET(req: NextRequest) {
  const auth = await requireOpsSession(req);
  if (auth instanceof NextResponse) return auth;

  const day = resolveDay(req);
  const [winners, paid] = await Promise.all([getBountyWinners(day), getBountyPaid(day)]);

  // reward-players.mjs takes whole-token amounts, so the USD prize has to be
  // converted at whatever rate is being used at payout time. Left to the human:
  // emitting a guessed G$ amount here would look authoritative and be wrong.
  const payoutsBlock = winners.length
    ? [
        "const PAYOUTS = [",
        ...winners.map(
          (w) =>
            `  { to: "${w.address}", amount: "<amount>" }, // rank ${w.rank} · ${w.points} pts · $${w.prizeUsd}${w.name ? ` · ${w.name}` : ""}`,
        ),
        "];",
      ].join("\n")
    : null;

  return NextResponse.json({
    day,
    closed: isBountyDayClosed(day),
    prizeUsd: BOUNTY_PRIZE_USD,
    topN: BOUNTY_TOP_N,
    totalOwedUsd: winners.reduce((sum, w) => sum + w.prizeUsd, 0),
    winners,
    paid,
    payoutsBlock,
  });
}

// POST /api/bounty/payout  { day: "YYYY-MM-DD", note?: string }
// Records that a day's prizes were sent. This does NOT move funds — payouts are
// manual on purpose, so no Redis-derived total can ever size a transfer.
export async function POST(req: NextRequest) {
  const auth = await requireOpsSession(req);
  if (auth instanceof NextResponse) return auth;

  let body: { day?: string; note?: string } = {};
  try {
    body = (await req.json()) as { day?: string; note?: string };
  } catch {
    // empty body → default day
  }

  const day = body.day && DAY_PATTERN.test(body.day)
    ? body.day
    : bountyDayUTC(Date.now() - 24 * 60 * 60 * 1000);

  if (!isBountyDayClosed(day)) {
    return NextResponse.json(
      { error: "That day is still in progress — standings can still change." },
      { status: 409 },
    );
  }

  const existing = await getBountyPaid(day);
  if (existing) {
    return NextResponse.json({ error: "Already marked paid", paid: existing }, { status: 409 });
  }

  const winners = await getBountyWinners(day);
  if (!winners.length) {
    return NextResponse.json({ error: "No eligible winners for that day" }, { status: 400 });
  }

  const paid = await markBountyPaid(day, auth, winners, body.note);
  return NextResponse.json({ ok: true, day, paid });
}
