import { INPUTS, type Input, type Tier } from "@/domain/aspects";
import { COMPOSITE_TIER_BOUNDARIES, countedWeights, DEFAULT_SHRINK_K, judgeWithSnapshot, MIN_PEERS, peerGroupKeys, type PeerGroupStat, type PeerSnapshot } from "./peer";
import { PARAMS, peerEvidence, redFlagGroups, tierFrom, type InputStat, type RollupFlag } from "./rollup";
import { assertSnapshotSize, buildPeerSnapshot, peerSnapshotBytes, type PeerCandidate } from "./snapshot-build";

export type RecalibrationCandidate = PeerCandidate & {
  baselineSampled: boolean;
  flags: RollupFlag[];
};

export type RuleRankingCheck = {
  scope: string;
  peers: number;
  weightedVsGatesTau: number | null;
  weightedVsFoodFirstTau: number | null;
  rankingReversed: boolean;
};

export type InputDepthSummary = {
  input: Input;
  peers: number;
  nEffMedian: number;
  nEffP25: number;
  nEffP75: number;
};

export type ProvisionalCutoffFit = {
  peers: number;
  targetTierShares: Record<"avoid" | "ok" | "good" | "must_go", number>;
  currentTierShares: Record<"avoid" | "ok" | "good" | "must_go", number>;
  proposedGoodCut: number;
  proposedMustGoCut: number;
  proposedTierShares: Record<"avoid" | "ok" | "good" | "must_go", number>;
  residualSharePoints: number;
};

export type PeerRecalibration = {
  snapshot: ReturnType<typeof buildPeerSnapshot>;
  snapshotBytes: number;
  snapshotUnderLimit: boolean;
  qualifyingPeers: number;
  baselineSampledPeers: number;
  shrinkage: PeerGroupStat[];
  inputDepth: InputDepthSummary[];
  ruleRankings: RuleRankingCheck[];
  forcedAvoidPeers: number;
  forcedAvoidShare: number;
  revisitRedFlagGate: boolean;
  provisionalCutoffs: ProvisionalCutoffFit | null;
};

type ScoredPeer = {
  candidate: RecalibrationCandidate;
  stats: InputStat[];
  targetTier: Tier;
  redFlagForced: boolean;
  scope: string;
  weightedScore: number;
  gatesScore: number;
  foodFirstScore: number;
};

const round = (value: number, places = 4) => Math.round(value * 10 ** places) / 10 ** places;
const FIT_TIERS = ["avoid", "ok", "good", "must_go"] as const;
type FitTier = (typeof FIT_TIERS)[number];

function tierBand(percentile: number): number {
  if (percentile < COMPOSITE_TIER_BOUNDARIES.avoid) return 0;
  if (percentile < COMPOSITE_TIER_BOUNDARIES.good) return 1;
  if (percentile < COMPOSITE_TIER_BOUNDARIES.mustGo) return 2;
  if (percentile < COMPOSITE_TIER_BOUNDARIES.lifeChanging) return 3;
  return 4;
}

function selectedGroup(snapshot: PeerSnapshot, city: string, format: string, input: Input): PeerGroupStat | undefined {
  for (const key of peerGroupKeys(city, format)) {
    const group = snapshot.groups.find((item) => item.city === city && item.level === key.level && item.key === key.key && item.input === input);
    if (group && group.peerCount >= MIN_PEERS && group.sortedTheta.length === group.peerCount) return group;
  }
}

function statsFor(candidate: RecalibrationCandidate, snapshot: PeerSnapshot, now: Date): {
  stats: InputStat[];
  evidence: NonNullable<ReturnType<typeof peerEvidence>>;
  scope: string;
} | null {
  const evidence = peerEvidence(candidate.reviews, now, candidate.changePointAt ?? null);
  if (!evidence) return null;
  const weights = countedWeights(candidate.format);
  const stats = INPUTS.map((input): InputStat => {
    const raw = evidence.inputs.find((item) => item.input === input)!;
    const counted = weights.has(input);
    const weight = weights.get(input) ?? 0;
    const theta = raw.mean === null ? 0 : raw.mean * raw.sumW / (raw.sumW + DEFAULT_SHRINK_K);
    return { input, counted, weight, theta, nEff: raw.nEff, n: 0, sumW: raw.sumW };
  });
  const anchor = selectedGroup(snapshot, candidate.city, candidate.format, "food");
  if (!anchor) return null;
  return { stats, evidence, scope: `${candidate.city} · ${anchor.level} · ${anchor.key}` };
}

