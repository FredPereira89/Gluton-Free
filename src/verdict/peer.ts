import { INFORMATIVE_ONLY, INPUTS, type Input, type Tier } from "@/domain/aspects";
import { exceptionalPosterior } from "./beta";
import type { InputStat } from "./rollup";

export type PeerLevel = "format" | "family" | "city";
export type PeerGroupStat = {
  city: string;
  level: PeerLevel;
  key: string;
  input: Input;
  sortedTheta: number[];
  formatMean: number;
  k: number;
  composite: number[];
  exceptionalPrior: { alpha: number; beta: number };
  peerCount: number;
};
export type PeerSnapshot = { id: number; month: string; publishedAt: string; groups: PeerGroupStat[] };
export type Standing = { input: Input; theta: number; percentile: number; level: PeerLevel; key: string; peerCount: number };
export type CompositeStanding = { percentile: number; level: PeerLevel; key: string; peerCount: number };
export type TierFloor = { input: Input; percentile: number };

export type PeerVerdict = {
  peerSnapshot: { id: number; month: string; publishedAt: string } | null;
  standings: Standing[];
  compositeStanding: CompositeStanding | null;
  provisional: boolean;
  tier: Tier | null;
  floorCap: string | null;
  tierFloors: TierFloor[];
  ceilingNote: string | null;
};

const FORMAT_FAMILY: Record<string, string> = {
  tasca: "traditional_portuguese", restaurante_tradicional: "traditional_portuguese",
  marisqueira_cervejaria: "traditional_portuguese", marisqueira: "traditional_portuguese",
  cervejaria: "traditional_portuguese", churrasqueira: "traditional_portuguese", casa_de_fado: "traditional_portuguese",
  casual_contemporary: "casual", casual: "casual", international_casual: "casual", fine_dining: "fine_dining",
  cafe_pastelaria: "quick_cafe", cafe: "quick_cafe", pastelaria: "quick_cafe",
  brunch_all_day_cafe: "quick_cafe", brunch: "quick_cafe", snack_street: "quick_cafe", snack: "quick_cafe", street_food: "quick_cafe",
};
const MIN_PEERS = 30;
export const DEFAULT_SHRINK_K = 10;
const keyOf = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// Tier boundaries and floors (ADR 0002, issue #35). Percentiles are mid-ranks on a 0-100 scale.
const AVOID_PCT = 10;
const OK_PCT = 45;
const GOOD_PCT = 85;
const GOOD_FOOD_FLOOR = 40;
const GOOD_SERVICE_FLOOR = 25;
const MUSTGO_FOOD_FLOOR = 75;
const MUSTGO_SERVICE_FLOOR = 50;
const MUSTGO_ASPECT_FLOOR = 25;

// Life Changing (issue #36): the exceptional-language test is never lowered, so its threshold is
// a constant, not tunable per Format like the floors above.
const LIFECHANGING_PCT = 98;
const LIFECHANGING_FOOD_FLOOR = 98;
const LIFECHANGING_MIN_PEERS = 50;
const EXCEPTIONAL_POSTERIOR_THRESHOLD = 0.9;

export const formatPercentile = (percentile: number): string => `P${Math.round(percentile)}`;

export function midRank(sorted: number[], value: number): number {
  if (!sorted.length) return 0;
  let below = 0;
  let equal = 0;
  for (const point of sorted) {
    if (point < value) below++;
    else if (point === value) equal++;
  }
  return (below + equal / 2) * 100 / sorted.length;
}

function groupFor(snapshot: PeerSnapshot, city: string, format: string, input: Input): PeerGroupStat | undefined {
  const formatKey = keyOf(format);
  const candidates: { level: PeerLevel; key: string }[] = [
    { level: "format", key: formatKey },
    { level: "family", key: FORMAT_FAMILY[formatKey] ?? formatKey },
    { level: "city", key: city },
  ];
  for (const candidate of candidates) {
    const group = snapshot.groups.find((g) => g.city === city && g.level === candidate.level && keyOf(g.key) === keyOf(candidate.key) && g.input === input);
    if (group && group.peerCount >= MIN_PEERS && group.sortedTheta.length === group.peerCount) return group;
  }
}

const GOOD_FLOOR_TABLE: TierFloor[] = [{ input: "food", percentile: GOOD_FOOD_FLOOR }, { input: "service", percentile: GOOD_SERVICE_FLOOR }];

