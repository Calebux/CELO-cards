import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Card, Character, CARDS, CHARACTERS, buildDeck } from "./gameData";
import {
    generateAIOrder,
    AIRoundContext,
    resolveRound,
    calcEnergyPool,
    RoundResult,
    SlotResult,
    RoundOptions,
} from "./combatEngine";

export type ReplayRound = {
    playerCards: string[];    // card ids
    opponentCards: string[];  // card ids
    slotWinners: ("player" | "opponent" | "draw")[];
    playerKnocks: number[];
    opponentKnocks: number[];
};

export type MatchRecord = {
    id: string;
    date: string;
    playerCharId: string;
    opponentCharId: string;
    outcome: "win" | "loss";
    pointsEarned: number;
    playerRoundsWon: number;
    opponentRoundsWon: number;
    rounds?: ReplayRound[]; // per-round card data for replay
};

export type DeckPreset = {
    name: string;
    cardIds: string[];
};

export type MatchPhase =
    | "idle"
    | "character-select"
    | "lobby"
    | "loadout"
    | "waiting-for-opponent"
    | "combat"
    | "round-result"
    | "match-end";

interface GameState {
    // Characters
    selectedCharacter: Character | null;
    opponentCharacter: Character | null;

    // Deck & Order
    playerDeck: Card[];
    currentOrder: (Card | null)[];   // 5 slots
    opponentOrder: Card[];

    // Combat
    matchPhase: MatchPhase;
    roundNumber: number;
    playerRoundsWon: number;
    opponentRoundsWon: number;
    currentRoundResult: RoundResult | null;
    revealedSlots: number;
    precomputedRound: SlotResult[] | null; // pre-resolved slots for animation + finishRound

    // Energy
    maxEnergy: number;

    // Match
    matchId: string | null;
    setMatchId: (id: string | null) => void;

    // Multiplayer role
    playerRole: "host" | "joiner" | null;
    setPlayerRole: (role: "host" | "joiner" | null) => void;

    // VS House (AI) mode — skips lobby/ready
    vsBot: boolean;
    setVsBot: (v: boolean) => void;

    // AI difficulty (0=easy, 1=normal, 2=hard) — manual override for VS House
    aiDifficulty: 0 | 1 | 2;
    setAiDifficulty: (d: 0 | 1 | 2) => void;

    // Player identity (Celo wallet address)
    playerAddress: string | null;

    // Wager
    wagerActive: boolean;
    wagerTxHash: string | null;
    wagerCurrency: "cusd" | "celo" | "gdollar";
    wagerAmountInput: string;        // human-readable stake, e.g. "0.01"
    setWagerAmountInput: (v: string) => void;
    opponentWagered: boolean;
    setOpponentWagered: (v: boolean) => void;

    // Points
    playerPoints: number;
    pointsThisRound: number;

    // Match history
    matchesPlayed: number;
    matchesWon: number;
    matchesLost: number;

    // Streak
    winStreak: number;
    lossStreak: number;
    maxWinStreak: number;

    // Match history log
    matchHistory: MatchRecord[];

    // Accumulates per-round replay data during an active match; cleared on resetMatch
    currentMatchRounds: ReplayRound[];

    // Player profile
    playerName: string;

    // Deck presets
    deckPresets: DeckPreset[];

    // Ultimate
    ultimateActivated: boolean;
    ultimateUsed: boolean;
    activateUltimate: () => void;

    // Taunt
    playerTaunt: string | null;
    setPlayerTaunt: (taunt: string | null) => void;

    // Double-down
    wagerMultiplier: number;  // 1 or 2
    setWagerMultiplier: (m: number) => void;

