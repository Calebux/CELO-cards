// Builds a legal card order for an agent-driven vs-house round using the
// real catalog and energy rules — imported from the live game code, never
// duplicated (CELO-cards PR review, point 2).

import { CARDS, CHARACTERS, type Card, type CardType, type Character } from "./gameData";
import { calcEnergyPool } from "./combatEngine";

export const ORDER_SIZE = 5;

const STRATEGY_PREFERENCE: Record<string, CardType> = {
  anti_strike: "defense",
  aggressive: "strike",
  control: "control",
};

export function resolveAgentCharacter(characterId: string | undefined): Character {
  const found = characterId
    ? CHARACTERS.find((c) => c.id === characterId && !c.isLocked)
    : undefined;
  return found ?? CHARACTERS.find((c) => !c.isLocked) ?? CHARACTERS[0];
}

function cardScore(card: Card, preferred: CardType | undefined): number {
  const typeBonus = preferred && card.type === preferred ? 6 : 0;
  return card.knock + card.priority / 2 + typeBonus;
}

/**
 * Pick ORDER_SIZE base-catalog cards inside the character's energy pool.
 * `roundOffset` rotates the candidate list so consecutive rounds don't send
 * an identical order.
 */
export function buildAgentOrder(
  character: Character,
  strategy: string | undefined,
  roundOffset: number,
): string[] {
  const pool = calcEnergyPool(character);
  const preferred = strategy ? STRATEGY_PREFERENCE[strategy] : undefined;

  const candidates = CARDS.filter((c) => !c.isPremium)
    .slice()
    .sort((a, b) => cardScore(b, preferred) - cardScore(a, preferred));

  // Rotate so each round starts the greedy pass at a different card.
  const start = candidates.length ? roundOffset % candidates.length : 0;
  const rotated = [...candidates.slice(start), ...candidates.slice(0, start)];

  const picked: Card[] = [];
  let spent = 0;
  for (const card of rotated) {
    if (picked.length >= ORDER_SIZE) break;
    const remainingSlots = ORDER_SIZE - picked.length - 1;
    const cheapestFloor = remainingSlots; // every card costs at least ~1
    if (spent + card.energyCost + cheapestFloor > pool) continue;
    picked.push(card);
    spent += card.energyCost;
  }

  // Fill any gap with the cheapest remaining cards.
  if (picked.length < ORDER_SIZE) {
    const rest = candidates
      .filter((c) => !picked.includes(c))
      .sort((a, b) => a.energyCost - b.energyCost);
    for (const card of rest) {
      if (picked.length >= ORDER_SIZE) break;
      picked.push(card);
    }
  }

  return picked.slice(0, ORDER_SIZE).map((c) => c.id);
}
