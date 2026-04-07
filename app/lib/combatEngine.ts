import { Card, CardType, Character, CARDS } from "./gameData";

// ── Combat character stats ─────────────────────────────────────────────────

export interface CombatChar {
    knockMult: number;     // multiplier applied to all knock dealt
    priorityBonus: number; // fractional bonus that breaks priority ties
}

export interface SlotContext {
    player: CombatChar;
    opponent: CombatChar;
    playerKnockDebuff: number;   // flat reduction to player's knock this slot
    opponentKnockDebuff: number; // flat reduction to opponent's knock this slot
    playerTotalKnock: number;    // running total before this slot (for Finisher)
    opponentTotalKnock: number;  // running total before this slot
}

export function charToCombat(c: Character): CombatChar {
    return {
        knockMult: c.knockStat / 75, // 75 = baseline 1.0×
        priorityBonus: c.priorityStat,
    };
}

export function calcEnergyPool(c: Character): number {
    return Math.round(4 + (c.drainStat / 100) * 6);
}

const DEFAULT_CHAR: CombatChar = { knockMult: 1, priorityBonus: 0 };

const DEFAULT_CTX: SlotContext = {
    player: DEFAULT_CHAR,
    opponent: DEFAULT_CHAR,
    playerKnockDebuff: 0,
    opponentKnockDebuff: 0,
    playerTotalKnock: 0,
    opponentTotalKnock: 0,
};

// ── Type advantage matrix ──────────────────────────────────────────────────

export function getTypeAdvantage(a: CardType, b: CardType): "win" | "lose" | "draw" {
    if (a === b) return "draw";
    if (
        (a === "strike" && b === "control") ||
        (a === "control" && b === "defense") ||
        (a === "defense" && b === "strike")
    ) return "win";
    return "lose";
}

// ── Slot resolution ────────────────────────────────────────────────────────

export interface SlotResult {
    playerCard: Card;
    opponentCard: Card;
    winner: "player" | "opponent" | "draw";
    playerKnock: number;   // knock dealt TO opponent
    opponentKnock: number; // knock dealt TO player
    typeAdvantage: "win" | "lose" | "draw";
    priorityWinner: "player" | "opponent" | "tie";
    description: string;
    effect?: string;
    nextOpponentKnockDebuff?: number;
    nextPlayerKnockDebuff?: number;
}