    // Actions
    setPlayerAddress: (address: string | null) => void;
    setPlayerName: (name: string) => void;
    savePreset: (name: string) => void;
    loadPreset: (index: number) => void;
    deletePreset: (index: number) => void;
    setOpponentCharacterFromServer: (charId: string) => void;
    setPrecomputedFromServer: (slots: SlotResult[]) => void;
    setWager: (active: boolean, txHash: string | null, currency?: "cusd" | "celo" | "gdollar") => void;
    selectCharacter: (character: Character) => void;
    startMatch: () => void;
    addCardToSlot: (card: Card) => void;
    removeCardFromSlot: (slotIndex: number) => void;
    lockOrder: () => void;
    autoLockOrder: () => void;
    revealNextSlot: () => void;
    finishRound: () => void;
    nextRound: () => void;
    resetMatch: () => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
    selectedCharacter: null,
    opponentCharacter: null,
    playerDeck: [],
    currentOrder: [null, null, null, null, null],
    opponentOrder: [],
    matchPhase: "idle",
    roundNumber: 1,
    playerRoundsWon: 0,
    opponentRoundsWon: 0,
    currentRoundResult: null,
    revealedSlots: 0,
    precomputedRound: null,
    maxEnergy: 10,
    matchId: null,
    setMatchId: (id) => set({ matchId: id }),
    playerRole: null,
    setPlayerRole: (role) => set({ playerRole: role }),
    vsBot: false,
    setVsBot: (v) => set({ vsBot: v }),
    aiDifficulty: 1,
    setAiDifficulty: (d) => set({ aiDifficulty: d }),
    playerAddress: null,
    wagerActive: false,
    wagerTxHash: null,
    wagerCurrency: "cusd" as "cusd" | "celo" | "gdollar",
    wagerAmountInput: "0.01",
    setWagerAmountInput: (v) => set({ wagerAmountInput: v }),
    opponentWagered: false,
    setOpponentWagered: (v) => set({ opponentWagered: v }),
    playerPoints: 0,
    pointsThisRound: 0,
    matchesPlayed: 0,
    matchesWon: 0,
    matchesLost: 0,
    winStreak: 0,
    lossStreak: 0,
    maxWinStreak: 0,
    matchHistory: [],
    currentMatchRounds: [],
    playerName: "",
    deckPresets: [],
    ultimateActivated: false,
    ultimateUsed: false,
    playerTaunt: null,
    wagerMultiplier: 1,

    activateUltimate: () => {
        const { ultimateUsed, selectedCharacter } = get();
        if (ultimateUsed || !selectedCharacter?.ultimate) return;
        set({ ultimateActivated: true });
    },
    setPlayerTaunt: (taunt) => set({ playerTaunt: taunt }),
    setWagerMultiplier: (m) => set({ wagerMultiplier: m }),

    setPlayerAddress: (address) => set({ playerAddress: address }),
    setPlayerName: (name) => set({ playerName: name.slice(0, 20) }),

    savePreset: (name) => {
        const { currentOrder, deckPresets } = get();
        const cardIds = currentOrder.filter((c): c is Card => c !== null).map((c) => c.id);
        if (cardIds.length < 5) return;
        const newPreset: DeckPreset = { name: name.slice(0, 20) || `Preset ${deckPresets.length + 1}`, cardIds };
        set({ deckPresets: [...deckPresets.slice(0, 4), newPreset] }); // max 5
    },

    loadPreset: (index) => {
        const { deckPresets, playerDeck, maxEnergy } = get();
        const preset = deckPresets[index];
        if (!preset) return;
        const allCards = [...CARDS];
        const cards = preset.cardIds
            .map((id) => allCards.find((c) => c.id === id))
            .filter((c): c is Card => !!c);
        // Validate energy budget
        const totalCost = cards.reduce((s, c) => s + c.energyCost, 0);
        if (totalCost > maxEnergy) return; // preset no longer valid for this character
        const newOrder: (Card | null)[] = [null, null, null, null, null];
        cards.slice(0, 5).forEach((c, i) => { newOrder[i] = c; });
        set({ currentOrder: newOrder });
    },

    deletePreset: (index) => {
        const { deckPresets } = get();
        set({ deckPresets: deckPresets.filter((_, i) => i !== index) });
    },
    setWager: (active, txHash, currency = "cusd") => set({ wagerActive: active, wagerTxHash: txHash, wagerCurrency: currency as "cusd" | "celo" | "gdollar" }),

