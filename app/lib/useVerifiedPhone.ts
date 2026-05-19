"use client";

import { useCallback, useEffect, useState } from "react";

type BulkPhoneMapResponse = { map?: Record<string, string> };
type SinglePhoneResponse = { phoneLabel?: string | null };

export function useVerifiedPhone(address: string | undefined, enabled = true) {
  const [phoneLabel, setPhoneLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !address) {
      setPhoneLabel(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/minipay-phone?address=${address.toLowerCase()}`, {
        cache: "no-store",
      });
      const data = await response.json() as SinglePhoneResponse;
      setPhoneLabel(data.phoneLabel ?? null);
    } catch {
      setPhoneLabel(null);
    } finally {
      setLoading(false);
    }
  }, [address, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { phoneLabel, loading, refresh, setPhoneLabel };
}

export async function fetchVerifiedPhoneMap(addresses: string[]): Promise<Record<string, string>> {
  if (addresses.length === 0) return {};
  const response = await fetch(`/api/minipay-phone?addresses=${addresses.join(",")}`, {
    cache: "no-store",
  });
  const data = await response.json() as BulkPhoneMapResponse;
  return data.map ?? {};
}
