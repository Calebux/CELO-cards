import { redis } from "./redis";

const REFERRAL_BONUS_REFERRER = 100; // pts awarded to the person who referred
const REFERRAL_BONUS_REFEREE = 50;   // pts awarded to the new user who was referred
const MAX_REFERRALS_PER_ADDRESS = 50;

export type ReferralData = {
  code: string;           // unique code for this address
  referredBy: string | null; // address that referred this user (null if none)
  referrals: string[];    // addresses this user has referred
  totalBonusEarned: number;
};

/** Derive a short deterministic code from an address (first 8 hex chars after 0x) */
export function addressToCode(address: string): string {
  return address.toLowerCase().replace("0x", "").slice(0, 8);
}

export async function getReferral(address: string): Promise<ReferralData> {
  const addr = address.toLowerCase();
  const data = await redis.get<ReferralData>(`referral:${addr}`);
  if (data) return data;
  return {
    code: addressToCode(addr),
    referredBy: null,
    referrals: [],
    totalBonusEarned: 0,
  };
}

/** Apply a referral code for a new user. Returns bonus points if successful. */
export async function applyReferral(
  newUserAddress: string,
  referralCode: string
): Promise<{ ok: boolean; error?: string; referrerBonus: number; refereeBonus: number; referrerAddress?: string }> {
  const newAddr = newUserAddress.toLowerCase();

  // Find who owns this referral code (it's their first 8 hex chars)
  // We store a code → address mapping so we can look up fast
  const referrerAddr = await redis.get<string>(`referral-code:${referralCode.toLowerCase()}`);
  if (!referrerAddr) {
    return { ok: false, error: "Invalid referral code", referrerBonus: 0, refereeBonus: 0 };
  }
  if (referrerAddr === newAddr) {
    return { ok: false, error: "Cannot refer yourself", referrerBonus: 0, refereeBonus: 0 };
  }

  const newUserData = await getReferral(newAddr);
  if (newUserData.referredBy) {
    return { ok: false, error: "Already used a referral code", referrerBonus: 0, refereeBonus: 0 };
  }

  const referrerData = await getReferral(referrerAddr);
  if (referrerData.referrals.length >= MAX_REFERRALS_PER_ADDRESS) {
    return { ok: false, error: "Referrer has reached their referral limit", referrerBonus: 0, refereeBonus: 0 };
  }

  // Update both records
  newUserData.referredBy = referrerAddr;
  newUserData.totalBonusEarned += REFERRAL_BONUS_REFEREE;

  referrerData.referrals = [...referrerData.referrals, newAddr];
  referrerData.totalBonusEarned += REFERRAL_BONUS_REFERRER;

  await Promise.all([
    redis.set(`referral:${newAddr}`, newUserData, { ex: 60 * 60 * 24 * 365 }),
    redis.set(`referral:${referrerAddr}`, referrerData, { ex: 60 * 60 * 24 * 365 }),
  ]);

  return {
    ok: true,
    referrerBonus: REFERRAL_BONUS_REFERRER,
    refereeBonus: REFERRAL_BONUS_REFEREE,
    referrerAddress: referrerAddr,
  };
}

/** Register an address's referral code so it can be looked up. Call on first profile load. */
export async function registerReferralCode(address: string): Promise<void> {
  const addr = address.toLowerCase();
  const code = addressToCode(addr);
  // NX = only set if not exists
  await redis.set(`referral-code:${code}`, addr, { ex: 60 * 60 * 24 * 365 });
}