function kendallTau(a: number[], b: number[]): number | null {
  let concordant = 0;
  let discordant = 0;
  let tiedA = 0;
  let tiedB = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      const da = Math.sign(a[i]! - a[j]!);
      const db = Math.sign(b[i]! - b[j]!);
      if (da === 0 && db === 0) continue;
      if (da === 0) tiedA++;
      else if (db === 0) tiedB++;
      else if (da === db) concordant++;
      else discordant++;
    }
  }
  const denominator = Math.sqrt((concordant + discordant + tiedA) * (concordant + discordant + tiedB));
  return denominator ? (concordant - discordant) / denominator : null;
}

function percentileSummary(values: number[]): { median: number; p25: number; p75: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]!;
  return { median: at(0.5), p25: at(0.25), p75: at(0.75) };
}

function fitTiers(tier: Tier): FitTier {
  return tier === "life_changing" ? "must_go" : tier;
}

function shareCounts(tiers: FitTier[]): Record<FitTier, number> {
  const counts: Record<FitTier, number> = { avoid: 0, ok: 0, good: 0, must_go: 0 };
  for (const tier of tiers) counts[tier]++;
  const total = tiers.length || 1;
  return Object.fromEntries(FIT_TIERS.map((tier) => [tier, round(counts[tier] / total * 100, 2)])) as Record<FitTier, number>;
}

function provisionalTier(stats: InputStat[], goodCut: number, mustGoCut: number): FitTier {
  const theta = (input: Input) => stats.find((stat) => stat.input === input)!.theta;
  if (theta("food") < 0 || theta("overall") < 0) return "avoid";
  const composite = stats.reduce((sum, stat) => sum + stat.weight * stat.theta, 0);
  if (composite >= mustGoCut) {
    const mustGoFloorPassed = theta("food") >= PARAMS.mustGoFood && theta("service") >= PARAMS.mustGoService &&
      stats.every((stat) => !stat.counted || ["food", "service", "overall"].includes(stat.input) || stat.theta >= PARAMS.mustGoAspectFloor);
    if (mustGoFloorPassed) return "must_go";
  }
  return composite >= goodCut ? "good" : "ok";
}

function thresholdGrid(scores: number[]): number[] {
  const sorted = [...new Set(scores)].sort((a, b) => a - b);
  if (sorted.length < 2) return sorted.length ? [sorted[0]! - 0.001, sorted[0]! + 0.001] : [];
  const midpoints = sorted.slice(0, -1).map((score, index) => (score + sorted[index + 1]!) / 2);
  if (midpoints.length <= 100) return [sorted[0]! - 0.001, ...midpoints, sorted.at(-1)! + 0.001];
  const sampled = Array.from({ length: 101 }, (_, i) => midpoints[Math.floor(i * (midpoints.length - 1) / 100)]!);
  return [...new Set([sorted[0]! - 0.001, ...sampled, sorted.at(-1)! + 0.001])];
}

function fitProvisionalCutoffs(peers: ScoredPeer[]): ProvisionalCutoffFit | null {
  if (!peers.length) return null;
  const targetTiers = peers.map((peer) => fitTiers(peer.targetTier));
  const targetTierShares = shareCounts(targetTiers);
  const currentTiers = peers.map((peer) => fitTiers(peer.redFlagForced ? "avoid" : tierFrom(peer.stats).tier));
  const currentTierShares = shareCounts(currentTiers.map(fitTiers));
  const currentScores = peers.map((peer) => peer.stats.reduce((sum, stat) => sum + stat.weight * stat.theta, 0));
  const grid = thresholdGrid(currentScores);
  if (!grid.length) return null;

  let best: { good: number; mustGo: number; shares: Record<FitTier, number>; error: number } | null = null;
  for (const goodCut of grid) {
    for (const mustGoCut of grid) {
      if (mustGoCut < goodCut) continue;
      const tiers = peers.map((peer) => {
        const forced = peer.redFlagForced;
        const tier = provisionalTier(peer.stats, goodCut, mustGoCut);
        return fitTiers(forced ? "avoid" : tier);
      });
      const shares = shareCounts(tiers);
      const error = FIT_TIERS.reduce((sum, tier) => sum + (shares[tier] - targetTierShares[tier]) ** 2, 0);
      if (!best || error < best.error) best = { good: goodCut, mustGo: mustGoCut, shares, error };
    }
  }
  if (!best) return null;
  return {
    peers: peers.length,
    targetTierShares,
    currentTierShares,
    proposedGoodCut: round(best.good, 4),
    proposedMustGoCut: round(best.mustGo, 4),
    proposedTierShares: best.shares,
    residualSharePoints: round(Math.sqrt(best.error), 2),
  };
}

