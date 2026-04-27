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
    isWild?: boolean;    // type randomises at clash resolve time
    isPremium?: boolean; // true if bought from the black market
    price?: number;      // price in player points
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
    passive?: { name: string; description: string };
    ultimate?: { name: string; description: string; effect: "guaranteed_crit" | "double_knock" | "full_dodge" | "drain_debuff" | "priority_surge" };
    taunts?: string[]; // lines shown when this character enters the arena as an opponent
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
        portrait: "/characters/characters /Adobe Express - file (4).webp",
        fullArt: "/new addition/kaira_lobby.webp",
        standingArt: "/characters/characters /Adobe Express - file (4).webp",
        color: "#b9e7f4",
        isLocked: false,
        finisherVideo: "/new-assets/action-green-spiral.webm",
        passive: { name: "First Strike", description: "+2 Knock on the opening slot" },
        ultimate: { name: "Blinding Flash", description: "Next slot guaranteed critical hit (2× knock)", effect: "guaranteed_crit" },
        taunts: ["You can't keep up with me.", "First strike, last words.", "I've already won."],
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
        passive: { name: "Blade Speed", description: "+2 Knock when winning a priority clash" },
        ultimate: { name: "Blade Storm", description: "Double knock damage on next slot", effect: "double_knock" },
        taunts: ["Draw your blade — if you dare.", "Speed is the only truth.", "I've cut down better players today."],
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
        passive: { name: "Phantom Dodge", description: "Halve all damage received on slot 3" },
        ultimate: { name: "Phase Shift", description: "Take zero damage on next slot", effect: "full_dodge" },
        taunts: ["You can't hit what you can't see.", "A shadow leaves no trace.", "Your moves are already countered."],
    },
    {
        id: "zane",
        name: "ZANE",
        className: "Brawler",
        knockStat: 95,
        priorityStat: 45,
        drainStat: 35,
        portrait: "/characters/characters /zane_portrait.webp",
        fullArt: "/characters/characters /zane_portrait.webp",
        standingArt: "/characters/characters /zane_portrait.webp",
        color: "#f87171",
        isLocked: false,
        finisherVideo: "/new-assets/action-flying-kick.webm",
        passive: { name: "Bulldoze", description: "+2 Knock on every Strike type-win" },
        ultimate: { name: "Seismic Slam", description: "Drain 3 knock from opponent's next slot", effect: "drain_debuff" },
        taunts: ["I don't dodge. I end it.", "Try to stop me. I dare you.", "Every hit I land shakes the ground."],
    },
    {
        id: "elara",
        name: "ELARA",
        className: "Void Witch",
        knockStat: 60,
        priorityStat: 75,
        drainStat: 90,
        portrait: "/characters/characters /Adobe Express - file (6).webp",
        fullArt: "/characters/characters /Adobe Express - file (6).webp",
        standingArt: "/characters/characters /Adobe Express - file (6).webp",
        color: "#f906a8",
        isLocked: false,
        finisherVideo: "/new-assets/action-solo-energy.webm",
        passive: { name: "Void Drain", description: "Drain -1 from opponent's next slot after a Control win" },
        ultimate: { name: "Void Surge", description: "+5 priority on next slot, guaranteeing first-strike advantage", effect: "priority_surge" },
        taunts: ["The void hungers for you.", "Every card you play feeds my power.", "Resistance is already futile."],
    },
];

// ── Arena Backgrounds ──────────────────────────────────────────────────────
// Keyed by [playerId][opponentId] → shows player on the LEFT side of the scene.
// Reverse images exist for when the same pair fights with swapped roles.
export const ARENA_BACKGROUNDS: Record<string, Record<string, string>> = {
    kaira: {
        kaira: "/arena-backgrounds/arena_kaira_kaira.webp",
        kenji: "/arena-backgrounds/arena_kaira_kenji_new.webp",
        riven: "/arena-backgrounds/arena_kaira_riven.webp",
        zane:  "/arena-backgrounds/arena_kaira_zane.webp",
        elara: "/arena-backgrounds/arena_kaira_elara.jpg",
    },
    kenji: {
        kenji: "/arena-backgrounds/arena_kenji_kenji.webp",
        kaira: "/arena-backgrounds/arena_kenji_kaira_new.webp",
        riven: "/arena-backgrounds/arena_kenji_riven.webp",
        zane:  "/arena-backgrounds/arena_kenji_zane.webp",
        elara: "/arena-backgrounds/arena_kenji_elara.webp",
    },
    riven: {
        riven: "/arena-backgrounds/arena_riven_riven.webp",
        kaira: "/arena-backgrounds/arena_riven_kaira.webp",
        kenji: "/arena-backgrounds/arena_riven_kenji.webp",
        zane:  "/arena-backgrounds/arena_riven_zane.webp",
        elara: "/arena-backgrounds/arena_riven_elara.webp",
    },
    zane: {
        zane:  "/arena-backgrounds/arena_zane_zane.webp",
        kenji: "/arena-backgrounds/arena_zane_kenji.webp",
        riven: "/arena-backgrounds/arena_zane_riven.webp",
        kaira: "/arena-backgrounds/arena_zane_kaira.webp",
        elara: "/arena-backgrounds/arena_zane_elara.webp",
    },
    elara: {
        elara: "/arena-backgrounds/arena_elara_elara.webp",
        riven: "/arena-backgrounds/arena_elara_riven.webp",
        zane:  "/arena-backgrounds/arena_elara_zane.webp",
        kaira: "/arena-backgrounds/arena_elara_kaira.jpg",
        kenji: "/arena-backgrounds/arena_elara_kenji.webp",
    },
};

