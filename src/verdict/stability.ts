import { TIERS, type Input, type Tier } from "@/domain/aspects";
import { COMPOSITE_TIER_BOUNDARIES, type TierFloor } from "./peer";

export type RejudgeCause = "automatic" | "owner_answer";

const BOUNDARIES = Object.values(COMPOSITE_TIER_BOUNDARIES);
/** Fields needed to compare an issued Tier with a re-judgement. */
export type StabilityVerdict = {
  tier: Tier | null;
  provisional: boolean;
  compositeStanding?: { percentile: number } | null;
  standings?: { input: Input; percentile: number }[];
  redFlags: { forcesAvoid: boolean }[];
  floorCap: string | null;
  tierFloors?: TierFloor[];
  ceilingNote?: string | null;
  tierChange?: { from: Tier; at: string };
  /** True only when this exact re-judgement is what moved the Tier, not a carried-forward tierChange. */
  tierChangedNow?: boolean;
  tierBasis?: { composite: number; standings: { input: Input; percentile: number }[] };
  tierHeld?: boolean;
};

function basisOf(verdict: StabilityVerdict) {
  return verdict.tierBasis ?? {
    composite: verdict.compositeStanding?.percentile ?? 0,
    standings: verdict.standings?.map(({ input, percentile }) => ({ input, percentile })) ?? [],
  };
}

export function stabilizeTier<T extends StabilityVerdict>(current: T, previous: StabilityVerdict | null, cause: RejudgeCause, now: Date): T {
  if (!current.tier) return current;
  if (!previous?.tier || current.tier === previous.tier) {
    current.tierChange = previous?.tier === current.tier ? previous.tierChange : undefined;
    current.tierChangedNow = false;
    current.tierBasis = previous?.tier === current.tier ? basisOf(previous) : basisOf(current);
    return current;
  }

  const currentFlags = current.redFlags.filter((flag) => flag.forcesAvoid).length;
  const previousFlags = previous.redFlags.filter((flag) => flag.forcesAvoid).length;
  const redFlagsChanged = currentFlags !== previousFlags ||
    (current.tier === "life_changing" || previous.tier === "life_changing") &&
    current.redFlags.length !== previous.redFlags.length;
  let move = cause === "owner_answer" || redFlagsChanged || current.provisional || previous.provisional ||
    !current.compositeStanding || !previous.compositeStanding;

  if (!move) {
    const basis = basisOf(previous);
    const prior = basis.composite;
    const next = current.compositeStanding!.percentile;
    move = BOUNDARIES.some((boundary) =>
      (prior < boundary && next >= boundary + 2) ||
      (prior >= boundary && next <= boundary - 2),
    );
    const relevantFloors = TIERS.indexOf(current.tier!) > TIERS.indexOf(previous.tier!)
      ? current.tierFloors ?? [] : previous.tierFloors ?? [];
    move ||= relevantFloors.some((floor) => {
      const before = basis.standings.find((s) => s.input === floor.input)?.percentile;
      const after = current.standings?.find((s) => s.input === floor.input)?.percentile;
      return before !== undefined && after !== undefined &&
        ((before < floor.percentile && after >= floor.percentile + 2) ||
         (before >= floor.percentile && after <= floor.percentile - 2));
    });
  }

  if (move) {
    current.tierChange = { from: previous.tier, at: now.toISOString() };
    current.tierChangedNow = true;
    current.tierBasis = basisOf(current);
  } else {
    current.tier = previous.tier;
    current.floorCap = null;
    current.tierFloors = previous.tierFloors;
    current.ceilingNote = null;
    current.tierChange = previous.tierChange;
    current.tierChangedNow = false;
    current.tierBasis = basisOf(previous);
    current.tierHeld = true;
  }
  return current;
}
