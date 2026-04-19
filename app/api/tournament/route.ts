import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "tournament.json");

// ── Types ────────────────────────────────────────────────────────────────────

export type BracketPlayer = { seed: number; address: string; points: number };

export type MatchResult = { match: number; winner: "top" | "bottom" | null };

export type TournamentData = {
  weekId: string;                           // e.g. "2026-W16"
  status: "pending" | "active" | "complete";
  seeded: BracketPlayer[];                  // 16 players ordered seed 1..16
  results: {
    r16: MatchResult[];     // 8 matches
    qf:  MatchResult[];     // 4 matches
    sf:  MatchResult[];     // 2 matches
    final: MatchResult[];   // 1 match
  };
  champion: string | null;                  // address of winner
  createdAt: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function currentWeekId(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getUTCDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function emptyResults() {
  return {
    r16:   Array.from({ length: 8 }, (_, i) => ({ match: i, winner: null })) as MatchResult[],
    qf:    Array.from({ length: 4 }, (_, i) => ({ match: i, winner: null })) as MatchResult[],
    sf:    Array.from({ length: 2 }, (_, i) => ({ match: i, winner: null })) as MatchResult[],
    final: [{ match: 0, winner: null }] as MatchResult[],
  };
}

function readData(): TournamentData | null {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as TournamentData;
  } catch {
    return null;
  }
}

function writeData(data: TournamentData) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Given the seeded list and results so far, compute which player address
 * occupies each slot in every round.
 * Returns { r16, qf, sf, final } — each an array of { top, bottom } player entries.
 */
function computeSlots(data: TournamentData) {
  const { seeded, results } = data;

  // R16 slots: match 0 → seed1 vs seed16, match 1 → seed2 vs seed15, …
  const r16Slots = Array.from({ length: 8 }, (_, i) => ({
    top: seeded[i] ?? null,
    bottom: seeded[15 - i] ?? null,
  }));

  function advance(slots: Array<{ top: BracketPlayer | null; bottom: BracketPlayer | null }>, matchResults: MatchResult[]) {
    return slots.map((slot, i) => {
      const res = matchResults[i];
      if (!res || res.winner === null) return null;
      return res.winner === "top" ? slot.top : slot.bottom;
    });
  }

  const r16Winners = advance(r16Slots, results.r16);

  // QF pairs winners 0+1, 2+3, 4+5, 6+7
  const qfSlots = Array.from({ length: 4 }, (_, i) => ({
    top: r16Winners[i * 2] ?? null,
    bottom: r16Winners[i * 2 + 1] ?? null,
  }));
  const qfWinners = advance(qfSlots, results.qf);

  const sfSlots = Array.from({ length: 2 }, (_, i) => ({
    top: qfWinners[i * 2] ?? null,
    bottom: qfWinners[i * 2 + 1] ?? null,
  }));
  const sfWinners = advance(sfSlots, results.sf);

  const finalSlots = [{ top: sfWinners[0] ?? null, bottom: sfWinners[1] ?? null }];
  const finalWinners = advance(finalSlots, results.final);

  return { r16: r16Slots, qf: qfSlots, sf: sfSlots, final: finalSlots, champion: finalWinners[0] ?? null };
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/tournament — return current bracket state
export async function GET() {
  const data = readData();
  if (!data) {
    return NextResponse.json({ weekId: currentWeekId(), status: "pending", seeded: [], results: emptyResults(), champion: null, slots: null });
  }
  const slots = computeSlots(data);
  return NextResponse.json({ ...data, slots });
}

// POST /api/tournament — seed bracket from provided player list
export async function POST(req: NextRequest) {
  let body: { players?: { address: string; points: number }[] };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const players = body.players ?? [];
  if (!Array.isArray(players) || players.length === 0) {
    return NextResponse.json({ error: "players array required" }, { status: 400 });
  }

  const top16 = players.slice(0, 16);
  const seeded: BracketPlayer[] = top16.map((p, i) => ({ seed: i + 1, address: p.address, points: p.points }));

  const data: TournamentData = {
    weekId: currentWeekId(),
    status: "active",
    seeded,
    results: emptyResults(),
    champion: null,
    createdAt: Date.now(),
  };

  writeData(data);
  const slots = computeSlots(data);
  return NextResponse.json({ ...data, slots });
}

// PATCH /api/tournament — record a match result
export async function PATCH(req: NextRequest) {
  let body: { round?: string; match?: number; winner?: "top" | "bottom" };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { round, match, winner } = body;
  if (!round || typeof match !== "number" || (winner !== "top" && winner !== "bottom")) {
    return NextResponse.json({ error: "round, match (number), winner ('top'|'bottom') required" }, { status: 400 });
  }
  if (!["r16", "qf", "sf", "final"].includes(round)) {
    return NextResponse.json({ error: "round must be r16|qf|sf|final" }, { status: 400 });
  }

  const data = readData();
  if (!data) return NextResponse.json({ error: "No active tournament" }, { status: 404 });

  const roundKey = round as "r16" | "qf" | "sf" | "final";
  const entry = data.results[roundKey].find((r) => r.match === match);
  if (!entry) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  entry.winner = winner;

  // Determine champion
  const slots = computeSlots(data);
  if (slots.champion) {
    data.champion = slots.champion.address;
    data.status = "complete";
  }

  writeData(data);
  return NextResponse.json({ ...data, slots });
}