    setOpponentCharacterFromServer: (charId) => {
        const char = CHARACTERS.find((c) => c.id === charId);
        if (char) set({ opponentCharacter: char });
    },

    setPrecomputedFromServer: (slots) => {
        set({
            precomputedRound: slots,
            opponentOrder: slots.map((s) => s.opponentCard),
            matchPhase: "combat",
            revealedSlots: 0,
            currentRoundResult: null,
        });
    },

    selectCharacter: (character) => {
        set({ selectedCharacter: character });
    },

    startMatch: () => {
        const { selectedCharacter, matchId: existingMatchId } = get();

        const available = CHARACTERS.filter(
            (c) => c.id !== selectedCharacter?.id && !c.isLocked
        );
        const opponent = available[Math.floor(Math.random() * available.length)];
        const deck = buildDeck();

        // Energy pool from character's drainStat
        const maxEnergy = selectedCharacter ? calcEnergyPool(selectedCharacter) : 10;

        set({
            opponentCharacter: opponent,
            playerDeck: deck,
            matchPhase: "lobby",
            roundNumber: 1,
            playerRoundsWon: 0,
            opponentRoundsWon: 0,
            currentOrder: [null, null, null, null, null],
            opponentOrder: [],
            currentRoundResult: null,
            precomputedRound: null,
            revealedSlots: 0,
            matchId: existingMatchId, // keep the ID from the Ready screen
            maxEnergy,
        });
    },

    addCardToSlot: (card) => {
        const { currentOrder, maxEnergy } = get();
        const emptyIndex = currentOrder.findIndex((s) => s === null);
        if (emptyIndex === -1) return;
        if (currentOrder.some((s) => s?.id === card.id)) return;

        // Enforce energy budget
        const usedEnergy = currentOrder.reduce((s, c) => s + (c?.energyCost ?? 0), 0);
        if (usedEnergy + card.energyCost > maxEnergy) return;

        const newOrder = [...currentOrder];
        newOrder[emptyIndex] = card;
        set({ currentOrder: newOrder });
    },

    removeCardFromSlot: (slotIndex) => {
        const { currentOrder } = get();
        const newOrder = [...currentOrder];
        newOrder[slotIndex] = null;
        set({ currentOrder: newOrder });
    },

    lockOrder: () => {
        const { currentOrder, selectedCharacter, opponentCharacter, playerRoundsWon, opponentRoundsWon, winStreak, ultimateActivated, aiDifficulty } = get();
        const playerCards = currentOrder.filter((c): c is Card => c !== null);
        // Use manual difficulty; on normal/hard still allow streak to push to max
        const difficulty: 0 | 1 | 2 = aiDifficulty === 0 ? 0 : winStreak >= 2 ? 2 : aiDifficulty;
        const roundCtx: AIRoundContext = { playerRoundsWon, opponentRoundsWon, playerOrder: playerCards };
        const aiOrder = generateAIOrder(opponentCharacter ?? undefined, selectedCharacter ?? undefined, difficulty, roundCtx);
        const playerLastStand = playerRoundsWon === 0 && opponentRoundsWon >= 1;
        const opponentLastStand = opponentRoundsWon === 0 && playerRoundsWon >= 1;
        const opts: RoundOptions = {
            playerLastStand,
            opponentLastStand,
            playerUltimateEffect: ultimateActivated ? (selectedCharacter?.ultimate?.effect ?? undefined) : undefined,
            playerUltimateSlot: 0,
            opponentUltimateEffect: Math.random() < 0.25 ? (opponentCharacter?.ultimate?.effect ?? undefined) : undefined,
            opponentUltimateSlot: Math.floor(Math.random() * 5),
        };
        const precomputed = resolveRound(playerCards, aiOrder, selectedCharacter ?? undefined, opponentCharacter ?? undefined, opts);
        set({
            opponentOrder: aiOrder,
            precomputedRound: precomputed.slots,
            matchPhase: "combat",
            revealedSlots: 0,
            currentRoundResult: null,
            ultimateUsed: ultimateActivated ? true : get().ultimateUsed,
            ultimateActivated: false,
        });
    },

