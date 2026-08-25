"use client";

import { useMemo } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  usePublicClient,
  useSignMessage,
  useSignTypedData,
  useWriteContract,
} from "wagmi";
import {
  ACTIONORDER_SKILL_ID,
  createGoodAgentWidgetConfig,
  createWalletAdapterFromHooks,
  type GoodAgentWalletAdapter,
} from "@goodagent/widget";

export function useGoodAgentWallet(): GoodAgentWalletAdapter {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  return useMemo(
    () =>
      createWalletAdapterFromHooks({
        address,
        isConnected,
        connect: async () => {
          if (!isConnected && openConnectModal) openConnectModal();
        },
        signMessageAsync,
        signTypedDataAsync,
        writeContractAsync,
        waitForTransactionReceipt: publicClient
          ? ({ hash }) => publicClient.waitForTransactionReceipt({ hash })
          : undefined,
      }),
    [
      address,
      isConnected,
      openConnectModal,
      signMessageAsync,
      signTypedDataAsync,
      writeContractAsync,
      publicClient,
    ],
  );
}

export function useGoodAgentWidgetConfig() {
  return useMemo(
    () =>
      createGoodAgentWidgetConfig(ACTIONORDER_SKILL_ID, {
        partnerId: "action-order",
        deployHint:
          "Deploy a verified agent to grind House Boss matches and bounties on your behalf.",
        fvCallbackUrl:
          typeof window !== "undefined"
            ? `${window.location.origin}/agents`
            : undefined,
      }),
    [],
  );
}
