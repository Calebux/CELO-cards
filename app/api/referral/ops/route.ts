import { NextRequest, NextResponse } from "next/server";
import { requireOpsSession } from "../../../lib/admin";
import { redis } from "../../../lib/redis";
import {
  REFERRAL_REWARD_NGN,
  getReferrerSummary,
  markReferralPaid,
  markReferralWaived,
  type ReferrerSummary,
} from "../../../lib/referralRewards";
import { applyReferral, getReferral } from "../../../lib/referral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/referral/ops — every referrer, who they brought, and what is owed.
 *
 * Reading this also RE-EVALUATES each pending referee, so opening the dashboard
 * is what backfills anyone who verified or bought a pass since the last look.
 * There is no cron; the ops screen is the trigger.
 */
type ReferralRecord = { referrals?: string[] };

/** Upstash caps how many keys one MGET may carry, so this walks it in chunks. */
async function mgetChunked(addresses: string[]): Promise<(ReferralRecord | null)[]> {
  const out: (ReferralRecord | null)[] = [];
  for (let i = 0; i < addresses.length; i += 100) {
    const slice = addresses.slice(i, i + 100).map((a) => `referral:${a}`);
    const batch = (await redis
      .mget<ReferralRecord[]>(...slice)
      .catch(() => null)) as (ReferralRecord | null)[] | null;
    out.push(...(batch ?? slice.map(() => null)));
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await requireOpsSession(req);
  if (auth instanceof NextResponse) return auth;

  // Referrers are whoever holds a referral record with at least one referee.
  let cursor = "0";
  const keys: string[] = [];
  do {
    const [next, batch] = await redis.scan(cursor, { match: "referral:0x*", count: 500 });
    cursor = next;
    keys.push(...batch);
  } while (cursor !== "0" && keys.length < 5000);

  const addresses = [...new Set(keys.map((k) => k.replace("referral:", "").toLowerCase()))]
    .filter((a) => /^0x[0-9a-f]{40}$/.test(a));

  // Read every record in one round trip, then only build summaries for wallets
  // that actually referred someone.
  //
  // This used to await getReferrerSummary for all of them in sequence, which
  // meant a Redis get plus two on-chain identity reads per referee, one after
  // another. At 52 records the reads alone measured 17 seconds — past the
  // function timeout — so the page showed nothing and read as "nobody has
  // referred anyone", when in fact five people had.
  const records = await mgetChunked(addresses);
  const referrers = addresses.filter((_, i) => (records[i]?.referrals?.length ?? 0) > 0);

  const summaries = (await Promise.all(referrers.map((a) => getReferrerSummary(a))))
    .filter((s) => s.totalReferred > 0);

  // Most owed first — that is the queue a human works through.
  summaries.sort((a, b) => b.owedNgn - a.owedNgn || b.qualified - a.qualified);

  const names = addresses.length
    ? await redis.mget<string[]>(...summaries.map((s) => `user:addr:${s.referrer}`)).catch(() => [])
    : [];

  // How referrals arrive, not just what they are owed. The link was added
  // because a code someone had to retype was losing people; these two counters
  // are how we find out whether that was true.
  const [viaLink, viaManual] = await Promise.all([
    redis.get<number>("referral:applied:link").catch(() => 0),
    redis.get<number>("referral:applied:manual").catch(() => 0),
  ]);

  return NextResponse.json({
    rewardNgn: REFERRAL_REWARD_NGN,
    totals: {
      referrers: summaries.length,
      referred: summaries.reduce((n, s) => n + s.totalReferred, 0),
      qualified: summaries.reduce((n, s) => n + s.qualified, 0),
      paid: summaries.reduce((n, s) => n + s.paid, 0),
      owedNgn: summaries.reduce((n, s) => n + s.owedNgn, 0),
      viaLink: Number(viaLink) || 0,
      viaManual: Number(viaManual) || 0,
    },
    referrers: summaries.map((s, i) => ({
      ...s,
      name: typeof names[i] === "string" ? String(names[i]).replace(/^"|"$/g, "") : null,
    })),
  });
}

/**
 * POST /api/referral/ops — settle a qualified referral.
 * Body: { referee: "0x…", action?: "paid" | "waived", note?: string }
 *
 * Two ways to settle, kept distinct so an audit can never confuse them:
 *   paid   — a receipt for a Naira transfer a human already sent
 *   waived — this referral will not be paid (the reward is discretionary and
 *            goes to referrers in Nigeria; the app holds no country data, so
 *            eligibility is a human call). Without this, every ineligible
 *            referral would sit in the owed column forever.
 *
 * Both write once: a second attempt reports the original rather than creating
 * a duplicate.
 */
export async function POST(req: NextRequest) {
  const auth = await requireOpsSession(req);
  if (auth instanceof NextResponse) return auth;

  let body: { referee?: string; referrer?: string; action?: string; note?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const referee = body.referee?.toLowerCase();
  if (!referee || !/^0x[0-9a-f]{40}$/.test(referee)) {
    return NextResponse.json({ error: "Invalid referee address" }, { status: 400 });
  }

  const note = body.note?.slice(0, 140);

  // Credit a referral that happened in the room rather than through a link.
  //
  // Links lose people to mechanics nobody can see: a code shared before links
  // existed and typed wrong, or a chat app's in-app browser that is a different
  // storage context from the browser they finish signing up in. Neither means
  // the referral did not happen. This is how a real one gets recorded when the
  // referrer can say who they brought.
  //
  // It goes through applyReferral rather than writing the records directly, so
  // every guard still applies — already referred, self-referral, and the
  // per-referrer cap — and the referee's points land exactly as they would have.
  if (body.action === "attribute") {
    const referrer = body.referrer?.toLowerCase();
    if (!referrer || !/^0x[0-9a-f]{40}$/.test(referrer)) {
      return NextResponse.json({ error: "Invalid referrer address" }, { status: 400 });
    }
    if (referrer === referee) {
      return NextResponse.json({ error: "That is the same wallet" }, { status: 400 });
    }

    const referrerRecord = await getReferral(referrer);
    const code = referrerRecord.code;
    if (!code) {
      return NextResponse.json({ error: "That referrer has no code yet" }, { status: 404 });
    }

    const applied = await applyReferral(referee, code);
    if (!applied.ok) {
      return NextResponse.json({ error: applied.error ?? "Could not attribute" }, { status: 409 });
    }

    // Kept apart from organic referrals so an audit can tell them apart, and so
    // a pattern of manual credits is visible rather than buried.
    await redis.set(
      `referral:attributed:${referee}`,
      { referee, referrer, by: auth, note: note ?? null, at: Date.now() },
      { ex: 60 * 60 * 24 * 365 },
    );

    return NextResponse.json({ ok: true, attributed: { referee, referrer } });
  }

  if (body.action === "waived") {
    const result = await markReferralWaived(referee, auth, note);
    if (!result.ok) {
      return NextResponse.json({ error: "Already waived", waiver: result.waiver }, { status: 409 });
    }
    return NextResponse.json({ ok: true, waiver: result.waiver });
  }

  const result = await markReferralPaid(referee, auth, note);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Already marked paid", payment: result.payment },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, payment: result.payment });
}
