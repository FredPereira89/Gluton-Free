// Builds a Peer snapshot (ADR 0003, issue #68) from every Restaurant's stored Reviews. Pure: no I/O.
//
// Standings are built from raw weighted means, then θ: each Peer group and input gets a Format
// mean and a shrinkage k fitted by empirical Bayes, and every Peer's θ is shrunk with them exactly
// as `standingsFor` shrinks the Restaurant being judged, so the two are ranked on the same scale.
import { INPUTS, type Input } from "@/domain/aspects";
import { countedWeights, DEFAULT_SHRINK_K, midRank, peerGroupKeys, shrinkTheta, type PeerGroupStat, type PeerLevel } from "./peer";
import { peerEvidence, type PeerEvidence, type RollupReview } from "./rollup";

export type PeerCandidate = {
  id: number;
  city: string;
  format: string;
  status: "open" | "temporarily_closed" | "permanently_closed";
  reviews: RollupReview[];
  /** The Restaurant's own newest confirmed Change point; it keeps it if it becomes a Peer. */
  changePointAt?: Date | null;
};

export type PeerMember = { restaurantId: number; city: string; format: string };

export type BuiltPeerSnapshot = {
  /** "YYYY-MM" of the snapshot. */
  month: string;
  members: PeerMember[];
  /** One row per Peer group level, key and input. The composite array is held on the `food` row only (the anchor the reader ranks against); the other inputs carry []. */
  groups: PeerGroupStat[];
};

/** Bounds on k: never 0 (a Restaurant with no observations would divide by zero) and never so large that θ stops moving. */
const MIN_SHRINK_K = 1;
const MAX_SHRINK_K = 100;
/** α+β bounds for the exceptional-language prior, so a Peer group with no spread can't claim certainty. */
const MIN_PRIOR_STRENGTH = 1;
const MAX_PRIOR_STRENGTH = 1000;
/** Weak prior (mean 5%) for a Peer group with too little data to fit one. */
const FALLBACK_EXCEPTIONAL_PRIOR = { alpha: 1, beta: 19 };
/** ADR 0003: every snapshot is kept, so each stays under 1 MB. */
export const MAX_SNAPSHOT_BYTES = 1_000_000;

/** Serialised size of what is stored for a snapshot: its Peer group stats and its membership. */
export function peerSnapshotBytes(snapshot: Pick<BuiltPeerSnapshot, "members" | "groups">): number {
  return Buffer.byteLength(JSON.stringify({ members: snapshot.members, groups: snapshot.groups }));
}

export function assertSnapshotSize(snapshot: Pick<BuiltPeerSnapshot, "members" | "groups">, limit = MAX_SNAPSHOT_BYTES): void {
  const bytes = peerSnapshotBytes(snapshot);
  if (bytes > limit) throw new Error(`Peer snapshot is ${bytes} bytes, which exceeds the ${limit}-byte limit (ADR 0003)`);
}

const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

type Peer = { member: PeerMember; evidence: PeerEvidence };

/** Format mean and k for one input: moments estimate of between-Peer variance net of each Peer's sampling variance. */
function fitInput(peers: Peer[], input: Input): { mean: number; k: number } {
  const observed = peers.flatMap((p) => p.evidence.inputs.filter((e) => e.input === input && e.mean !== null));
  if (!observed.length) return { mean: 0, k: DEFAULT_SHRINK_K };
  const mean = observed.reduce((s, e) => s + e.mean!, 0) / observed.length;
  const withinDf = observed.reduce((s, e) => s + Math.max(0, e.nEff - 1), 0);
  if (observed.length < 2 || withinDf === 0) return { mean, k: DEFAULT_SHRINK_K };
  const withinVariance = observed.reduce((s, e) => s + Math.max(0, e.nEff - 1) * e.variance, 0) / withinDf;
  const betweenVariance = observed.reduce((s, e) => s + (e.mean! - mean) ** 2, 0) / (observed.length - 1);
  const samplingVariance = observed.reduce((s, e) => s + withinVariance / e.nEff, 0) / observed.length;
  const trueVariance = betweenVariance - samplingVariance;
  return { mean, k: trueVariance > 0 ? clamp(withinVariance / trueVariance, MIN_SHRINK_K, MAX_SHRINK_K) : MAX_SHRINK_K };
}

