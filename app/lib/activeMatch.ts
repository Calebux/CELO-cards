"use client";

import { useEffect, useState } from "react";
import { MatchMode, useGameStore } from "./gameStore";

export type ActiveMatchResume = {
  matchId: string;
  role: "host" | "joiner";
  mode: MatchMode;
  route: "/select-character" | "/lobby" | "/loadout" | "/gameplay";
  selfCharId: string | null;
  opponentCharId: string | null;
  opponentName: string | null;
};

export async function fetchActiveMatchResume(address: string): Promise<ActiveMatchResume | null> {
  const res = await fetch(`/api/matches/active?address=${encodeURIComponent(address)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json() as { match?: ActiveMatchResume | null };
  return data.match ?? null;
}

export function hydrateActiveMatchResume(match: ActiveMatchResume): void {
  const state = useGameStore.getState();
  state.setVsBot(false);
  state.setMatchId(match.matchId);
  state.setMatchMode(match.mode);
  state.setPlayerRole(match.role);
  if (match.selfCharId) state.setSelectedCharacterFromServer(match.selfCharId);
  if (match.opponentCharId) state.setOpponentCharacterFromServer(match.opponentCharId);
  state.setOpponentName(match.opponentName ?? null);
}

export function useActiveMatchResume(address?: string): ActiveMatchResume | null {
  const [match, setMatch] = useState<ActiveMatchResume | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!address) {
      setMatch(null);
      return;
    }

    const refresh = () => {
      void fetchActiveMatchResume(address)
        .then((nextMatch) => {
          if (!cancelled) setMatch(nextMatch);
        })
        .catch(() => {
          if (!cancelled) setMatch(null);
        });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    const intervalId = window.setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [address]);

  return match;
}
