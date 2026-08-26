// Cash referral rewards — ₦700 per referral that verifies and buys a pass.
//
// The points side lives in referral.ts and is unchanged. This module is only
// about money, and money changes what the rules have to survive.
//
// WHY IDENTITY ROOTS, NOT ADDRESSES
//
// referral.ts blocks self-referral by comparing addresses, which was fine when
// the prize was points. It is not fine at ₦700 a head: GoodDollar deliberately
// lets one person link several wallets to a single identity, and a GoodAgent
// wallet is one of those. Comparing addresses would pay a referrer for
// referring themselves from a second wallet, repeatedly.
//
// So both sides resolve through getWhitelistedRoot and a payout is refused when
// the roots match. One human is one identity however many wallets they hold.
//
// WHAT ACTUALLY GATES THE MONEY
//
// The qualifying purchase is a 100 G$ weekly pass — a day or two of free daily
// claims, so it is not a cost barrier and is not meant to be. The real gate is
// that GoodDollar verification is one-per-face: every qualified referral is a
// distinct human who passed a liveness check. That uniqueness IS the product
// being bought here, which is why the identity check above is not optional.

import { createPublicClient, http, type PublicClient } from "viem";
import { celo } from "viem/chains";
import { redis } from "./redis";
import { resolveGoodDollarIdentity } from "./gooddollar";
import { getReferral } from "./referral";

/** Naira paid per qualified referral. */
export const REFERRAL_REWARD_NGN = 700;

const YEAR = 365 * 24 * 60 * 60;
const qualifiedKey = (referee: string) => `referral:qualified:${referee.toLowerCase()}`;
const qualifiedSetKey = (referrer: string) => `referral:qualified-set:${referrer.toLowerCase()}`;
const paidKey = (referee: string) => `referral:paid:${referee.toLowerCase()}`;
const waivedKey = (referee: string) => `referral:waived:${referee.toLowerCase()}`;

export type QualifiedReferral = {
  referee: string;
  referrer: string;
  /** Identity roots at the time of qualifying, kept for audit. */
  refereeRoot: string;
  referrerRoot: string;
  qualifiedAt: number;
  rewardNgn: number;
};

export type ReferralPayment = {
  paidAt: number;
  by: string;
  amountNgn: number;
  note?: string;
};

/**
 * A qualified referral that will not be paid.
 *
 * The reward is discretionary — it is paid to referrers in Nigeria, and the app
 * has no country data, so eligibility is a human judgement made per person.
 * Without a way to record that judgement, every ineligible referral would sit
 * in the owed column forever and the dashboard's headline number would be a
 * figure nobody intends to pay. Waiving is settlement, not payment: the
 * referral stays qualified and visible, it just stops counting as a debt.
 */
export type ReferralWaiver = {
  waivedAt: number;
  by: string;
  note?: string;
};

function defaultClient(): PublicClient {
  return createPublicClient({
    chain: celo,
    transport: http(process.env.CELO_RPC_URL ?? "https://forno.celo.org"),
  }) as PublicClient;
}

export type QualifyResult =
  | { qualified: true; record: QualifiedReferral; alreadyRecorded: boolean }
  // "no-pass" is retained so anything persisted under the old rule still parses.
  | { qualified: false; reason: "no-referrer" | "not-verified" | "no-pass" | "same-identity" | "read-failed" };

/**
 * Decide whether a referee has earned their referrer the reward, and record it.
 *
 * A referral qualifies on VERIFICATION ALONE. It used to also require a season
 * pass, and in six weeks that produced 31 referrals and zero qualifiers — the
 * bar was not filtering bad referrals, it was stopping the programme working at
 * all. The pass was never the anti-abuse control either: at 100 G$, a day or
 * two of free claims, it was no barrier to anyone determined. Face uniqueness
 * is and always was the whole gate, and that is unchanged below.
 *
 * Idempotent: the qualification is written once with SET NX, so calling this on
 * every pass purchase, profile load and ops refresh cannot inflate anyone's
 * count. Safe to call speculatively — that is the point, since verification and
 * the pass purchase land at unpredictable times after the code is applied.
 */
export async function evaluateReferralQualification(
  refereeAddress: string,
  client: PublicClient = defaultClient(),
): Promise<QualifyResult> {
  const referee = refereeAddress.toLowerCase();

  const existing = await redis.get<QualifiedReferral>(qualifiedKey(referee)).catch(() => null);
  if (existing) return { qualified: true, record: existing, alreadyRecorded: true };

  const referral = await getReferral(referee);
  if (!referral.referredBy) return { qualified: false, reason: "no-referrer" };
  const referrer = referral.referredBy.toLowerCase();

  let refereeIdentity, referrerIdentity;
  try {
    [refereeIdentity, referrerIdentity] = await Promise.all([
      resolveGoodDollarIdentity(client, referee),
      resolveGoodDollarIdentity(client, referrer),
    ]);
  } catch {
    // Never guess when money depends on the answer.
    return { qualified: false, reason: "read-failed" };
  }

  if (!refereeIdentity.isVerified) return { qualified: false, reason: "not-verified" };
  // The check the address comparison in referral.ts cannot make.
  if (refereeIdentity.identityKey === referrerIdentity.identityKey) {
    return { qualified: false, reason: "same-identity" };
  }

  const record: QualifiedReferral = {
    referee,
    referrer,
    refereeRoot: refereeIdentity.identityKey,
    referrerRoot: referrerIdentity.identityKey,
    qualifiedAt: Date.now(),
    rewardNgn: REFERRAL_REWARD_NGN,
  };

  // NX so two concurrent evaluations cannot both credit the same referral.
  const written = await redis.set(qualifiedKey(referee), record, { nx: true, ex: YEAR });
  if (written) await redis.sadd(qualifiedSetKey(referrer), referee);

  return { qualified: true, record, alreadyRecorded: !written };
}