/** Beta prior for the exceptional-language test, fitted to Peers' exceptional shares by the Beta-binomial method of moments. */
function fitExceptionalPrior(peers: Peer[]): { alpha: number; beta: number } {
  const counted = peers.map((p) => p.evidence.exceptional).filter((e) => e.trials > 0);
  const peerCount = counted.length;
  const totalTrials = counted.reduce((s, e) => s + e.trials, 0);
  if (peerCount < 2) return FALLBACK_EXCEPTIONAL_PRIOR;
  const share = clamp(counted.reduce((s, e) => s + e.successes, 0) / totalTrials, 0.001, 0.999);
  const spread = counted.reduce((s, e) => s + e.trials * (e.successes / e.trials - share) ** 2, 0);
  const effectiveTrials = totalTrials - counted.reduce((s, e) => s + e.trials ** 2, 0) / totalTrials;
  const denominator = effectiveTrials - (peerCount - 1);
  if (denominator <= 0) return FALLBACK_EXCEPTIONAL_PRIOR;
  // E[spread] = share(1−share)·[ρ·effectiveTrials + (1−ρ)(peerCount−1)], with ρ = 1/(α+β+1).
  const rho = clamp((spread / (share * (1 - share)) - (peerCount - 1)) / denominator, 1 / (MAX_PRIOR_STRENGTH + 1), 1 / (MIN_PRIOR_STRENGTH + 1));
  const strength = 1 / rho - 1;
  return { alpha: round(share * strength, 6), beta: round((1 - share) * strength, 6) };
}

function buildGroup(city: string, level: PeerLevel, key: string, peers: Peer[]): PeerGroupStat[] {
  const prior = fitExceptionalPrior(peers);
  const thetas = new Map<Input, { perPeer: number[]; sorted: number[]; mean: number; k: number }>();
  for (const input of INPUTS) {
    const { mean, k } = fitInput(peers, input);
    const perPeer = peers.map((p) => {
      const e = p.evidence.inputs.find((x) => x.input === input)!;
      return e.mean === null ? mean : shrinkTheta(e.sumW, e.mean * e.sumW, mean, k);
    });
    thetas.set(input, { perPeer, sorted: [...perPeer].sort((a, b) => a - b), mean, k });
  }
  const composite = peers
    .map((p, index) => {
      let sum = 0;
      for (const [input, weight] of countedWeights(p.member.format)) {
        const t = thetas.get(input)!;
        sum += weight * midRank(t.sorted, t.perPeer[index]!);
      }
      return sum;
    })
    .sort((a, b) => a - b)
    .map((c) => round(c, 4));

  return INPUTS.map((input) => {
    const t = thetas.get(input)!;
    return {
      city, level, key, input,
      sortedTheta: t.sorted.map((x) => round(x, 5)),
      formatMean: round(t.mean, 5),
      k: round(t.k, 5),
      composite: input === "food" ? composite : [],
      exceptionalPrior: prior,
      peerCount: peers.length,
    };
  });
}

/**
 * The Peers are the Restaurants that are not permanently closed and whose Review window (cut by
 * their own confirmed Change point) meets the Not-enough-evidence bar. Membership is recomputed
 * from scratch, so a looked-up Restaurant joins once it meets the bar, and closed or now-thin
 * ones leave.
 */
export function buildPeerSnapshot(candidates: PeerCandidate[], now: Date): BuiltPeerSnapshot {
  const peers: Peer[] = [];
  for (const c of candidates) {
    if (c.status === "permanently_closed") continue;
    const evidence = peerEvidence(c.reviews, now, c.changePointAt ?? null);
    if (!evidence) continue;
    peers.push({ member: { restaurantId: c.id, city: c.city, format: c.format }, evidence });
  }

  const byGroup = new Map<string, { city: string; level: PeerLevel; key: string; peers: Peer[] }>();
  for (const peer of peers) {
    for (const { level, key } of peerGroupKeys(peer.member.city, peer.member.format)) {
      const id = `${peer.member.city}\u0000${level}\u0000${key}`;
      const group = byGroup.get(id) ?? { city: peer.member.city, level, key, peers: [] };
      group.peers.push(peer);
      byGroup.set(id, group);
    }
  }
  const groups = [...byGroup.values()].flatMap((g) => buildGroup(g.city, g.level, g.key, g.peers));
  const snapshot = { month: now.toISOString().slice(0, 7), members: peers.map((p) => p.member), groups };
  assertSnapshotSize(snapshot);
  return snapshot;
}
