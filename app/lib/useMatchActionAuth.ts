"use client";

import { useCallback } from "react";
import { useSignTypedData } from "wagmi";
import {
  MatchAction,
  MatchRole,
  MATCH_ACTION_TYPED_DOMAIN,
  MATCH_ACTION_TYPED_TYPES,
  buildMatchActionTypedMessage,
} from "./matchAuth";

export function useMatchActionAuth() {
  const { signTypedDataAsync } = useSignTypedData();

  return useCallback(async (params: {
    address: string;
    matchId: string;
    role: MatchRole;
    action: MatchAction;
    round?: number;
    payload: Record<string, unknown>;
  }) => {
    const issuedAt = Date.now();
    const signature = await signTypedDataAsync({
      domain: MATCH_ACTION_TYPED_DOMAIN,
      types: MATCH_ACTION_TYPED_TYPES,
      primaryType: "MatchAction",
      message: buildMatchActionTypedMessage({
        wallet: params.address,
        matchId: params.matchId,
        role: params.role,
        action: params.action,
        round: params.round,
        payload: params.payload,
        issuedAt,
      }),
    });

    return {
      address: params.address.toLowerCase(),
      issuedAt,
      signature,
    };
  }, [signTypedDataAsync]);
}
