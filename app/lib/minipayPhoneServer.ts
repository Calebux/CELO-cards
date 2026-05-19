import { newKit } from "@celo/contractkit";
import { OdisUtils } from "@celo/identity";
import type { AuthSigner } from "@celo/identity/lib/odis/query";
import { redis } from "./redis";
import { normalizePhoneE164 } from "./minipayPhone";

export const MINIPAY_ISSUER = "0x7888612486844Bb9BE598668081c59A9f7367FBc";
const VERIFIED_PHONE_PREFIX = "user:phone:";
const DEFAULT_RPC_URL = "https://forno.celo.org";

type VerifyPhoneResult =
  | { ok: true; phoneNumber: string }
  | { ok: false; status: number; error: string };

function phoneKey(address: string): string {
  return `${VERIFIED_PHONE_PREFIX}${address.toLowerCase()}`;
}

function getIdentityPrivateKey(): string | null {
  return process.env.MINIPAY_IDENTITY_PRIVATE_KEY
    ?? process.env.TREASURY_PRIVATE_KEY
    ?? null;
}

function getRpcUrl(): string {
  return process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || DEFAULT_RPC_URL;
}

export async function getStoredVerifiedPhone(address: string): Promise<string | null> {
  return redis.get<string>(phoneKey(address));
}

export async function getStoredVerifiedPhones(addresses: string[]): Promise<Record<string, string>> {
  if (addresses.length === 0) return {};
  const keys = addresses.map((address) => phoneKey(address));
  const values = await redis.mget<string>(...keys);
  const map: Record<string, string> = {};
  addresses.forEach((address, index) => {
    const value = values[index];
    if (typeof value === "string" && value) {
      map[address] = value;
    }
  });
  return map;
}

export async function clearStoredVerifiedPhone(address: string): Promise<void> {
  await redis.del(phoneKey(address));
}

export async function verifyAndStoreMiniPayPhone(address: string, rawPhone: string): Promise<VerifyPhoneResult> {
  const normalizedAddress = address.toLowerCase();
  const phoneNumber = normalizePhoneE164(rawPhone);
  if (!phoneNumber) {
    return { ok: false, status: 400, error: "Phone number must be in E.164 format, for example +2348012345678." };
  }

  const privateKey = getIdentityPrivateKey();
  if (!privateKey) {
    return { ok: false, status: 503, error: "MiniPay phone verification is not configured on the server." };
  }

  const kit = newKit(getRpcUrl());
  const accountKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  kit.addAccount(accountKey);
  const localAccounts = kit.connection.getLocalAccounts();
  const quotaAccount = localAccounts[0];

  if (!quotaAccount) {
    return { ok: false, status: 503, error: "MiniPay phone verification account is unavailable." };
  }

  kit.defaultAccount = quotaAccount;

  // @celo/identity currently pins an older ContractKit build. Runtime
  // compatibility is fine here; this cast avoids the duplicate-type mismatch.
  const authSigner = {
    authenticationMethod: OdisUtils.Query.AuthenticationMethod.WALLET_KEY,
    contractKit: kit,
  } as unknown as AuthSigner;

  const serviceContext = OdisUtils.Query.getServiceContext(
    OdisUtils.Query.OdisContextName.MAINNET,
    OdisUtils.Query.OdisAPI.PNP,
  );

  try {
    const quota = await OdisUtils.Quota.getPnpQuotaStatus(
      quotaAccount,
      authSigner,
      serviceContext,
    );

    if (quota.remainingQuota < 1) {
      return { ok: false, status: 503, error: "MiniPay phone verification quota is exhausted right now. Top up ODIS quota, then try again." };
    }

    const { obfuscatedIdentifier } = await OdisUtils.Identifier.getObfuscatedIdentifier(
      phoneNumber,
      OdisUtils.Identifier.IdentifierPrefix.PHONE_NUMBER,
      quotaAccount,
      authSigner,
      serviceContext,
    );

    const federatedAttestations = await kit.contracts.getFederatedAttestations();
    const { accounts } = await federatedAttestations.lookupAttestations(
      obfuscatedIdentifier,
      [MINIPAY_ISSUER],
    );

    const matchesAddress = accounts.some(
      (account) => account.toLowerCase() === normalizedAddress
    );

    if (!matchesAddress) {
      return { ok: false, status: 409, error: "That phone number is not attested to this MiniPay wallet." };
    }

    await redis.set(phoneKey(normalizedAddress), phoneNumber);
    return { ok: true, phoneNumber };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Phone verification failed.";
    return { ok: false, status: 500, error: message.slice(0, 180) };
  }
}