function mustGoFloorTable(counted: Input[]): TierFloor[] {
  const floors: TierFloor[] = [{ input: "food", percentile: MUSTGO_FOOD_FLOOR }, { input: "service", percentile: MUSTGO_SERVICE_FLOOR }];
  for (const i of counted) if (i !== "food" && i !== "service" && i !== "overall") floors.push({ input: i, percentile: MUSTGO_ASPECT_FLOOR });
  return floors;
}

function floorFailures(floors: TierFloor[], pct: (i: Input) => number): string[] {
  return floors.filter((f) => pct(f.input) < f.percentile).map((f) => `${f.input} below P${f.percentile}`);
}

/** Must Go's floors, with food raised to the Life Changing bar (issue #36) — every other floor unchanged. */
function lifeChangingFloorTable(counted: Input[]): TierFloor[] {
  return mustGoFloorTable(counted).map((f) => (f.input === "food" ? { input: "food", percentile: LIFECHANGING_FOOD_FLOOR } : f));
}

/** The two gates on Life Changing that aren't plain percentile floors (issue #36). */
type LifeChangingGates = { anchorPeerCount: number; exceptionalPosteriorProb: number };

/**
 * The nearest unmet requirement standing between a Restaurant and Life Changing, shown as a
 * ceiling note whenever the Tier lands below it (issue #36). Checked in the same priority order
 * Life Changing itself gates on: composite, then the (non-food) Must Go floors, then food, then
 * Peer count, then the exceptional test.
 */
function ceilingNoteFor(tier: Tier, compositePercentile: number, counted: Input[], pct: (i: Input) => number, gates: LifeChangingGates): string | null {
  if (tier === "life_changing") return null;
  if (compositePercentile < LIFECHANGING_PCT) {
    return `needs composite ≥ ${formatPercentile(LIFECHANGING_PCT)}, now ${formatPercentile(compositePercentile)}`;
  }
  const otherFloorsFailed = floorFailures(mustGoFloorTable(counted).filter((f) => f.input !== "food"), pct);
  if (otherFloorsFailed.length) {
    return `needs the Must Go floor(s) met: ${otherFloorsFailed.join(", ")}`;
  }
  const foodPercentile = pct("food");
  if (foodPercentile < LIFECHANGING_FOOD_FLOOR) {
    return `needs food ≥ ${formatPercentile(LIFECHANGING_FOOD_FLOOR)}, now ${formatPercentile(foodPercentile)}`;
  }
  if (gates.anchorPeerCount < LIFECHANGING_MIN_PEERS) {
    return `needs at least ${LIFECHANGING_MIN_PEERS} Peers at the level used, now ${gates.anchorPeerCount}`;
  }
  if (gates.exceptionalPosteriorProb < EXCEPTIONAL_POSTERIOR_THRESHOLD) {
    return "needs the exceptional-language test to pass";
  }
  return null;
}

/**
 * Bands the composite percentile into a Tier, applying floors (never Overall) and the drop-down
 * rule: a floor failure drops to the highest Tier whose own floors are met. Above Must Go, also
 * checks the Life Changing gates (issue #36): food raised to P98, at least 50 Peers at the level
 * used, and the exceptional-language test — none of which ever lower an already-earned Must Go.
 */
