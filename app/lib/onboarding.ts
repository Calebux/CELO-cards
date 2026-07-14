export type OnboardingStepId =
  | "verify_claim"
  | "create_match"
  | "select_fighter"
  | "build_sequence"
  | "lock_sequence"
  | "finish_match";

export type OnboardingProgress = {
  verify_claim: boolean;
  create_match: boolean;
  select_fighter: boolean;
  build_sequence: boolean;
  lock_sequence: boolean;
  finish_match: boolean;
  completedAt: number | null;
};

export const ONBOARDING_STEPS: Array<{
  id: OnboardingStepId;
  label: string;
  title: string;
  body: string;
}> = [
  {
    id: "verify_claim",
    label: "Verify & Claim G$",
    title: "Verify identity, claim daily G$",
    body: "On your Profile, complete GoodDollar face verification and claim your daily G$. The claim also tops up CELO so your wallet can sign matches on-chain.",
  },
  {
    id: "create_match",
    label: "Create Match",
    title: "Start with one match mode",
    body: "Open Ranked, VS House, or Wager so the game can create your lobby state and resume path.",
  },
  {
    id: "select_fighter",
    label: "Select Fighter",
    title: "Lock a fighter identity",
    body: "Pick the fighter that fits your plan. Their passive and ultimate define what your best five-card sequence looks like.",
  },
  {
    id: "build_sequence",
    label: "Build 5 Cards",
    title: "Complete a legal 5-card sequence",
    body: "Fill every slot while staying inside the energy cap. That is the first moment the match becomes real.",
  },
  {
    id: "lock_sequence",
    label: "Lock Sequence",
    title: "Commit your order",
    body: "Once you lock, the server can resolve the round or wait for the opponent. This is where timing and reads matter.",
  },
  {
    id: "finish_match",
    label: "Finish Match",
    title: "Review the result",
    body: "Finish one full match so the win/loss, payout state, and replay loop make sense end to end.",
  },
];

export function createEmptyOnboardingProgress(): OnboardingProgress {
  return {
    verify_claim: false,
    create_match: false,
    select_fighter: false,
    build_sequence: false,
    lock_sequence: false,
    finish_match: false,
    completedAt: null,
  };
}

// MiniPay has no GoodDollar verify/claim step — the wallet flow differs and the
// treasury covers on-chain entries there, so the step only exists on web/mobile.
export function getOnboardingSteps(includeVerifyClaim: boolean) {
  return includeVerifyClaim
    ? ONBOARDING_STEPS
    : ONBOARDING_STEPS.filter((step) => step.id !== "verify_claim");
}

export function getOnboardingCompletion(progress: OnboardingProgress, steps = ONBOARDING_STEPS): number {
  return steps.filter((step) => progress[step.id]).length;
}

export function getNextOnboardingStep(progress: OnboardingProgress, steps = ONBOARDING_STEPS) {
  return steps.find((step) => !progress[step.id]) ?? null;
}

export function isOnboardingComplete(progress: OnboardingProgress, steps = ONBOARDING_STEPS): boolean {
  return steps.every((step) => progress[step.id]);
}
