import { NextRequest, NextResponse } from "next/server";
import { requireOpsSession } from "../../../lib/admin";
import { reconcilePasses } from "../../../lib/passReconcile";

export const dynamic = "force-dynamic";

// M-02 recovery endpoint: rebuild season-pass entitlements from on-chain
// PassPurchased events. Ops-gated. POST {} for a dry run (reports what's
// missing from Redis); POST {"apply": true} to restore the missing entitlements.
export async function POST(req: NextRequest) {
  const auth = await requireOpsSession(req);
  if (auth instanceof NextResponse) return auth;

  let body: { apply?: boolean } = {};
  try {
    body = (await req.json()) as { apply?: boolean };
  } catch {
    // no body → dry run
  }

  const summary = await reconcilePasses({ apply: body.apply === true });
  return NextResponse.json({ ok: true, applied: body.apply === true, ...summary });
}
