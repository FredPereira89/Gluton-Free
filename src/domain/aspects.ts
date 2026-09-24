export const ASPECTS = ["food", "service", "ambience", "value", "wait", "consistency"] as const;
export type Aspect = (typeof ASPECTS)[number];

/** Verdict inputs: the six Aspects plus the Overall stars. */
export const INPUTS = ["food", "service", "overall", "value", "consistency", "ambience", "wait"] as const;
export type Input = (typeof INPUTS)[number];

/** Owner-set weights (ADR 0002). Informative-only inputs are dropped and the rest rescaled. */
export const INPUT_WEIGHTS: Record<Input, number> = {
  food: 30,
  service: 20,
  overall: 15,
  value: 15,
  consistency: 10,
  ambience: 5,
  wait: 5,
};

export const INPUT_LABEL: Record<Input, string> = {
  food: "Food",
  service: "Service",
  overall: "Overall stars",
  value: "Value",
  consistency: "Consistency",
  ambience: "Ambience",
  wait: "Wait time",
};

/** Aspects that are shown but never counted, per Format. */
export const INFORMATIVE_ONLY: Record<string, Input[]> = {
  tasca: ["ambience"],
};

export const TIERS = ["avoid", "ok", "good", "must_go", "life_changing"] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_LABEL: Record<Tier, string> = {
  avoid: "Avoid",
  ok: "OK",
  good: "Good",
  must_go: "Must Go",
  life_changing: "Life Changing",
};

export const FLAG_TYPES = ["food_poisoning", "hygiene", "scam_overcharge", "other_safety"] as const;
export type FlagType = (typeof FLAG_TYPES)[number];
export const FLAG_GROUP: Record<FlagType, "health" | "money"> = {
  food_poisoning: "health",
  hygiene: "health",
  other_safety: "health",
  scam_overcharge: "money",
};

/** Per-Review Change marker (ADR 0007): what the Review's own text says changed, if anything. */
export const CHANGE_MARKERS = ["none", "new_owner", "new_chef", "renovated", "new_concept", "moved"] as const;
export type ChangeMarker = (typeof CHANGE_MARKERS)[number];