export function resolveSlot(
    playerCard: Card,
    opponentCard: Card,
    ctx: Partial<SlotContext> = {}
): SlotResult {
    const c: SlotContext = { ...DEFAULT_CTX, ...ctx };

    // ── Evasion: avoid all damage ────────────────────────────────────────
    if (playerCard.id === "evasion") {
        return {
            playerCard, opponentCard,
            winner: "draw",
            playerKnock: 0, opponentKnock: 0,
            typeAdvantage: "draw", priorityWinner: "tie",
            description: `${playerCard.name} phases out — no damage exchanged.`,
            effect: "evasion",
        };
    }
    if (opponentCard.id === "evasion") {
        return {
            playerCard, opponentCard,
            winner: "draw",
            playerKnock: 0, opponentKnock: 0,
            typeAdvantage: "draw", priorityWinner: "tie",
            description: `Opponent uses ${opponentCard.name} — no damage exchanged.`,
            effect: "evasion",
        };
    }

    // ── Reversal Edge vs Strike: reflect force ───────────────────────────
    if (playerCard.id === "reversal_edge" && opponentCard.type === "strike") {
        const reflected = Math.round(opponentCard.knock * c.opponent.knockMult);
        return {
            playerCard, opponentCard,
            winner: "player",
            playerKnock: reflected, opponentKnock: 0,
            typeAdvantage: "win", priorityWinner: "player",
            description: `${playerCard.name} reflects ${opponentCard.name}'s force back!`,
            effect: "reversal",
        };
    }
    if (opponentCard.id === "reversal_edge" && playerCard.type === "strike") {
        const reflected = Math.round(playerCard.knock * c.player.knockMult);
        return {
            playerCard, opponentCard,
            winner: "opponent",
            playerKnock: 0, opponentKnock: reflected,
            typeAdvantage: "lose", priorityWinner: "opponent",
            description: `Opponent's ${opponentCard.name} reflects your ${playerCard.name}!`,
            effect: "reversal",
        };
    }

    // ── Mind Game flags (cancels opponent defense effects) ───────────────
    const playerMindGame = playerCard.id === "mind_game";
    const opponentMindGame = opponentCard.id === "mind_game";

    // ── Type advantage (Phantom Break pierces defense) ───────────────────
    let typeAdv = getTypeAdvantage(playerCard.type, opponentCard.type);
    if (playerCard.id === "phantom_break" && opponentCard.type === "defense") typeAdv = "win";
    if (opponentCard.id === "phantom_break" && playerCard.type === "defense") typeAdv = "lose";

    // ── Priority comparison (priorityStat breaks ties) ───────────────────
    const pPriority = playerCard.priority + c.player.priorityBonus * 0.01;
    const oPriority = opponentCard.priority + c.opponent.priorityBonus * 0.01;
    const priorityWinner: "player" | "opponent" | "tie" =
        pPriority > oPriority ? "player" : oPriority > pPriority ? "opponent" : "tie";

    let playerKnockBase = 0;
    let opponentKnockBase = 0;
    let winner: "player" | "opponent" | "draw" = "draw";
    let description = "";

    if (typeAdv === "win") {
        playerKnockBase = playerCard.knock;
        opponentKnockBase = Math.max(0, Math.floor(opponentCard.knock * 0.3));
        winner = "player";
        description = `${playerCard.name} overcomes ${opponentCard.name}! ${playerCard.type.toUpperCase()} beats ${opponentCard.type.toUpperCase()}`;
    } else if (typeAdv === "lose") {
        opponentKnockBase = opponentCard.knock;
        playerKnockBase = Math.max(0, Math.floor(playerCard.knock * 0.3));
        winner = "opponent";
        description = `${opponentCard.name} overcomes ${playerCard.name}! ${opponentCard.type.toUpperCase()} beats ${playerCard.type.toUpperCase()}`;
    } else {
        if (priorityWinner === "player") {
            playerKnockBase = playerCard.knock;
            opponentKnockBase = Math.floor(opponentCard.knock * 0.5);
            winner = "player";
            description = `Both play ${playerCard.type.toUpperCase()} — ${playerCard.name} strikes first!`;
        } else if (priorityWinner === "opponent") {
            opponentKnockBase = opponentCard.knock;
            playerKnockBase = Math.floor(playerCard.knock * 0.5);
            winner = "opponent";
            description = `Both play ${playerCard.type.toUpperCase()} — ${opponentCard.name} strikes first!`;
        } else {
            playerKnockBase = Math.floor(playerCard.knock * 0.5);
            opponentKnockBase = Math.floor(opponentCard.knock * 0.5);
            winner = "draw";
            description = `${playerCard.name} clashes with ${opponentCard.name} — a perfect stalemate!`;
        }
    }

    // ── Disrupt: zero out if opponent isn't striking ─────────────────────
    if (playerCard.id === "disrupt" && opponentCard.type !== "strike") {
        playerKnockBase = 0;
        description = `${playerCard.name} finds no opening — opponent isn't striking.`;
    }
    if (opponentCard.id === "disrupt" && playerCard.type !== "strike") {
        opponentKnockBase = 0;
    }

    // ── Guard Stance: blocks attacks with priority ≤ 2 ───────────────────
    if (playerCard.id === "guard_stance" && opponentCard.priority <= 2 && !opponentMindGame) {
        opponentKnockBase = 0;
        description = `${playerCard.name} shuts down the slow ${opponentCard.name}!`;
    }
    if (opponentCard.id === "guard_stance" && playerCard.priority <= 2 && !playerMindGame) {
        playerKnockBase = 0;
    }

    // ── Stability: reduces incoming strike knock by 40% ───────────────────
    if (playerCard.id === "stability" && opponentCard.type === "strike" && !opponentMindGame) {
        opponentKnockBase = Math.round(opponentKnockBase * 0.6);
    }
    if (opponentCard.id === "stability" && playerCard.type === "strike" && !playerMindGame) {
        playerKnockBase = Math.round(playerKnockBase * 0.6);
    }

    // ── Anticipation: halves all incoming knock ───────────────────────────
    if (playerCard.id === "anticipation" && !opponentMindGame) {
        opponentKnockBase = Math.round(opponentKnockBase * 0.5);
    }
    if (opponentCard.id === "anticipation" && !playerMindGame) {
        playerKnockBase = Math.round(playerKnockBase * 0.5);
    }

    // ── Apply character knock multiplier ─────────────────────────────────
    let playerKnock = Math.round(playerKnockBase * c.player.knockMult);
    let opponentKnock = Math.round(opponentKnockBase * c.opponent.knockMult);

    // ── Apply slot debuffs from previous Pressure Advance ────────────────
    playerKnock = Math.max(0, playerKnock - c.playerKnockDebuff);
    opponentKnock = Math.max(0, opponentKnock - c.opponentKnockDebuff);

    // ── Direct Impact: floor at 50% of base even on loss ─────────────────
    if (playerCard.id === "direct_impact") {
        const floor = Math.round(playerCard.knock * c.player.knockMult * 0.5);
        playerKnock = Math.max(playerKnock, floor);
    }
    if (opponentCard.id === "direct_impact") {
        const floor = Math.round(opponentCard.knock * c.opponent.knockMult * 0.5);
        opponentKnock = Math.max(opponentKnock, floor);
    }

    // ── Finisher: +4 bonus when currently losing ─────────────────────────
    if (playerCard.id === "finisher" && c.playerTotalKnock < c.opponentTotalKnock) {
        playerKnock += 4;
        description += " [FINISHER ACTIVATED!]";
    }
    if (opponentCard.id === "finisher" && c.opponentTotalKnock < c.playerTotalKnock) {
        opponentKnock += 4;
    }

    // ── Power Punch: +3 bonus on type-advantage win ───────────────────────
    if (playerCard.id === "power_punch" && typeAdv === "win") {
        playerKnock += 3;
    }
    if (opponentCard.id === "power_punch" && typeAdv === "lose") {
        opponentKnock += 3;
    }

    // ── Recalculate winner after all modifiers ────────────────────────────
    if (playerKnock > opponentKnock) winner = "player";
    else if (opponentKnock > playerKnock) winner = "opponent";
    else winner = "draw";

    // ── Pressure Advance: debuff opponent's next slot by -2 ──────────────
    const nextOpponentKnockDebuff = playerCard.id === "pressure_advance" ? 2 : 0;
    const nextPlayerKnockDebuff = opponentCard.id === "pressure_advance" ? 2 : 0;

    const effect =
        playerCard.id === "pressure_advance" || opponentCard.id === "pressure_advance"
            ? "pressure"
            : playerCard.id === "mind_game" || opponentCard.id === "mind_game"
            ? "mindgame"
            : undefined;

    return {
        playerCard, opponentCard,
        winner,
        playerKnock, opponentKnock,
        typeAdvantage: typeAdv,
        priorityWinner,
        description,
        effect,
        nextOpponentKnockDebuff: nextOpponentKnockDebuff || undefined,
        nextPlayerKnockDebuff: nextPlayerKnockDebuff || undefined,
    };
}