export async function getQualifiedReferrals(referrer: string): Promise<QualifiedReferral[]> {
  const referees = await redis.smembers(qualifiedSetKey(referrer)).catch(() => [] as string[]);
  if (!referees.length) return [];
  const records = await Promise.all(referees.map((r) => redis.get<QualifiedReferral>(qualifiedKey(r)).catch(() => null)));
  return records.filter((r): r is QualifiedReferral => !!r);
}

export async function getReferralPayment(referee: string): Promise<ReferralPayment | null> {
  return (await redis.get<ReferralPayment>(paidKey(referee)).catch(() => null)) ?? null;
}

export async function getReferralWaiver(referee: string): Promise<ReferralWaiver | null> {
  return (await redis.get<ReferralWaiver>(waivedKey(referee)).catch(() => null)) ?? null;
}

/**
 * Record that a qualified referral will not be paid, and why.
 *
 * Kept separate from payment so the two can never be confused in an audit: one
 * says money left, the other says it never will.
 */
export async function markReferralWaived(
  referee: string,
  by: string,
  note?: string,
): Promise<{ ok: boolean; waiver: ReferralWaiver; alreadyWaived: boolean }> {
  const addr = referee.toLowerCase();
  const waiver: ReferralWaiver = { waivedAt: Date.now(), by, note };
  const written = await redis.set(waivedKey(addr), waiver, { nx: true, ex: YEAR });
  if (written) return { ok: true, waiver, alreadyWaived: false };
  const existing = await getReferralWaiver(addr);
  return { ok: false, waiver: existing ?? waiver, alreadyWaived: true };
}

/**
 * Record that a qualified referral has been paid in Naira.
 *
 * Naira cannot settle on-chain, so a human sends the transfer and this is the
 * receipt. Written with NX for the same reason the bounty reserves a claim slot
 * before paying: two ops sessions marking the same referral must not produce
 * two payments.
 */
export async function markReferralPaid(
  referee: string,
  by: string,
  note?: string,
): Promise<{ ok: boolean; payment: ReferralPayment; alreadyPaid: boolean }> {
  const addr = referee.toLowerCase();
  const qualified = await redis.get<QualifiedReferral>(qualifiedKey(addr)).catch(() => null);
  const amountNgn = qualified?.rewardNgn ?? REFERRAL_REWARD_NGN;
  const payment: ReferralPayment = { paidAt: Date.now(), by, amountNgn, note };

  const written = await redis.set(paidKey(addr), payment, { nx: true, ex: YEAR });
  if (written) return { ok: true, payment, alreadyPaid: false };

  const existing = await getReferralPayment(addr);
  return { ok: false, payment: existing ?? payment, alreadyPaid: true };
}

export type ReferrerSummary = {
  referrer: string;
  code: string;
  totalReferred: number;
  qualified: number;
  paid: number;
  waived: number;
  unpaid: number;
  owedNgn: number;
  referees: {
    address: string;
    qualified: boolean;
    reason?: string;
    /** How this referral was settled, if it was. */
    settled: "paid" | "waived" | null;
    paidAt: number | null;
    waivedAt: number | null;
    amountNgn: number;
  }[];
};

/**
 * Everything ops needs for one referrer: who they brought, who qualified, and
 * what is still owed. Re-evaluates unqualified referees on the way through, so
 * opening the dashboard is also what backfills people who verified or bought a
 * pass since the last look.
 */
export async function getReferrerSummary(
  referrer: string,
  client: PublicClient = defaultClient(),
): Promise<ReferrerSummary> {
  const addr = referrer.toLowerCase();
  const referral = await getReferral(addr);

  const referees = await Promise.all(
    referral.referrals.map(async (referee) => {
      const result = await evaluateReferralQualification(referee, client);
      const [payment, waiver] = result.qualified
        ? await Promise.all([getReferralPayment(referee), getReferralWaiver(referee)])
        : [null, null];
      return {
        address: referee,
        qualified: result.qualified,
        reason: result.qualified ? undefined : result.reason,
        settled: payment ? ("paid" as const) : waiver ? ("waived" as const) : null,
        paidAt: payment?.paidAt ?? null,
        waivedAt: waiver?.waivedAt ?? null,
        amountNgn: result.qualified ? result.record.rewardNgn : 0,
      };
    }),
  );

  const qualified = referees.filter((r) => r.qualified);
  const paid = qualified.filter((r) => r.settled === "paid");
  const waived = qualified.filter((r) => r.settled === "waived");
  // Owed counts only what is genuinely outstanding: neither paid nor waived.
  const unpaid = qualified.length - paid.length - waived.length;

  return {
    referrer: addr,
    code: referral.code,
    totalReferred: referral.referrals.length,
    qualified: qualified.length,
    paid: paid.length,
    waived: waived.length,
    unpaid,
    owedNgn: unpaid * REFERRAL_REWARD_NGN,
    referees,
  };
}
