import { NextRequest, NextResponse } from "next/server";
import { maskPhoneForDisplay } from "../../lib/minipayPhone";
import { checkRateLimit } from "../../lib/rateLimit";
import {
  clearStoredVerifiedPhone,
  getStoredVerifiedPhone,
  getStoredVerifiedPhones,
  verifyAndStoreMiniPayPhone,
} from "../../lib/minipayPhoneServer";

function normalizeAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

export async function GET(req: NextRequest) {
  const address = normalizeAddress(req.nextUrl.searchParams.get("address"));
  const bulk = req.nextUrl.searchParams.get("addresses");

  if (bulk) {
    const addresses = bulk
      .split(",")
      .map((item) => normalizeAddress(item))
      .filter((item): item is string => !!item)
      .slice(0, 50);

    if (addresses.length === 0) return NextResponse.json({ map: {} });
    const map = await getStoredVerifiedPhones(addresses);
    const maskedMap: Record<string, string> = {};
    Object.entries(map).forEach(([key, value]) => {
      const masked = maskPhoneForDisplay(value);
      if (masked) maskedMap[key] = masked;
    });
    return NextResponse.json({ map: maskedMap });
  }

  if (!address) {
    return NextResponse.json({ error: "address or addresses parameter required" }, { status: 400 });
  }

  const phoneNumber = await getStoredVerifiedPhone(address);
  return NextResponse.json({ address, phoneLabel: maskPhoneForDisplay(phoneNumber) ?? null });
}

export async function POST(req: NextRequest) {
  let body: { address?: string; phoneNumber?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = normalizeAddress(body.address);
  const phoneNumber = body.phoneNumber;

  if (!address) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const allowed = await checkRateLimit(`ratelimit:minipay-phone:${address}`, 5, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "Too many verification attempts. Please try again later." }, { status: 429 });
  }

  const result = await verifyAndStoreMiniPayPhone(address, phoneNumber ?? "");
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, phoneLabel: maskPhoneForDisplay(result.phoneNumber) });
}

export async function DELETE(req: NextRequest) {
  let body: { address?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = normalizeAddress(body.address);
  if (!address) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  await clearStoredVerifiedPhone(address);
  return NextResponse.json({ ok: true });
}