    autoLockOrder: () => {
        const { playerDeck, selectedCharacter, opponentCharacter, playerRoundsWon, opponentRoundsWon, winStreak, aiDifficulty } = get();
        const autoOrder = playerDeck.slice(0, 5);
        const difficulty: 0 | 1 | 2 = aiDifficulty === 0 ? 0 : winStreak >= 2 ? 2 : aiDifficulty;
        const roundCtx: AIRoundContext = { playerRoundsWon, opponentRoundsWon, playerOrder: autoOrder };
        const aiOrder = generateAIOrder(opponentCharacter ?? undefined, selectedCharacter ?? undefined, difficulty, roundCtx);
        const playerLastStand = playerRoundsWon === 0 && opponentRoundsWon >= 1;
        const opponentLastStand = opponentRoundsWon === 0 && playerRoundsWon >= 1;
        const opts: RoundOptions = {
            playerLastStand,
            opponentLastStand,
        };
        const precomputed = resolveRound(autoOrder, aiOrder, selectedCharacter ?? undefined, opponentCharacter ?? undefined, opts);
        set({
            currentOrder: autoOrder,
            opponentOrder: aiOrder,
            precomputedRound: precomputed.slots,
            matchPhase: "combat",
            revealedSlots: 0,
            currentRoundResult: null,
        });
    },

    revealNextSlot: () => {
        const { revealedSlots } = get();
        if (revealedSlots >= 5) return;
        set({ revealedSlots: revealedSlots + 1 });
    },

    finishRound: () => {
        const { precomputedRound, playerRoundsWon, opponentRoundsWon, playerPoints, matchesPlayed, matchesWon, matchesLost, winStreak, lossStreak, maxWinStreak, matchHistory, currentMatchRounds, matchId, selectedCharacter, opponentCharacter } = get();
        if (!precomputedRound) return;

        const totalPlayerKnock = precomputedRound.reduce((s, r) => s + r.playerKnock, 0);
        const totalOpponentKnock = precomputedRound.reduce((s, r) => s + r.opponentKnock, 0);
        const roundWinner: "player" | "opponent" | "draw" =
            totalPlayerKnock > totalOpponentKnock
                ? "player"
                : totalOpponentKnock > totalPlayerKnock
                ? "opponent"
                : "draw";

        const result: RoundResult = {
            slots: precomputedRound,
            totalPlayerKnock,
            totalOpponentKnock,
            roundWinner,
        };

        let pWon = playerRoundsWon;
        let oWon = opponentRoundsWon;
        if (result.roundWinner === "player") pWon++;
        if (result.roundWinner === "opponent") oWon++;

        const isMatchEnd = pWon >= 2 || oWon >= 2;

        const slotWins = result.slots.filter((s: SlotResult) => s.winner === "player").length;
        let earned = slotWins * 10;
        if (result.roundWinner === "player") earned += 50;
        if (isMatchEnd && pWon >= 2) earned += 100;

        // Update match history counters and streak when the match concludes
        const matchWon = isMatchEnd && pWon >= 2;
        const matchLost = isMatchEnd && oWon >= 2;

        let newWinStreak = winStreak;
        let newLossStreak = lossStreak;
        if (isMatchEnd) {
            if (matchWon) {
                newWinStreak = winStreak + 1;
                newLossStreak = 0;
                // Streak bonus multiplier: 3–4 = 1.5×, 5+ = 2×
                const mult = newWinStreak >= 5 ? 2 : newWinStreak >= 3 ? 1.5 : 1;
                earned = Math.round(earned * mult);
            } else if (matchLost) {
                newLossStreak = lossStreak + 1;
                newWinStreak = 0;
            }
        }
        const newMaxWinStreak = Math.max(maxWinStreak, newWinStreak);

        // Build replay data for this round
        const thisRound: ReplayRound = {
            playerCards: precomputedRound.map((s: SlotResult) => s.playerCard.id),
            opponentCards: precomputedRound.map((s: SlotResult) => s.opponentCard.id),
            slotWinners: precomputedRound.map((s: SlotResult) => s.winner),
            playerKnocks: precomputedRound.map((s: SlotResult) => s.playerKnock),
            opponentKnocks: precomputedRound.map((s: SlotResult) => s.opponentKnock),
        };
        const updatedMatchRounds = [...currentMatchRounds, thisRound];

        const newMatchHistory = isMatchEnd
            ? [
                {
                    id: matchId ?? `AO-${Date.now()}`,
                    date: new Date().toISOString(),
                    playerCharId: selectedCharacter?.id ?? "unknown",
                    opponentCharId: opponentCharacter?.id ?? "unknown",
                    outcome: matchWon ? ("win" as const) : ("loss" as const),
                    pointsEarned: earned,
                    playerRoundsWon: pWon,
                    opponentRoundsWon: oWon,
                    rounds: updatedMatchRounds,
                },
                ...matchHistory,
              ].slice(0, 50) // keep last 50
            : matchHistory;

        set({
            currentRoundResult: result,
            playerRoundsWon: pWon,
            opponentRoundsWon: oWon,
            matchPhase: isMatchEnd ? "match-end" : "round-result",
            playerPoints: playerPoints + earned,
            pointsThisRound: earned,
            precomputedRound: null, // consumed — second calls are now no-ops
            matchHistory: newMatchHistory,
            currentMatchRounds: isMatchEnd ? [] : updatedMatchRounds,
            ...(isMatchEnd && {
                matchesPlayed: matchesPlayed + 1,
                matchesWon: matchWon ? matchesWon + 1 : matchesWon,
                matchesLost: matchLost ? matchesLost + 1 : matchesLost,
                winStreak: newWinStreak,
                lossStreak: newLossStreak,
                maxWinStreak: newMaxWinStreak,
            }),
        });
    },

