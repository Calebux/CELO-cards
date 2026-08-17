"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { celo } from "wagmi/chains";
import {
  IDENTITY_CONTRACT,
  IDENTITY_ABI,
  deriveGoodDollarStatus,
  type GoodDollarStatus,
} from "./gooddollar";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Resolves whether the connected wallet is G$ Verified now, lapsed, or never was.
 *
 * Returns undefined while the chain reads are still in flight, so callers never
 * flash a "you're not verified" prompt at someone who turns out to be verified.
 *
 * Two round trips by necessity: which account holds the authentication record
 * depends on the first batch (it is the whitelisted root, else the linked root,
 * else the wallet itself), so `lastAuthenticated` can only be asked afterwards.
 * Both are batched and cached by wagmi, and this only drives a modal — nothing
 * here gates money. Payment paths gate server-side instead.
 */
export function useGoodDollarStatus(): GoodDollarStatus | undefined {
  const { address } = useAccount();

  const { data: base } = useReadContracts({
    contracts: [
      {
        address: IDENTITY_CONTRACT,
        abi: IDENTITY_ABI,
        functionName: "getWhitelistedRoot",
        args: address ? [address] : undefined,
        chainId: celo.id,
      },
      {
        address: IDENTITY_CONTRACT,
        abi: IDENTITY_ABI,
        functionName: "connectedAccounts",
        args: address ? [address] : undefined,
        chainId: celo.id,
      },
      {
        address: IDENTITY_CONTRACT,
        abi: IDENTITY_ABI,
        functionName: "authenticationPeriod",
        chainId: celo.id,
      },
    ],
    query: { enabled: !!address },
  });

  const whitelistedRoot = base?.[0]?.status === "success" ? (base[0].result as string) : undefined;
  const connectedRoot = base?.[1]?.status === "success" ? (base[1].result as string) : undefined;
  const authPeriod = base?.[2]?.status === "success" ? (base[2].result as bigint) : undefined;

  // The account whose authentication timestamp decides expiry.
  const subject =
    whitelistedRoot && whitelistedRoot !== ZERO
      ? whitelistedRoot
      : connectedRoot && connectedRoot !== ZERO
        ? connectedRoot
        : address;

  const { data: lastAuthenticated } = useReadContract({
    address: IDENTITY_CONTRACT,
    abi: IDENTITY_ABI,
    functionName: "lastAuthenticated",
    args: subject ? [subject as `0x${string}`] : undefined,
    chainId: celo.id,
    query: { enabled: !!subject && whitelistedRoot !== undefined },
  });

  if (!address) return undefined;
  if (whitelistedRoot === undefined || connectedRoot === undefined || authPeriod === undefined) return undefined;
  if (lastAuthenticated === undefined) return undefined;

  return deriveGoodDollarStatus({
    address,
    whitelistedRoot,
    connectedRoot,
    lastAuthenticated: lastAuthenticated as bigint,
    authenticationPeriodDays: authPeriod,
  });
}
