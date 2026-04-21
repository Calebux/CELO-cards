import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../lib/redis";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import {
  GDOLLAR_CONTRACT,
  CFA_FORWARDER,
  CFA_FORWARDER_ABI,
} from "../../lib/gooddollar";

const TOURNAMENT_KEY = "tournament:current";

// ── Types ────────────────────────────────────────────────────────────────────

export type BracketPlayer = { seed: number; address: string; points: number };

export type MatchResult = { match: number; winner: "top" | "bottom" | null };

export type TournamentData = {
  weekId: string;
  status: "registration" | "active" | "complete";
  registered: string[];             // wallet addresses signed up
  maxPlayers: number;               // default 16
  seeded: BracketPlayer[];
  results: {
    r16: MatchResult[];
    qf:  MatchResult[];
    sf:  MatchResult[];
    final: MatchResult[];
  };
  champion: string | null;
  prizePool: string;                // G$ in wei as string
  payouts: Record<string, string>;  // address → txHash
  createdAt: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function getTournament(): Promise<TournamentData | null> {
  return redis.get<TournamentData>(TOURNAMENT_KEY);
}

async function saveTournament(data: TournamentData): Promise<void> {
  // Tournaments live for 14 days
  await redis.set(TOURNAMENT_KEY, data, { ex: 14 * 24 * 60 * 60 });
}

function computeSlots(data: TournamentData) {
  const { seeded, results } = data;

  const r16Slots = Array.from({ length: 8 }, (_, i) => ({
    top: seeded[i] ?? null,
    bottom: seeded[15 - i] ?? null,
  }));

  function advance(
    slots: Array<{ top: BracketPlayer | null; bottom: BracketPlayer | null }>,
    matchResults: MatchResult[]
  ) {
    return slots.map((slot, i) => {
      const res = matchResults[i];
      if (!res || res.winner === null) return null;
      return res.winner === "top" ? slot.top : slot.bottom;
    });
  }

  const r16Winners = advance(r16Slots, results.r16);
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

  // 3rd place: the two SF losers
  const sfLosers = sfSlots.map((slot, i) => {
    const res = results.sf[i];
    if (!res || res.winner === null) return null;
    return res.winner === "top" ? slot.bottom : slot.top;
  });

  const finalSlots = [{ top: sfWinners[0] ?? null, bottom: sfWinners[1] ?? null }];
  const finalWinners = advance(finalSlots, results.final);

  return {
    r16: r16Slots,
    qf: qfSlots,
    sf: sfSlots,
    final: finalSlots,
    champion: finalWinners[0] ?? null,
    thirdPlace: sfLosers,
  };
}

// ── Prize payout ──────────────────────────────────────────────────────────────
// Top 4 split: 1st 60%, 2nd 25%, 3rd/4th 7.5% each
const PRIZE_SPLIT = [6000n, 2500n, 750n, 750n]; // basis points out of 10000

async function streamPrize(winner: `0x${string}`, flowRate: bigint): Promise<string> {
  const key = process.env.TREASURY_PRIVATE_KEY!;
  const account = privateKeyToAccount(key as `0x${string}`);
  const publicClient = createPublicClient({ chain: celo, transport: http() });
  const walletClient = createWalletClient({ account, chain: celo, transport: http() });

  const { request } = await publicClient.simulateContract({
    account,
    address: CFA_FORWARDER,
    abi: CFA_FORWARDER_ABI,
    functionName: "createFlow",
    args: [GDOLLAR_CONTRACT, account.address, winner, flowRate, "0x"],
  });
  const txHash = await walletClient.writeContract(request);

  // Schedule deletion after 24h (best effort)
  void (async () => {
    await new Promise((r) => setTimeout(r, 86_400_000));
    await walletClient.writeContract({
      address: CFA_FORWARDER,
      abi: CFA_FORWARDER_ABI,
      functionName: "deleteFlow",
      args: [GDOLLAR_CONTRACT, account.address, winner, "0x"],
      account,
      chain: celo,
    }).catch((e) => console.error("Stream deletion failed:", e));
  })();

  return txHash;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/tournament
export async function GET() {
  const data = await getTournament();
  if (!data) {
    return NextResponse.json({
      weekId: currentWeekId(),
      status: "registration",
      registered: [],
      maxPlayers: 16,
      seeded: [],
      results: emptyResults(),
      champion: null,
      prizePool: "0",
      payouts: {},
      slots: null,
    });
  }
  const slots = computeSlots(data);
  return NextResponse.json({ ...data, slots });
}

// POST /api/tournament
// action "create"   — admin: create new registration window
// action "register" — player: sign up with wallet address
// action "seed"     — admin: lock registrations and seed the bracket
// action "payout"   — admin: stream G$ prizes to top 4
export async function POST(req: NextRequest) {
  let body: {
    action?: string;
    address?: string;
    players?: { address: string; points: number }[];
    prizePool?: string;
    maxPlayers?: number;
  };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action } = body;

  // ── Create ──────────────────────────────────────────────────────────────────
  if (action === "create") {
    const data: TournamentData = {
      weekId: currentWeekId(),
      status: "registration",
      registered: [],
      maxPlayers: body.maxPlayers ?? 16,
      seeded: [],
      results: emptyResults(),
      champion: null,
      prizePool: body.prizePool ?? "0",
      payouts: {},
      createdAt: Date.now(),
    };
    await saveTournament(data);
    return NextResponse.json(data);
  }

  // ── Register ────────────────────────────────────────────────────────────────
  if (action === "register") {
    const addr = body.address?.toLowerCase();
    if (!addr || !/^0x[0-9a-f]{40}$/.test(addr)) {
      return NextResponse.json({ error: "Valid wallet address required" }, { status: 400 });
    }

    // Auto-create tournament if none exists
    let data = await getTournament();
    if (!data) {
      data = {
        weekId: currentWeekId(),
        status: "registration",
        registered: [],
        maxPlayers: 16,
        seeded: [],
        results: emptyResults(),
        champion: null,
        prizePool: "120000000000000000000000",
        payouts: {},
        createdAt: Date.now(),
      };
    }
    if (data.status !== "registration") {
      return NextResponse.json({ error: "Registration is closed" }, { status: 409 });
    }
    if (data.registered.includes(addr)) {
      return NextResponse.json({ ok: true, alreadyRegistered: true, count: data.registered.length });
    }
    if (data.registered.length >= data.maxPlayers) {
      return NextResponse.json({ error: "Tournament is full" }, { status: 409 });
    }

    data.registered.push(addr);
    await saveTournament(data);
    return NextResponse.json({ ok: true, count: data.registered.length });
  }

  // ── Seed ────────────────────────────────────────────────────────────────────
  if (action === "seed") {
    const data = await getTournament();
    if (!data) return NextResponse.json({ error: "No tournament found" }, { status: 404 });

    // Use provided players list (with points) or just the registered addresses
    const players: { address: string; points: number }[] = body.players
      ?? data.registered.map((addr) => ({ address: addr, points: 0 }));

    const top16 = players
      .sort((a, b) => b.points - a.points)
      .slice(0, 16);

    data.seeded = top16.map((p, i) => ({ seed: i + 1, address: p.address, points: p.points }));
    data.status = "active";
    await saveTournament(data);

    const slots = computeSlots(data);
    return NextResponse.json({ ...data, slots });
  }

  // ── Payout ──────────────────────────────────────────────────────────────────
  if (action === "payout") {
    const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
    if (!treasuryKey) {
      return NextResponse.json({ error: "Treasury not configured" }, { status: 500 });
    }

    const data = await getTournament();
    if (!data) return NextResponse.json({ error: "No tournament found" }, { status: 404 });
    if (data.status !== "complete") {
      return NextResponse.json({ error: "Tournament not complete yet" }, { status: 409 });
    }

    const slots = computeSlots(data);
    const champion = slots.champion?.address as `0x${string}` | undefined;
    const finalist = slots.final[0].top?.address === champion
      ? slots.final[0].bottom?.address
      : slots.final[0].top?.address;
    const third1 = slots.thirdPlace[0]?.address;
    const third2 = slots.thirdPlace[1]?.address;

    const recipients = [champion, finalist, third1, third2]
      .filter(Boolean) as `0x${string}`[];

    const pool = BigInt(data.prizePool || "0");
    if (pool === 0n) {
      return NextResponse.json({ error: "Prize pool is 0" }, { status: 400 });
    }

    // Stream over 24h
    const STREAM_DURATION = 86_400n;
    const txHashes: Record<string, string> = { ...data.payouts };

    for (let i = 0; i < recipients.length; i++) {
      const addr = recipients[i];
      if (txHashes[addr]) continue; // already paid

      const share = pool * PRIZE_SPLIT[i] / 10000n;
      const flowRate = share / STREAM_DURATION;

      try {
        const txHash = await streamPrize(addr, flowRate);
        txHashes[addr] = txHash;
        console.log(`Tournament payout ${i + 1}/${recipients.length}: ${formatShare(PRIZE_SPLIT[i])} G$ → ${addr} @ ${flowRate} wei/s — ${txHash}`);
      } catch (e) {
        console.error(`Payout failed for ${addr}:`, e);
        return NextResponse.json({ error: `Payout failed for ${addr}: ${e instanceof Error ? e.message : e}` }, { status: 500 });
      }
    }

    data.payouts = txHashes;
    await saveTournament(data);
    return NextResponse.json({ ok: true, payouts: txHashes });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

function formatShare(bps: bigint): string {
  return `${Number(bps) / 100}%`;
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

  const data = await getTournament();
  if (!data) return NextResponse.json({ error: "No active tournament" }, { status: 404 });

  const roundKey = round as "r16" | "qf" | "sf" | "final";
  const entry = data.results[roundKey].find((r) => r.match === match);
  if (!entry) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  entry.winner = winner;

  const slots = computeSlots(data);
  if (slots.champion) {
    data.champion = slots.champion.address;
    data.status = "complete";
  }

  await saveTournament(data);
  return NextResponse.json({ ...data, slots });
}

// DELETE /api/tournament — wipe and reset
export async function DELETE() {
  await redis.del(TOURNAMENT_KEY);
  return NextResponse.json({ ok: true });
}
