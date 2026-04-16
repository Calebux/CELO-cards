// ── Card & Character definitions ──────────────────────────────────────────

export type CardType = "strike" | "defense" | "control";

export interface Card {
    id: string;
    name: string;
    type: CardType;
    priority: number;
    knock: number;
    energyCost: number;
    effect: string;
    color: string;       // accent colour for the card frame
    bgColor: string;     // darker bg colour
    image: string;       // card art image URL
    icon?: string;       // optional icon image URL
}

export interface Character {
    id: string;
    name: string;
    className: string;
    knockStat: number;   // 0-100
    priorityStat: number;
    drainStat: number;
    portrait: string;    // grid thumbnail
    fullArt: string;     // large portrait
    standingArt: string; // full-body standing image shown on select screen
    color: string;       // neon accent
    isLocked?: boolean;  // whether the character is selectable
    finisherVideo?: string; // played on match-end win screen
}

// ── Characters ────────────────────────────────────────────────────────────

export const CHARACTERS: Character[] = [
    {
        id: "kaira",
        name: "KAIRA",
        className: "Vanguard",
        knockStat: 85,
        priorityStat: 62,
        drainStat: 40,
        portrait: "/Two fighters/standing 2.webp",
        fullArt: "/new addition/kaira_lobby.webp",
        standingArt: "/Two fighters/standing 2.webp",
        color: "#b9e7f4",
        isLocked: false,
        finisherVideo: "/new-assets/action-green-spiral.webm",
    },
    {
        id: "kenji",
        name: "KENJI",
        className: "Ronin",
        knockStat: 78,
        priorityStat: 80,
        drainStat: 55,
        portrait: "/Characters standing/Whisk_9a87489a13c392485344f4c75994d511eg.webp",
        fullArt: "/Characters standing/Whisk_9a87489a13c392485344f4c75994d511eg.webp",
        standingArt: "/Characters standing/Whisk_9a87489a13c392485344f4c75994d511eg.webp",
        color: "#06a8f9",
        isLocked: false,
        finisherVideo: "/new-assets/action-knight-attack.webm",
    },
    {
        id: "riven",
        name: "RIVEN",
        className: "Shadow",
        knockStat: 70,
        priorityStat: 90,
        drainStat: 50,
        portrait: "/Characters standing/Whisk_7338ae2d54853d69dbd43da6240ebd8eeg.webp",
        fullArt: "/Characters standing/Whisk_7338ae2d54853d69dbd43da6240ebd8eeg.webp",
        standingArt: "/Characters standing/Whisk_7338ae2d54853d69dbd43da6240ebd8eeg.webp",
        color: "#8c25f4",
        isLocked: false,
        finisherVideo: "/new-assets/action-white-hair-blue.webm",
    },
    {
        id: "zane",
        name: "ZANE",
        className: "Brawler",
        knockStat: 95,
        priorityStat: 45,
        drainStat: 35,
        portrait: "/Characters standing/Whisk_iznjzdmzmtoivgmw0yn3atytytz0qtl3ygz10cn.webp",
        fullArt: "/Characters standing/Whisk_iznjzdmzmtoivgmw0yn3atytytz0qtl3ygz10cn.webp",
        standingArt: "/Characters standing/Whisk_iznjzdmzmtoivgmw0yn3atytytz0qtl3ygz10cn.webp",
        color: "#f87171",
        isLocked: false,
        finisherVideo: "/new-assets/action-flying-kick.webm",
    },
    {
        id: "elara",
        name: "ELARA",
        className: "Void Witch",
        knockStat: 60,
        priorityStat: 75,
        drainStat: 90,
        portrait: "/characters/fighter.webp",
        fullArt: "/characters/fighter.webp",
        standingArt: "/Two fighters/standing .webp",
        color: "#f906a8",
        isLocked: false,
        finisherVideo: "/new-assets/action-solo-energy.webm",
    },
];

// ── Cards ─────────────────────────────────────────────────────────────────