    nextRound: () => {
        const deck = buildDeck();
        set((s) => ({
            roundNumber: s.roundNumber + 1,
            playerDeck: deck,
            currentOrder: [null, null, null, null, null],
            opponentOrder: [],
            matchPhase: "loadout",
            currentRoundResult: null,
            precomputedRound: null,
            revealedSlots: 0,
            ultimateActivated: false,
            // ultimateUsed persists until match ends
        }));
    },

    resetMatch: () => {
        // Generate a fresh matchId so the Ready screen can share it immediately
        const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
        set((state) => ({
            selectedCharacter: null,
            opponentCharacter: null,
            playerDeck: [],
            currentOrder: [null, null, null, null, null],
            opponentOrder: [],
            matchPhase: "idle",
            roundNumber: 1,
            playerRoundsWon: 0,
            opponentRoundsWon: 0,
            currentRoundResult: null,
            precomputedRound: null,
            revealedSlots: 0,
            matchId: `AO-${suffix}`,
            playerRole: null,
            maxEnergy: 10,
            playerPoints: state.playerPoints, // keep — persisted to localStorage
            pointsThisRound: 0,
            wagerActive: false,
            wagerTxHash: null,
            wagerCurrency: "cusd",
            wagerAmountInput: "0.01",
            opponentWagered: false,
            ultimateActivated: false,
            ultimateUsed: false,
            playerTaunt: null,
            wagerMultiplier: 1,
            currentMatchRounds: [],
        }));
    },
    }),
    {
      name: "action-order-store",
      partialize: (state) => ({
        playerPoints: state.playerPoints,
        matchesPlayed: state.matchesPlayed,
        matchesWon: state.matchesWon,
        matchesLost: state.matchesLost,
        winStreak: state.winStreak,
        lossStreak: state.lossStreak,
        maxWinStreak: state.maxWinStreak,
        matchHistory: state.matchHistory,
        playerName: state.playerName,
        deckPresets: state.deckPresets,
      }),
    }
  )
);