export function recalibratePeerData(candidates: RecalibrationCandidate[], now = new Date()): PeerRecalibration {
  const snapshot = buildPeerSnapshot(candidates, now);
  const snapshotBytes = peerSnapshotBytes(snapshot);
  let snapshotUnderLimit = true;
  try {
    assertSnapshotSize(snapshot);
  } catch {
    snapshotUnderLimit = false;
  }
  const peerSnapshot: PeerSnapshot = { id: 0, month: snapshot.month, publishedAt: now.toISOString(), groups: snapshot.groups };
  const memberIds = new Set(snapshot.members.map((member) => member.restaurantId));
  const peerInputs = candidates.filter((candidate) => memberIds.has(candidate.id));
  const scored: ScoredPeer[] = [];
  const depths = new Map<Input, number[]>();
  let forcedAvoidPeers = 0;
  for (const candidate of peerInputs) {
    const redFlags = redFlagGroups({
      now, format: candidate.format, reviews: candidate.reviews,
      flags: candidate.flags, changePointAt: candidate.changePointAt ?? null,
    });
    const redFlagForced = redFlags.some((flag) => flag.forcesAvoid);
    if (redFlagForced) forcedAvoidPeers++;
    const calculated = statsFor(candidate, peerSnapshot, now);
    if (!calculated) continue;
    const judged = judgeWithSnapshot(
      calculated.stats, candidate.format, candidate.city, peerSnapshot, redFlagForced, calculated.evidence.exceptional,
    );
    if (judged.provisional || !judged.tier || !judged.compositeStanding) continue;
    const pct = new Map(judged.standings.map((standing) => [standing.input, standing.percentile]));
    const counted = calculated.stats.filter((stat) => stat.counted);
    const weightedScore = counted.reduce((sum, stat) => sum + stat.weight * (pct.get(stat.input) ?? 0), 0);
    const gateScore = Math.min(...counted.map((stat) => pct.get(stat.input) ?? 0));
    const foodPercentile = pct.get("food") ?? 0;
    const foodFirstScore = Math.max(0, tierBand(foodPercentile) - Number((pct.get("service") ?? 0) < 25));
    scored.push({
      candidate, stats: calculated.stats, targetTier: judged.tier, redFlagForced,
      scope: `${candidate.city} · ${judged.compositeStanding.level} · ${judged.compositeStanding.key}`,
      weightedScore, gatesScore: gateScore, foodFirstScore,
    });
    for (const stat of calculated.stats) {
      if (stat.counted) (depths.get(stat.input) ?? (depths.set(stat.input, []), depths.get(stat.input)!)).push(stat.nEff);
    }
  }

  const grouped = new Map<string, ScoredPeer[]>();
  for (const peer of scored) grouped.set(peer.scope, [...(grouped.get(peer.scope) ?? []), peer]);
  const ruleRankings = [...grouped.entries()].map(([scope, peers]) => {
    const weighted = peers.map((peer) => peer.weightedScore);
    const tauGates = kendallTau(weighted, peers.map((peer) => peer.gatesScore));
    const tauFoodFirst = kendallTau(weighted, peers.map((peer) => peer.foodFirstScore));
    return {
      scope, peers: peers.length,
      weightedVsGatesTau: tauGates === null ? null : round(tauGates, 3),
      weightedVsFoodFirstTau: tauFoodFirst === null ? null : round(tauFoodFirst, 3),
      rankingReversed: (tauGates !== null && tauGates < 0) || (tauFoodFirst !== null && tauFoodFirst < 0),
    };
  }).sort((a, b) => a.scope.localeCompare(b.scope));

  const forcedAvoidShare = peerInputs.length ? forcedAvoidPeers / peerInputs.length : 0;
  return {
    snapshot, snapshotBytes, snapshotUnderLimit,
    qualifyingPeers: snapshot.members.length,
    baselineSampledPeers: snapshot.members.filter((member) => candidates.some((candidate) => candidate.id === member.restaurantId && candidate.baselineSampled)).length,
    shrinkage: snapshot.groups,
    inputDepth: INPUTS.flatMap((input) => {
      const values = depths.get(input) ?? [];
      if (!values.length) return [];
      const summary = percentileSummary(values);
      return [{ input, peers: values.length, nEffMedian: round(summary.median, 2), nEffP25: round(summary.p25, 2), nEffP75: round(summary.p75, 2) }];
    }),
    ruleRankings,
    forcedAvoidPeers,
    forcedAvoidShare,
    revisitRedFlagGate: forcedAvoidPeers === 0 || forcedAvoidShare > 0.05,
    provisionalCutoffs: fitProvisionalCutoffs(scored.filter((peer) => peer.candidate.baselineSampled)),
  };
}
