import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../lib/redis";
import { checkRateLimit } from "../../lib/rateLimit";
import { recordSignupSurface, recordUsernameClaim, resolveSignupSurface } from "../../lib/signupMetrics";

// GET /api/username?address=0x...          → { address, username }
// GET /api/username?addresses=0x1,0x2,...  → { map: Record<address, username> }
// POST /api/username { address, username } → claim / update username
//
// The single-address GET also tags which surface the wallet plays on, but ONLY
// when the caller passes `mp` — this endpoint is also used to look up OTHER
// people's names, and tagging those would stamp the viewer's surface onto
// someone else's wallet. `mp` is sent from the wallet-connect path alone, where
// the address is the connected one by construction.
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
    const values = await redis.mget<string>(...keys);

    const map: Record<string, string> = {};
    addrs.forEach((a, i) => {
      if (values[i]) map[a] = values[i];
    });
    return NextResponse.json({ map });
  }

  if (address) {
    if (!/^0x[0-9a-f]{40}$/.test(address)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }
    const username = await redis.get<string>(`user:addr:${address}`);

    // Tagging on connect, not only on first claim, is what backfills the
    // ~4,900 wallets that already had a username before any of this existed:
    // each one is classified the next time its owner opens the game.
    const mp = req.nextUrl.searchParams.get("mp");
    if (mp !== null) {
      await recordSignupSurface(
        address,
        resolveSignupSurface(req.headers.get("user-agent"), mp === "1"),
      );
    }

    return NextResponse.json({ address, username: username ?? null });
  }

  return NextResponse.json({ error: "address or addresses parameter required" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  let body: { address?: string; username?: string; minipay?: boolean };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { address, username } = body;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  // Rate limit: 5 username changes per address per hour
  const allowed = await checkRateLimit(`ratelimit:username:${address.toLowerCase()}`, 5, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
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

  // Stamp the first claim so "how many players joined today" is answerable.
  // NX inside, so a rename never re-dates an existing player as a new signup.
  await recordUsernameClaim(addr);
  // ...and which surface they joined on, so that count can be split.
  await recordSignupSurface(addr, resolveSignupSurface(req.headers.get("user-agent"), body.minipay));

  return NextResponse.json({ ok: true, username: trimmed });
}
