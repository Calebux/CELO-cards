"use client";

// WalletSync — mounts once inside Providers.
// • In MiniPay WebView: auto-connects via the injected provider (no modal)
// • Everywhere: keeps gameStore.playerAddress + playerName in sync with wagmi address

import { useEffect, useSyncExternalStore } from "react";
import { useAccount, useConnect, useConnectors } from "wagmi";
import { useGameStore } from "./gameStore";
import { reportAuthFailure } from "./authTelemetry";
import { getMiniPayConnector, isMiniPay } from "./minipay";
import { useRef } from "react";
import type { CardProgressPayload } from "./cardProgress";
import { celo } from "wagmi/chains";
import {
  clearWeb3AuthSessionHint,
  getWeb3AuthResuming,
  hasWeb3AuthSessionHint,
  isWeb3AuthSignInInFlight,
  setWeb3AuthResuming,
  subscribeWeb3AuthResuming,
} from "./web3authSession";
import { retryWeb3AuthAuthorization } from "./web3authResume";

// True while a restored Web3Auth session is being re-attached to wagmi after an
// OAuth redirect. Lets the sign-in button show progress instead of looking dead.
export function useWeb3AuthResuming(): boolean {
  return useSyncExternalStore(subscribeWeb3AuthResuming, getWeb3AuthResuming, () => false);
}

export function WalletSync() {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const connectors = useConnectors();
  const setPlayerAddress = useGameStore((s) => s.setPlayerAddress);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const hydrateCardProgress = useGameStore((s) => s.hydrateCardProgress);
  const clearCardProgress = useGameStore((s) => s.clearCardProgress);
  const playerName = useGameStore((s) => s.playerName);
  const progressAddressRef = useRef<string | null>(null);
  const attemptedWeb3AuthResumeRef = useRef(false);

  useEffect(() => {
    if (!isMiniPay() || isConnected) return;

    let cancelled = false;
    let inFlight = false;
    let attempts = 0;
    const connector = getMiniPayConnector();

    const ensureConnected = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        await connectAsync({ connector });
      } catch {
        // Provider injection can lag inside MiniPay WebViews; retry below.
      } finally {
        inFlight = false;
      }
    };

    void ensureConnected();

    const retry = window.setInterval(() => {
      if (cancelled || isConnected) {
        window.clearInterval(retry);
        return;
      }
      attempts += 1;
      if (attempts > 8) {
        window.clearInterval(retry);
        return;
      }
      void ensureConnected();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(retry);
    };
  }, [connectAsync, isConnected]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isMiniPay() || isConnected) {
      attemptedWeb3AuthResumeRef.current = false;
      return;
    }
    // Runs on every web page INCLUDING the landing "/": a mobile OAuth sign-in
    // uses redirect uxMode and returns to the page it started from (usually "/"),
    // and this effect is what re-attaches the restored Web3Auth session to wagmi
    // so the account is recognised immediately — no manual second sign-in on
    // another page. Gated by the session hint, so anonymous visitors never load
    // the Web3Auth SDK on the landing.
    if (attemptedWeb3AuthResumeRef.current) return;
    if (!hasWeb3AuthSessionHint()) return;
    // A live sign-in writes the hint before opening the login, so without this
    // the resume treats someone still on Google's screen as a returning user
    // and races their own attempt. Do not mark it attempted — this effect
    // should run normally once the interactive attempt is over.
    if (isWeb3AuthSignInInFlight()) return;

    const web3AuthConnector = connectors.find((connector) => connector.id === "web3auth");
    if (!web3AuthConnector) return;

    attemptedWeb3AuthResumeRef.current = true;
    let cancelled = false;
    let watchdog = 0;

    void (async () => {
      // Returning from an OAuth redirect on mobile, this has to pull the ~1.3 MB
      // SDK and await init() before it can re-attach — several seconds. Flag it
      // so the wallet UI can say so instead of sitting on "SIGN IN", which reads
      // as broken and makes people tap it.
      setWeb3AuthResuming(true);
      // Watchdog: whatever stalls — a hung connect, an SDK that never loads —
      // the header must not sit on SIGNING IN forever. Falling back to SIGN IN
      // is honest and leaves the user a working tap.
      watchdog = window.setTimeout(() => setWeb3AuthResuming(false), 25_000);
      try {
        // Modal v10's init() may resolve just before redirect rehydration sets
        // `connected`. Do not delete the session hint on that first temporary
        // false; poll the existing instance without opening the login modal.
        const authorized = await retryWeb3AuthAuthorization(
          () => web3AuthConnector.isAuthorized(),
          // Stop polling the moment the user starts a real sign-in, so the poll
          // can never outlive the window this resume was meant for.
          { shouldAbort: isWeb3AuthSignInInFlight },
        );
        if (cancelled || isWeb3AuthSignInInFlight()) return;
        if (!authorized) {
          clearWeb3AuthSessionHint();
          return;
        }
        // Re-check immediately before connecting: the poll can take seconds, and
        // a second connect landing on top of a live OAuth handshake is what
        // breaks the googleapis.com token exchange.
        if (isWeb3AuthSignInInFlight()) return;
        await connectAsync({ connector: web3AuthConnector, chainId: celo.id });
      } catch (e) {
        // Keep the hint after SDK/network failures so a later load can retry.
        if (!cancelled) reportAuthFailure("resume", e);
      } finally {
        window.clearTimeout(watchdog);
        if (!cancelled) setWeb3AuthResuming(false);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      setWeb3AuthResuming(false);
    };
  }, [connectAsync, connectors, isConnected]);

  useEffect(() => {
    setPlayerAddress(address ?? null);
  }, [address, setPlayerAddress]);

  useEffect(() => {
    if (!address) {
      setPlayerName("");
      return;
    }
    void fetch(`/api/username?address=${address.toLowerCase()}&t=${Date.now()}`)
      .then((r) => r.json())
      .then((d: { username?: string | null }) => {
        setPlayerName(d.username ?? "");
      })
      .catch(() => {});
  }, [address, setPlayerName]);

  useEffect(() => {
    if (!address) {
      return;
    }

    const lower = address.toLowerCase();
    const switchedWallet = progressAddressRef.current !== lower;
    progressAddressRef.current = lower;
    if (switchedWallet) {
      clearCardProgress();
    }

    let cancelled = false;
    void fetch(`/api/card-progress?address=${lower}&t=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: CardProgressPayload | null) => {
        if (cancelled || !data) return;
        hydrateCardProgress({
          attunedCardIds: data.attunedCardIds ?? [],
          cardPerformance: data.cardPerformance ?? {},
          updatedAt: data.updatedAt ?? 0,
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [address, clearCardProgress, hydrateCardProgress]);

  return null;
}
