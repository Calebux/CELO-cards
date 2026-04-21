import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../lib/redis";

// GET /api/username?address=0x...          → { address, username }
// GET /api/username?addresses=0x1,0x2,...  → { map: Record<address, username> }
// POST /api/username { address, username } → claim / update username
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  const bulk = req.nextUrl.searchParams.get("addresses");

  if (bulk) {
    const addrs = bulk
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter((a) => /^0x[0-9a-f]{40}$/.test(a))
      .slice(0, 50); // max 50

    if (addrs.length === 0) return NextResponse.json({ map: {} });

    const keys = addrs.map((a) => `user:addr:${a}`);
    const values = await redis.mget<string[]>(...keys);

    const map: Record<string, string> = {};
    addrs.forEach((a, i) => {
      if (values[i]) map[a] = values[i] as string;
    });
    return NextResponse.json({ map });
  }

  if (address) {
    if (!/^0x[0-9a-f]{40}$/.test(address)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }
    const username = await redis.get<string>(`user:addr:${address}`);
    return NextResponse.json({ address, username: username ?? null });
  }

  return NextResponse.json({ error: "address or addresses parameter required" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  let body: { address?: string; username?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { address, username } = body;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (!username || typeof username !== "string") {
    return NextResponse.json({ error: "Username required" }, { status: 400 });
  }

  const trimmed = username.trim().slice(0, 20);
  if (trimmed.length < 2) {
    return NextResponse.json({ error: "Username too short (min 2 chars)" }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    return NextResponse.json({ error: "Only letters, numbers, and underscores allowed" }, { status: 400 });
  }

  const addr = address.toLowerCase();
  const nameKey = `user:name:${trimmed.toLowerCase()}`;

  // Check uniqueness — allow re-claiming your own name
  const existingOwner = await redis.get<string>(nameKey);
  if (existingOwner && existingOwner !== addr) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }

  // Remove old name mapping if user is renaming
  const prevName = await redis.get<string>(`user:addr:${addr}`);
  if (prevName && prevName.toLowerCase() !== trimmed.toLowerCase()) {
    await redis.del(`user:name:${prevName.toLowerCase()}`);
  }

  // Persist both directions (no expiry — usernames are permanent)
  await redis.set(`user:addr:${addr}`, trimmed);
  await redis.set(nameKey, addr);

  return NextResponse.json({ ok: true, username: trimmed });
}
