export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { redis, setMatch } from "../../lib/redis";
import type { ServerMatch } from "../match/[matchId]/route";

const QUEUE_KEY = "mmqueue";
const QUEUE_TTL  = 90; // seconds a waiting entry lives before expiring

interface QueueEntry {
  queueId: string;
  address:  string;
  joinedAt: number;
}

interface QueueStatus {
  status:   "waiting" | "matched";
  matchId?: string;
  role?:    "host" | "joiner";
}

function makeMatchId() {
  return `AO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function emptyMatch(matchId: string): ServerMatch {
  const now = Date.now();
  return {
    id: matchId,
    createdAt: now,
    lastActivity: now,
    host:   { charId: null, playerName: null, cardIds: null, orderRound: 0 },
    joiner: { charId: null, playerName: null, cardIds: null, orderRound: 0 },
    round: 1,
    hostWins: 0,
    joinerWins: 0,
    resolvedSlots: null,
    hostWagerTx:      null,
    joinerWagerTx:    null,
    hostWagerAmount:  null,
    joinerWagerAmount: null,
    abortedBy: null,
  };
}

// POST — join queue; immediately returns match if an opponent is already waiting
export async function POST(req: NextRequest) {
  let address: string;
  try {
    const body = await req.json() as { address: string };
    address = (body.address ?? "").trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Valid wallet address required" }, { status: 400 });
  }

  // Try to pop a valid waiting opponent (skip expired / cancelled entries)
  let opponent: QueueEntry | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const raw = await redis.lpop<string | QueueEntry>(QUEUE_KEY);
    if (!raw) break;

    let entry: QueueEntry;
    try {
      entry = typeof raw === "string" ? JSON.parse(raw) as QueueEntry : raw;
    } catch {
      continue; // corrupted entry — skip
    }

    // Skip if they cancelled or their slot expired
    const theirStatus = await redis.get<QueueStatus>(`queue:${entry.queueId}`);
    if (!theirStatus || theirStatus.status !== "waiting") continue;

    // Never match someone against themselves
    if (entry.address.toLowerCase() === address.toLowerCase()) {
      await redis.rpush(QUEUE_KEY, JSON.stringify(entry)); // put back at tail
      break;
    }

    opponent = entry;
    break;
  }

  if (opponent) {
    const matchId = makeMatchId();
    await setMatch(matchId, emptyMatch(matchId));

    // Notify the waiting host via their status key
    const hostStatus: QueueStatus = { status: "matched", matchId, role: "host" };
    await redis.set(`queue:${opponent.queueId}`, hostStatus, { ex: 300 });

    // Joiner gets the answer immediately in the POST response
    return NextResponse.json({ matched: true, matchId, role: "joiner" });
  }

  // No opponent found — join the queue as host
  const queueId = crypto.randomUUID();
  const entry: QueueEntry = { queueId, address, joinedAt: Date.now() };
  await redis.rpush(QUEUE_KEY, JSON.stringify(entry));
  const status: QueueStatus = { status: "waiting" };
  await redis.set(`queue:${queueId}`, status, { ex: QUEUE_TTL });

  return NextResponse.json({ matched: false, queueId });
}

// GET ?id=queueId — poll for match status (called every 2s by the waiting player)
export async function GET(req: NextRequest) {
  const queueId = req.nextUrl.searchParams.get("id");
  if (!queueId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const status = await redis.get<QueueStatus>(`queue:${queueId}`);
  if (!status) return NextResponse.json({ matched: false, expired: true });

  if (status.status === "matched") {
    return NextResponse.json({ matched: true, matchId: status.matchId, role: status.role });
  }
  return NextResponse.json({ matched: false });
}

// DELETE ?id=queueId — cancel queue (marks slot as gone; skipped by next joiner)
export async function DELETE(req: NextRequest) {
  const queueId = req.nextUrl.searchParams.get("id");
  if (!queueId) return NextResponse.json({ error: "id required" }, { status: 400 });
  await redis.del(`queue:${queueId}`);
  return NextResponse.json({ ok: true });
}