export const CARDS: Card[] = [
    // Strike cards
    {
        id: "phantom_break",
        name: "Phantom Break",
        type: "strike",
        priority: 2,
        knock: 6,
        energyCost: 2,
        effect: "Phase through defenses with spectral force",
        color: "#fbac4b",
        bgColor: "#421f1b",
        image: "/cards/phantom_break.webp",
    },
    {
        id: "storm_kick",
        name: "Storm Kick",
        type: "strike",
        priority: 3,
        knock: 5,
        energyCost: 2,
        effect: "Lightning-fast aerial kick",
        color: "#f97316",
        bgColor: "#431407",
        image: "/cards/storm_kick.webp",
    },
    {
        id: "power_punch",
        name: "Power Punch",
        type: "strike",
        priority: 1,
        knock: 8,
        energyCost: 3,
        effect: "One clean opening is enough. High knock if the strike connects.",
        color: "#ef4444",
        bgColor: "#450a0a",
        image: "/cards/power_punch.webp",
    },
    {
        id: "direct_impact",
        name: "Direct Impact",
        type: "strike",
        priority: 4,
        knock: 4,
        energyCost: 1,
        effect: "Direct intent leaves no room to react. Reliable damage if not blocked.",
        color: "#f59e0b",
        bgColor: "#451a03",
        image: "/cards/direct_impact.webp",
    },
    {
        id: "finisher",
        name: "Finisher",
        type: "strike",
        priority: 1,
        knock: 10,
        energyCost: 4,
        effect: "This order ends here. Can only be used when the opponent is vulnerable.",
        color: "#d4a017",
        bgColor: "#5c4813",
        image: "/cards/finisher.webp",
    },

    // Defense cards
    {
        id: "guard_stance",
        name: "Guard Stance",
        type: "defense",
        priority: 2,
        knock: 2,
        energyCost: 1,
        effect: "Stability denies momentum. Blocks low attacks but leaves the head exposed.",
        color: "#60a5ce",
        bgColor: "#1e3a5f",
        image: "/cards/guard_stance.webp",
    },
    {
        id: "stability",
        name: "Stability",
        type: "defense",
        priority: 1,
        knock: 1,
        energyCost: 1,
        effect: "Anticipation defeats brute force. Blocks high strikes and reduces knock.",
        color: "#3b82f6",
        bgColor: "#1e3a5f",
        image: "/cards/stability.webp",
    },
    {
        id: "reversal_edge",
        name: "Reversal Edge",
        type: "defense",
        priority: 3,
        knock: 4,
        energyCost: 4,
        effect: "Reflect incoming strike damage back",
        color: "#06b6d4",
        bgColor: "#164e63",
        image: "/cards/reversal_edge.webp",
    },
    {
        id: "anticipation",
        name: "Anticipation",
        type: "defense",
        priority: 5,
        knock: 3,
        energyCost: 0,
        effect: "Anticipation defeats brute force. Blocks high strikes and reduces knock.",
        color: "#22d3ee",
        bgColor: "#083344",
        image: "/cards/anticipation.webp",
    },

    // Control cards
    {
        id: "mind_game",
        name: "Mind Game",
        type: "control",
        priority: 4,
        knock: 3,
        energyCost: 3,
        effect: "The threat you fear is never the real one. Baits blocks and disrupts reads.",
        color: "#a855f7",
        bgColor: "#3b0764",
        image: "/cards/mind_game.webp",
    },
    {
        id: "evasion",
        name: "Evasion",
        type: "control",
        priority: 5,
        knock: 2,
        energyCost: 1,
        effect: "Absence is the cleanest defense. Avoids damage but applies no pressure.",
        color: "#8b5cf6",
        bgColor: "#2e1065",
        image: "/cards/evasion.webp",
    },
    {
        id: "pressure_advance",
        name: "Pressure Advance",
        type: "control",
        priority: 3,
        knock: 5,
        energyCost: 2,
        effect: "Advance without striking. Forces a response and disrupts timing.",
        color: "#c084fc",
        bgColor: "#581c87",
        image: "/cards/pressure_advance.webp",
    },
    {
        id: "disrupt",
        name: "Disrupt",
        type: "control",
        priority: 2,
        knock: 4,
        energyCost: 2,
        effect: "Turn their force against them. Triggers only against an incoming strike.",
        color: "#d946ef",
        bgColor: "#701a75",
        image: "/cards/disrupt.webp",
    },
];

// Helper to get a player's deck of 10 cards (shuffled selection)
export function buildDeck(): Card[] {
    const shuffled = [...CARDS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 10);
}

