export const DAILY_CHALLENGES = [
  {
    id: "win1",
    title: "First Blood",
    description: "Win 1 match today (any mode)",
    requirement: { type: "wins", count: 1 },
    rewardPoints: 50,
    rewardGDollar: "0.05",
    icon: "⚔️",
    color: "#56a4cb",
  },
  {
    id: "win3",
    title: "On a Roll",
    description: "Win 3 matches today (any mode)",
    requirement: { type: "wins", count: 3 },
    rewardPoints: 150,
    rewardGDollar: "0.15",
    icon: "🔥",
    color: "#f59e0b",
  },
  {
    id: "play5",
    title: "Dedicated Fighter",
    description: "Play 5 matches today (wins + losses)",
    requirement: { type: "played", count: 5 },
    rewardPoints: 100,
    rewardGDollar: "0.10",
    icon: "🏅",
    color: "#a855f7",
  },
] as const;

