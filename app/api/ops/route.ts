export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getBalanceDashboard } from "../../lib/balance";
import { requireOpsSession } from "../../lib/admin";

export async function GET(req: NextRequest) {
  const session = await requireOpsSession(req);
  if (session instanceof NextResponse) return session;

  const data = await getBalanceDashboard();
  return NextResponse.json(data);
}