function tierFromPercentiles(
  compositePercentile: number,
  counted: Input[],
  pct: (i: Input) => number,
  peerTheta: (i: Input) => number,
  gates: LifeChangingGates,
): { tier: Tier; floorCap: string | null; tierFloors: TierFloor[]; ceilingNote: string | null } {
  const withNote = <T extends { tier: Tier; floorCap: string | null; tierFloors: TierFloor[] }>(r: T) =>
    ({ ...r, ceilingNote: ceilingNoteFor(r.tier, compositePercentile, counted, pct, gates) });

  if (compositePercentile < AVOID_PCT && (peerTheta("food") < 0 || peerTheta("overall") < 0)) {
    return withNote({ tier: "avoid", floorCap: null, tierFloors: [] });
  }
  if (compositePercentile < OK_PCT) return withNote({ tier: "ok", floorCap: null, tierFloors: [] });
  if (compositePercentile < GOOD_PCT) {
    const failed = floorFailures(GOOD_FLOOR_TABLE, pct);
    if (!failed.length) return withNote({ tier: "good", floorCap: null, tierFloors: GOOD_FLOOR_TABLE });
    return withNote({ tier: "ok", floorCap: `Good floor not met: ${failed.join(", ")}`, tierFloors: [] });
  }
  const mustGoTable = mustGoFloorTable(counted);
  const mustGoFailed = floorFailures(mustGoTable, pct);
  if (!mustGoFailed.length) {
    if (compositePercentile >= LIFECHANGING_PCT) {
      const lifeChangingTable = lifeChangingFloorTable(counted);
      const lifeChangingFailed = floorFailures(lifeChangingTable, pct);
      if (
        !lifeChangingFailed.length &&
        gates.anchorPeerCount >= LIFECHANGING_MIN_PEERS &&
        gates.exceptionalPosteriorProb >= EXCEPTIONAL_POSTERIOR_THRESHOLD
      ) {
        return withNote({ tier: "life_changing", floorCap: null, tierFloors: lifeChangingTable });
      }
    }
    return withNote({ tier: "must_go", floorCap: null, tierFloors: mustGoTable });
  }
  const goodFailed = floorFailures(GOOD_FLOOR_TABLE, pct);
  if (!goodFailed.length) return withNote({ tier: "good", floorCap: `Must Go floor not met: ${mustGoFailed.join(", ")}`, tierFloors: GOOD_FLOOR_TABLE });
  return withNote({ tier: "ok", floorCap: `Must Go floor not met: ${mustGoFailed.join(", ")}; Good floor not met: ${goodFailed.join(", ")}`, tierFloors: [] });
}

/**
 * Judges a Restaurant against its Peer snapshot: mid-rank standings per input, the composite
 * (weighted mean of input percentiles, ranked again among Peer composites), and the resulting
 * Tier with its floors. Falls back to fully provisional when the snapshot, city, or any counted
 * input's Peer group is missing (issue #34's completeness gate).
 */
export function judgeWithSnapshot(
  stats: InputStat[],
  format: string,
  city: string | undefined,
  snapshot: PeerSnapshot | null | undefined,
  forcedAvoid: boolean,
  exceptional: { successes: number; trials: number },
): PeerVerdict {
  const none: PeerVerdict = { peerSnapshot: null, standings: [], compositeStanding: null, provisional: true, tier: null, floorCap: null, tierFloors: [], ceilingNote: null };
  if (!snapshot || !city || city.toLowerCase() !== "lisbon") return none;
  const selected = new Map<Input, PeerGroupStat>();
  const standings: Standing[] = [];
  for (const stat of stats) {
    const group = groupFor(snapshot, city, format, stat.input);
    if (!group) continue;
    selected.set(stat.input, group);
    // The provisional theta encodes the weighted sum with its zero prior and k=10.
    const weightedSum = stat.theta * (stat.sumW + DEFAULT_SHRINK_K);
    const theta = (weightedSum + group.k * group.formatMean) / (stat.sumW + group.k);
    standings.push({ input: stat.input, theta, percentile: midRank(group.sortedTheta, theta), level: group.level, key: group.key, peerCount: group.peerCount });
  }
  const counted = INPUTS.filter((i) => !(INFORMATIVE_ONLY[format] ?? []).includes(i));
  if (counted.some((i) => !selected.has(i))) return none;

  const percentileOf = (i: Input) => standings.find((s) => s.input === i)!.percentile;
  const peerThetaOf = (i: Input) => standings.find((s) => s.input === i)!.theta;
  const weightOf = (i: Input) => stats.find((s) => s.input === i)!.weight;
  const inputComposite = counted.reduce((sum, i) => sum + weightOf(i) * percentileOf(i), 0);

  const anchor = selected.get("food") ?? selected.get(counted[0]!)!;
  const compositePercentile = midRank(anchor.composite, inputComposite);
  const gates: LifeChangingGates = {
    anchorPeerCount: anchor.peerCount,
    exceptionalPosteriorProb: exceptionalPosterior(exceptional.successes, exceptional.trials, anchor.exceptionalPrior),
  };
  const banded = tierFromPercentiles(compositePercentile, counted, percentileOf, peerThetaOf, gates);

  return {
    peerSnapshot: { id: snapshot.id, month: snapshot.month, publishedAt: snapshot.publishedAt },
    standings,
    compositeStanding: { percentile: compositePercentile, level: anchor.level, key: anchor.key, peerCount: anchor.peerCount },
    provisional: false,
    tier: forcedAvoid ? "avoid" : banded.tier,
    floorCap: forcedAvoid ? null : banded.floorCap,
    tierFloors: forcedAvoid ? [] : banded.tierFloors,
    ceilingNote: forcedAvoid ? null : banded.ceilingNote,
  };
}
