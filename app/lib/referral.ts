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

/**
 * The original code: the first 8 hex chars of the address.
 *
 * Kept because ~112 of these are already in the wild and must keep resolving,
 * and because it is still the fallback shape for a record written before codes
 * were minted. New codes come from `mintReferralCode` instead — a code derived
 * from the address is a wallet address in disguise, which is both guessable and
 * the reason referrals cannot be shown in some surfaces.
 */
export function addressToCode(address: string): string {
  return address.toLowerCase().replace("0x", "").slice(0, 8);
}

/**
 * Characters that survive being read aloud, retyped, or squinted at in a
 * screenshot. No 0/o, 1/l/i — a referral code gets copied by hand often enough
 * that the ambiguous pairs are worth losing.
 */
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 8;

function randomCode(): string {
  // Web Crypto, not node:crypto — this module is imported by the profile page
  // too, and a `node:` scheme cannot be bundled for the browser.
  const bytes = new Uint8Array(CODE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
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

/**
 * Make sure this address has a shareable code, and that every code it has ever
 * had still resolves. Call on first profile load.
 *
 * The address-derived code is mapped too, always: codes already shared in a
 * chat or on a poster keep working forever, whatever the record says today.
 */
export async function registerReferralCode(address: string): Promise<string> {
  const addr = address.toLowerCase();
  const legacy = addressToCode(addr);
  const YEAR = 60 * 60 * 24 * 365;

  // The legacy mapping is kept alive regardless — see above.
  await redis.set(`referral-code:${legacy}`, addr, { ex: YEAR });

  const existing = await redis.get<ReferralData>(`referral:${addr}`);
  if (existing?.code && existing.code !== legacy) {
    await redis.set(`referral-code:${existing.code}`, addr, { ex: YEAR });
    return existing.code;
  }

  // Mint one. SET NX settles collisions: whoever writes the key owns the code.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const won = await redis.set(`referral-code:${code}`, addr, { nx: true, ex: YEAR });
    if (won === null) continue;

    const data = existing ?? {
      code,
      referredBy: null,
      referrals: [],
      totalBonusEarned: 0,
    };
    data.code = code;
    await redis.set(`referral:${addr}`, data, { ex: YEAR });
    return code;
  }

  // Five collisions in a row is not going to happen, but falling back to the
  // legacy code beats leaving the caller without one.
  return legacy;
}

/** Where a shared referral link points. */
export const REFERRAL_PARAM = "ref";

/**
 * The full link to share. Falls back to the production host so a link built on
 * a preview deploy still sends people somewhere real.
 */
export function referralLink(code: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://www.actionorder.xyz").replace(/\/$/, "");
  return `${base}/?${REFERRAL_PARAM}=${encodeURIComponent(code)}`;
}