export function getArenaBackground(playerId: string, opponentId: string): string {
    return ARENA_BACKGROUNDS[playerId]?.[opponentId] ?? "/new addition/gameplay777.webp";
}

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
        image: "/bad cards/Phantombreak.png",
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
        knock: 3,
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
        knock: 3,
        energyCost: 3,
        effect: "Reflect incoming strike damage back",
        color: "#06b6d4",
        bgColor: "#164e63",
        image: "/bad cards/Reversaledge.png",
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
        energyCost: 2,
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

    // New cards
    {
        id: "berserk_surge",
        name: "Berserk Surge",
        type: "strike",
        priority: 1,
        knock: 9,
        energyCost: 3,
        effect: "Consumed by abyssal fury. Strikes with catastrophic, unyielding force that crushes all defense.",
        color: "#ef4444",
        bgColor: "#450a0a",
        image: "/cards/berserk_surge.webp",
    },
    {
        id: "run_away",
        name: "Run Away",
        type: "control",
        priority: 5,
        knock: 2,
        energyCost: 1,
        effect: "A swift, desperate dash. Disengage from combat instantly — live to fight another day.",
        color: "#38bdf8",
        bgColor: "#0c2340",
        image: "/cards/run_away.webp",
    },
    {
        id: "inner_focus",
        name: "Inner Focus",
        type: "control",
        priority: 3,
        knock: 6,
        energyCost: 2,
        effect: "Achieves profound focus, channeling inner power into a vortex of unassailable force.",
        color: "#4ade80",
        bgColor: "#052e16",
        image: "/cards/inner_focus.webp",
    },
    {
        id: "javelin_dive",
        name: "Javelin Dive",
        type: "strike",
        priority: 2,
        knock: 2,
        energyCost: 2,
        effect: "An unstoppable human javelin. Guarantees piercing damage that cannot be shielded.",
        color: "#93c5fd",
        bgColor: "#1e3a5f",
        image: "/cards/javelin_dive.webp",
    },
    {
        id: "aerial_spear_fist",
        name: "Aerial Spear-Fist",
        type: "strike",
        priority: 2,
        knock: 8,
        energyCost: 3,
        effect: "Descends like a bolt of thunder. Deals massive damage and shatters guards.",
        color: "#f97316",
        bgColor: "#431407",
        image: "/cards/aerial_spear_fist.webp",
    },


    // Black Market Cards
    {
        id: "rko", name: "RKO", type: "strike", priority: 9, knock: 14, energyCost: 4,
        effect: "Out of nowhere! Devastating strike with massive priority.", color: "#ef4444", bgColor: "#450a0a", image: "/cards/market/RKO.png", isPremium: true, price: 7500
    },
    {
        id: "go_to_hell", name: "Go To Hell", type: "strike", priority: 3, knock: 20, energyCost: 6,
        effect: "Ultimate destructive move. Requires high energy but annihilates opposition.", color: "#f97316", bgColor: "#431407", image: "/cards/market/GO TO HELL.png", isPremium: true, price: 10000
    },
    {
        id: "headbutt", name: "Headbutt", type: "strike", priority: 8, knock: 7, energyCost: 2,
        effect: "A quick, brutal intercept to stagger the opponent.", color: "#d946ef", bgColor: "#701a75", image: "/cards/market/Headbutt.png", isPremium: true, price: 4000
    },
    {
        id: "darkness_repellent", name: "Darkness Repellant 2", type: "defense", priority: 7, knock: 0, energyCost: 3,
        effect: "A perfect guard against all but the most unyielding strikes.", color: "#8b5cf6", bgColor: "#2e1065", image: "/cards/market/darkness_repellant_2.jpg", isPremium: true, price: 6000
    },
    {
        id: "no_drain", name: "No Drain 2", type: "control", priority: 5, knock: 4, energyCost: 1,
        effect: "Disrupts the opponent without burning out your stamina.", color: "#4ade80", bgColor: "#052e16", image: "/cards/market/no_drain_2.jpg", isPremium: true, price: 3000
    },
    {
        id: "bite", name: "Bite", type: "strike", priority: 6, knock: 3, energyCost: 1,
        effect: "A vicious, desperate attack that sneaks past guards.", color: "#f59e0b", bgColor: "#451a03", image: "/cards/market/bite.png", isPremium: true, price: 2000
    },
    {
        id: "cage", name: "Cage", type: "control", priority: 5, knock: 5, energyCost: 3,
        effect: "Trap the opponent in a tight box and force a losing exchange.", color: "#f43f5e", bgColor: "#4c0519", image: "/bad cards/Cage.png", isPremium: true, price: 4800
    },
    {
        id: "ethereal_form", name: "Ethereal Form", type: "defense", priority: 7, knock: 3, energyCost: 2,
        effect: "Phase out of danger and negate most incoming pressure this slot.", color: "#a78bfa", bgColor: "#2e1065", image: "/bad cards/ETHEREAL FORM.png", isPremium: true, price: 5200
    },
    {
        id: "fire", name: "Fire", type: "strike", priority: 4, knock: 9, energyCost: 4,
        effect: "A scorching burst that burns through weak setups and punishes hesitation.", color: "#f97316", bgColor: "#431407", image: "/bad cards/Fire.png", isPremium: true, price: 6200
    },
    {
        id: "grab", name: "Grab", type: "control", priority: 6, knock: 4, energyCost: 2,
        effect: "Interrupt the opponent's rhythm and drag them into your tempo.", color: "#22d3ee", bgColor: "#083344", image: "/bad cards/GRAB.png", isPremium: true, price: 4200
    },
    {
        id: "gravity_well", name: "Gravity Well", type: "control", priority: 3, knock: 7, energyCost: 3,
        effect: "Collapse the arena around your target, crushing escape routes.", color: "#7c3aed", bgColor: "#3b0764", image: "/bad cards/Gavity well.png", isPremium: true, price: 5600
    },
    {
        id: "halo_knee_jab", name: "Halo Knee Jab", type: "strike", priority: 7, knock: 7, energyCost: 3,
        effect: "Explosive knee-first engage with elite opening speed.", color: "#f59e0b", bgColor: "#451a03", image: "/bad cards/Halo Knee jab.png", isPremium: true, price: 5900
    },
    {
        id: "halo_shield", name: "Halo Shield", type: "defense", priority: 6, knock: 3, energyCost: 1,
        effect: "A radiant shield that absorbs impact and steadies your stance.", color: "#38bdf8", bgColor: "#0c2340", image: "/bad cards/Halo shield.png", isPremium: true, price: 3600
    },
    {
        id: "jaw_breaker", name: "Jaw Breaker", type: "strike", priority: 4, knock: 10, energyCost: 4,
        effect: "Heavy close-range smash designed to end rounds instantly.", color: "#ef4444", bgColor: "#450a0a", image: "/bad cards/Jaw breaker.png", isPremium: true, price: 7000
    },
    {
        id: "lightning", name: "Lightning", type: "strike", priority: 8, knock: 7, energyCost: 4,
        effect: "Near-instant electric strike that hits before most counters activate.", color: "#fde047", bgColor: "#422006", image: "/bad cards/LIGHTNING.png", isPremium: true, price: 6800
    },
    {
        id: "shadow_bind", name: "Shadow Bind", type: "control", priority: 7, knock: 6, energyCost: 3,
        effect: "Lock the opponent's movement and force a bad follow-up.", color: "#8b5cf6", bgColor: "#2e1065", image: "/bad cards/Shadow bind.png", isPremium: true, price: 5400
    },
    {
        id: "downslide", name: "Downslide", type: "defense", priority: 6, knock: 3, energyCost: 2,
        effect: "Low evasive slide that avoids high pressure and resets spacing.", color: "#10b981", bgColor: "#052e16", image: "/bad cards/downslide.png", isPremium: true, price: 3900
    },

];

// Helper to get a player's deck of 10 cards (shuffled selection)
export function buildDeck(unlockedCards: string[] = []): Card[] {
    const availableCards = CARDS.filter(c => !c.isPremium || unlockedCards.includes(c.id));
    const shuffled = [...availableCards].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 10);
}
