export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getBalanceDashboard } from "../../lib/balance";
import { isOpsAllowed, OPS_SESSION_COOKIE } from "../../lib/admin";
import { redis } from "../../lib/redis";

const sessionKey = (token: string) => `ops-auth:session:${token}`;

export async function GET(req: NextRequest) {
  const token = req.cookies.get(OPS_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await redis.get<{ address: string }>(sessionKey(token));
  if (!session?.address || !isOpsAllowed(session.address)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getBalanceDashboard();
  return NextResponse.json(data);
}