// ── AI order generation ────────────────────────────────────────────────────

export function generateAIOrder(aiChar?: Character, _playerChar?: Character): Card[] {
    const energyPool = aiChar ? calcEnergyPool(aiChar) : 10;

    // Score each card by strategic value
    const scored = CARDS.map((c) => {
        let score = c.knock + c.priority * 0.5;
        // Strategic bonuses for impactful cards
        if (c.id === "reversal_edge") score += 3;
        if (c.id === "anticipation") score += 2;
        if (c.id === "disrupt") score += 2;
        if (c.id === "evasion") score += 1;
        // Energy efficiency bonus
        score += c.energyCost === 0 ? 2 : c.knock / (c.energyCost + 0.5);
        return { card: c, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const picks: Card[] = [];
    let usedEnergy = 0;
    const typeCount: Record<string, number> = { strike: 0, defense: 0, control: 0 };

    // First pass: pick within energy budget with type variety
    for (const { card } of scored) {
        if (picks.length >= 5) break;
        if (usedEnergy + card.energyCost > energyPool) continue;
        if (typeCount[card.type] >= 2) continue;
        picks.push(card);
        usedEnergy += card.energyCost;
        typeCount[card.type]++;
    }

    // Second pass: fill remaining slots ignoring type limit (still respect budget)
    for (const { card } of scored) {
        if (picks.length >= 5) break;
        if (picks.some((p) => p.id === card.id)) continue;
        if (usedEnergy + card.energyCost > energyPool) continue;
        picks.push(card);
        usedEnergy += card.energyCost;
    }

    // Final pass: fill any remaining slots ignoring budget (guarantees 5 cards)
    for (const { card } of scored) {
        if (picks.length >= 5) break;
        if (picks.some((p) => p.id === card.id)) continue;
        picks.push(card);
    }

    // Shuffle for unpredictability
    return picks.sort(() => Math.random() - 0.5);
}

// ── Round resolution ───────────────────────────────────────────────────────

export interface RoundResult {
    slots: SlotResult[];
    totalPlayerKnock: number;
    totalOpponentKnock: number;
    roundWinner: "player" | "opponent" | "draw";
}

export function resolveRound(
    playerOrder: Card[],
    opponentOrder: Card[],
    playerChar?: Character,
    opponentChar?: Character
): RoundResult {
    const playerCombat = playerChar ? charToCombat(playerChar) : DEFAULT_CHAR;
    const opponentCombat = opponentChar ? charToCombat(opponentChar) : DEFAULT_CHAR;

    const slots: SlotResult[] = [];
    let totalPlayerKnock = 0;
    let totalOpponentKnock = 0;
    let nextPlayerKnockDebuff = 0;
    let nextOpponentKnockDebuff = 0;

    for (let i = 0; i < 5; i++) {
        const result = resolveSlot(playerOrder[i], opponentOrder[i], {
            player: playerCombat,
            opponent: opponentCombat,
            playerKnockDebuff: nextPlayerKnockDebuff,
            opponentKnockDebuff: nextOpponentKnockDebuff,
            playerTotalKnock: totalPlayerKnock,
            opponentTotalKnock: totalOpponentKnock,
        });
        slots.push(result);
        totalPlayerKnock += result.playerKnock;
        totalOpponentKnock += result.opponentKnock;
        nextPlayerKnockDebuff = result.nextPlayerKnockDebuff ?? 0;
        nextOpponentKnockDebuff = result.nextOpponentKnockDebuff ?? 0;
    }

    const roundWinner: "player" | "opponent" | "draw" =
        totalPlayerKnock > totalOpponentKnock
            ? "player"
            : totalOpponentKnock > totalPlayerKnock
            ? "opponent"
            : "draw";

    return { slots, totalPlayerKnock, totalOpponentKnock, roundWinner };
}
