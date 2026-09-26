// The Verdict rule, provisional form ("Verdict rule: gates, weights, confidence", section 8):
// the ADR 0002 weights applied to absolute θ on the −2..+2 scale, because there are no Peers yet.
// Pure: no I/O, deterministic (the bootstrap uses a seeded generator).
import { ASPECTS, INFORMATIVE_ONLY, INPUTS, INPUT_WEIGHTS, type Aspect, type FlagType, type Input, type Tier } from "@/domain/aspects";
import { THEMES, type ThemeCode } from "@/domain/themes";
import { compositePercentileFor, DEFAULT_SHRINK_K, formatPercentile, judgeWithSnapshot, type CompositeStanding, type PeerSnapshot, type Standing, type TierFloor } from "./peer";

/**
 * Successes/trials for the exceptional-language test (issue #36): "exceptional" Reviews for food
 * or overall count toward the Restaurant's own rate; service-only exceptional language does not,
 * though it still counts as a trial once a Review has been classified.
 */
export function exceptionalCounts(reviews: RollupReview[]): { successes: number; trials: number } {
  const classified = reviews.filter((r) => r.hasText && r.exceptional !== null);
  const successes = classified.filter((r) => r.exceptional === "food" || r.exceptional === "overall").length;
  return { successes, trials: classified.length };
}

export const RULE_VERSION = "provisional-v2-red-flags";

export const PARAMS = {
  halfLifeMonths: 18,
  shrinkK: DEFAULT_SHRINK_K,
  priorMu: 0,
  subRatingWeight: 0.5,
  goodCut: 0.8,
  mustGoCut: 1.3,
  mustGoFood: 1.3,
  mustGoService: 0.8,
  mustGoAspectFloor: 0.3,
  bootstrap: 200,
  minTextReviews: 15,
  minFoodMentions: 8,
  maxNewestAgeMonths: 18,
  themeWindowMonths: 24,
  consistencyShrinkK: 20,
  reviewWindowCap: 100,
  reviewWindowMaxAgeMonths: 24,
} as const;

export type RollupReview = {
  id: number;
  source: string;
  publishedAt: Date;
  stars: number | null;
  hasText: boolean;
  subRatings: Partial<Record<Aspect, number>> | null;
  /** Null when the Review has no text or has not been analysed yet. */
  aspects: Record<Aspect, number | null> | null;
  exceptional: "none" | "food" | "service" | "overall" | null;
  themes: string[];
};

export type RollupFlag = {
  reviewId: number;
  type: FlagType;
  group: "health" | "money";
  firstHand: boolean;
  verification: "pending" | "confirmed" | "rejected";
  publishedAt: Date;
  evidence?: string;
  source?: string;
};

export type RollupInput = {
  now: Date;
  format: string;
  city?: string;
  peerSnapshot?: PeerSnapshot | null;
  reviews: RollupReview[];
  /** Listed Crowd Sources, including those with no stored Reviews yet. */
  sourceCodes?: string[];
  flags: RollupFlag[];
  /** The newest confirmed Change point, if any (ADR 0007). Cuts every Source's window short. */
  changePointAt?: Date | null;
  /** Owner-confirmed description, for example "Reopened after renovation". */
  changePointDescription?: string;
  /** Crowd Sources whose most recent fetch failed (issue #38): forces Confidence to Low. */
  failedSourceCodes?: string[];
};

export type InputStat = {
  input: Input;
  counted: boolean;
  weight: number; // rescaled share of the composite, 0 when informative-only
  theta: number;
  nEff: number;
  n: number; // Reviews contributing
  sumW: number;
};

export type RedFlagGroup = {
  group: "health" | "money";
  incidents12m: number;
  newestAt: string | null;
  shareOfText12m: number;
  forcesAvoid: boolean;
  types: FlagType[];
  incidents?: { reviewId: number; type: FlagType; evidence: string; source: string; publishedAt: string; stars?: number | null }[];
};

export type SourceHistory = {
  source: string;
  quarters: { quarter: string; stars: number | null; ratings: number; volume: number }[];
};

/** A Crowd Source's own Tier reading (issue #38): the Restaurant judged on that Source's Reviews alone. */
export type SourceReading = {
  source: string;
  tier: Tier | null;
  /** Text Reviews from this Source in the last 12 months. */
  textReviews12m: number;
  /** Fewer than 10 text Reviews from this Source in the last 12 months. */
  quiet: boolean;
};

/**
 * Named Sources whose per-Source Tier readings disagree (issue #41), for a line like "Google reads
 * Good, Tripadvisor reads OK since May 2025 (42 Reviews)". Only counts non-quiet Sources with a
 * Tier reading; `since` is the later of their window starts, `textReviews` the sum of their window
 * text Review counts.
 */
export type SourceDisagreement = {
  sources: { source: string; tier: Tier }[];
  since: string;
  textReviews: number;
};

export type Rollup = {
  ruleVersion: string;
  provisional: boolean;
  peerSnapshot?: { id: number; month: string; publishedAt: string } | null;
  standings?: Standing[];
  compositeStanding?: CompositeStanding | null;
  state: "verdict" | "not_enough_evidence";
  tier: Tier | null;
  /** Most recent change from one issued Tier to another. */
  tierChange?: { from: Tier; at: string };
  /** Peer standings when the current Tier was first issued, used across held re-judges. */
  tierBasis?: { composite: number; standings: { input: Input; percentile: number }[] };
  /** Current raw judgement differed, but the automatic stability margin held the issued Tier. */
  tierHeld?: boolean;
  composite: number;
  inputs: InputStat[];
  contributions: { input: Input; value: number }[];
  floorCap: string | null;
  tierFloors?: TierFloor[];
  ceilingNote?: string | null;
  notEnoughEvidence: {
    textReviews: number;
    foodMentions: number;
    newestAgeMonths: number | null;
    missed: string[];
    bars: {
      textReviews: { have: number; need: number; met: boolean };
      foodMentions: { have: number; need: number; met: boolean };
      newestReview: { have: number | null; need: number; met: boolean };
    };
    reasonLine: string | null;
  };
  redFlags: RedFlagGroup[];
  confidence: { level: "low" | "medium" | "high"; bootstrapShare: number; caps: string[] };
  /** windowMonths is the per-Source Review window's own bound (ADR 0004), not a spread-specific cutoff. */
  consistencySpread: { sd: number | null; n: number; windowMonths: number };
  counts: {
    reviews: number;
    textReviews: number;
    ratingOnly: number;
    analysed: number;
    perSource: Record<string, { reviews: number; text: number; newest: string | null; windowStart: string | null }>;
  };
  themes: { code: ThemeCode; aspect: Aspect; polarity: 1 | -1; count: number; share: number }[];
  themeBase: { analysed: number; windowMonths: number };
  series: {
    quarter: string;
    composite: number | null;
    /** The quarter's composite ranked against the current Peer snapshot (issue #41); null while provisional. */
    compositePercentile: number | null;
    /** At least 8 text Reviews in the quarter; fewer draws a hollow "few Reviews" marker. */
    enoughReviews: boolean;
    volume: number;
    textVolume: number;
  }[];
  sourceHistory: SourceHistory[];
  sourceReadings: SourceReading[];
  /** The newest confirmed Change point, if any (ADR 0007); mirrors the input. */
  changePointAt: string | null;
  /** Mirrors the input; present only alongside changePointAt. */
  changePointDescription?: string;
  /** Null unless at least two non-quiet Sources' Tier readings differ (issue #41). */
  disagreement: SourceDisagreement | null;
};

const MONTH_MS = 30.4375 * 24 * 3600 * 1000;
const ageMonths = (now: Date, d: Date) => Math.max(0, (now.getTime() - d.getTime()) / MONTH_MS);
const recency = (age: number) => Math.pow(0.5, age / PARAMS.halfLifeMonths);
const textIn12mCount = (text: RollupReview[], now: Date) => text.filter((r) => ageMonths(now, r.publishedAt) <= 12).length;

function countedInputs(format: string): Input[] {
  const skip = new Set(INFORMATIVE_ONLY[format] ?? []);
  return INPUTS.filter((i) => !skip.has(i));
}

/** Weighted (w, s) pairs for one input, per the kind rule: text 1, sub-rating fill 0.5, stars feed Overall only. */
function observations(input: Input, reviews: RollupReview[], now: Date, useRecency = true): [number, number][] {
  const out: [number, number][] = [];
  for (const r of reviews) {
    const rw = useRecency ? recency(ageMonths(now, r.publishedAt)) : 1;
    if (input === "overall") {
      if (r.stars !== null) out.push([rw, r.stars - 3]);
      continue;
    }
    if (!r.hasText || !r.aspects) continue;
    const a = r.aspects[input];
    if (a !== null) out.push([rw, a]);
    else {
      const sub = r.subRatings?.[input];
      if (sub !== undefined) out.push([rw * PARAMS.subRatingWeight, sub - 3]);
    }
  }
  return out;
}

export function shrunk(obs: [number, number][]): { theta: number; nEff: number; sumW: number; n: number } {
  let sw = 0;
  let sws = 0;
  let sw2 = 0;
  for (const [w, s] of obs) {
    sw += w;
    sws += w * s;
    sw2 += w * w;
  }
  const theta = (sws + PARAMS.shrinkK * PARAMS.priorMu) / (sw + PARAMS.shrinkK);
  return { theta, nEff: sw2 > 0 ? (sw * sw) / sw2 : 0, sumW: sw, n: obs.length };
}

function inputStats(reviews: RollupReview[], now: Date, format: string, useRecency = true): InputStat[] {
  const counted = new Set(countedInputs(format));
  const total = [...counted].reduce((s, i) => s + INPUT_WEIGHTS[i], 0);
  return INPUTS.map((input) => {
    const st = shrunk(observations(input, reviews, now, useRecency));
    const isCounted = counted.has(input);
    return { input, counted: isCounted, weight: isCounted ? INPUT_WEIGHTS[input] / total : 0, ...st };
  });
}

const compositeOf = (stats: InputStat[]) => stats.reduce((s, x) => s + x.weight * x.theta, 0);
const theta = (stats: InputStat[], i: Input) => stats.find((x) => x.input === i)!.theta;

/** Provisional Tier from θ alone (Red flags are applied by the caller). */
export function tierFrom(stats: InputStat[]): { tier: Tier; floorCap: string | null } {
  const composite = compositeOf(stats);
  if (theta(stats, "food") < 0 || theta(stats, "overall") < 0) return { tier: "avoid", floorCap: null };
  if (composite >= PARAMS.mustGoCut) {
    const failed: string[] = [];
    if (theta(stats, "food") < PARAMS.mustGoFood) failed.push(`food below +${PARAMS.mustGoFood}`);
    if (theta(stats, "service") < PARAMS.mustGoService) failed.push(`service below +${PARAMS.mustGoService}`);
    for (const s of stats) {
      if (s.counted && s.input !== "overall" && s.input !== "food" && s.input !== "service" && s.theta < PARAMS.mustGoAspectFloor) {
        failed.push(`${s.input} below +${PARAMS.mustGoAspectFloor}`);
      }
    }
    if (!failed.length) return { tier: "must_go", floorCap: null };
    return { tier: "good", floorCap: `Must Go floor not met: ${failed.join(", ")}` };
  }
  if (composite >= PARAMS.goodCut) return { tier: "good", floorCap: null };
  return { tier: "ok", floorCap: null };
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function monthsBefore(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function redFlagGroups(input: RollupInput): RedFlagGroup[] {
  const twelveMonthsAgo = monthsBefore(input.now, 12);
  const sixMonthsAgo = monthsBefore(input.now, 6);
  const textReviews = input.reviews.filter((r) => r.hasText && r.publishedAt >= twelveMonthsAgo && r.publishedAt <= input.now &&
    (!input.changePointAt || r.publishedAt >= input.changePointAt));
  const textReviewIds = new Set(textReviews.map((r) => r.id));
  const reviewById = new Map(textReviews.map((r) => [r.id, r]));
  const textIn12m = textReviewIds.size;
  const groups: RedFlagGroup[] = [];
  for (const group of ["health", "money"] as const) {
    const recent = input.flags.filter(
      (f) => f.group === group && f.verification === "confirmed" && f.firstHand &&
        f.publishedAt >= twelveMonthsAgo && f.publishedAt <= input.now &&
        (!input.changePointAt || f.publishedAt >= input.changePointAt) && textReviewIds.has(f.reviewId),
    );
    const byReview = new Map<number, RollupFlag>();
    for (const flag of recent) if (!byReview.has(flag.reviewId)) byReview.set(flag.reviewId, flag);
    if (!byReview.size) continue;
    const newest = recent.reduce<Date | null>((m, f) => (!m || f.publishedAt > m ? f.publishedAt : m), null);
    const share = textIn12m ? byReview.size / textIn12m : 0;
    const forcesAvoid = byReview.size >= 2 && newest !== null && newest >= sixMonthsAgo && share >= 0.01;
    groups.push({
      group,
      incidents12m: byReview.size,
      newestAt: newest?.toISOString() ?? null,
      shareOfText12m: share,
      forcesAvoid,
      types: [...new Set(recent.map((f) => f.type))],
      incidents: [...byReview.values()].filter((f) => f.evidence && f.source).map((f) => ({
        reviewId: f.reviewId, type: f.type, evidence: f.evidence!, source: f.source!,
        publishedAt: f.publishedAt.toISOString(), stars: reviewById.get(f.reviewId)!.stars,
      })),
    });
  }
  return groups;
}

export function tierWithRedFlags(tier: Tier, groups: RedFlagGroup[]): Tier {
  if (groups.some((g) => g.forcesAvoid)) return "avoid";
  if (tier === "life_changing" && groups.length) return "must_go";
  return tier;
}

/**
 * A Review's stance (issue #32): stars − 3 when rated, otherwise the mean of its Aspect scores.
 * The extracted `consistency` Aspect is left out of that mean — Consistency is derived from the
 * spread of stance, not fed by the extracted signal it replaces as an input.
 */
function stanceOf(r: RollupReview): number | null {
  if (r.stars !== null) return r.stars - 3;
  if (!r.aspects) return null;
  const scored = ASPECTS.filter((a) => a !== "consistency")
    .map((a) => r.aspects![a])
    .filter((v): v is number => v !== null);
  return scored.length ? scored.reduce((s, v) => s + v, 0) / scored.length : null;
}

/** Weighted median (lower value on ties), used as the robust anchor the spread shrinks toward. */
function weightedMedian(points: { w: number; x: number }[]): number {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const total = sorted.reduce((s, p) => s + p.w, 0);
  let cum = 0;
  for (const p of sorted) {
    cum += p.w;
    if (cum >= total / 2) return p.x;
  }
  return sorted[sorted.length - 1]!.x;
}

const quarterIndex = (d: Date) => d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);
const quarterLabel = (index: number) => `${Math.floor(index / 4)}-Q${index % 4 + 1}`;
export const quarterOf = (d: Date) => quarterLabel(quarterIndex(d));

/** Full stored Review history; the Verdict's Review window does not limit chart data. */
export function quarterlySourceHistory(reviews: Pick<RollupReview, "source" | "publishedAt" | "stars">[], now: Date, sourceCodes: string[] = []): SourceHistory[] {
  if (!reviews.length && !sourceCodes.length) return [];
  let first = quarterIndex(now);
  let last = first;
  const bySource = new Map<string, Map<number, { volume: number; ratings: number; starsTotal: number }>>(
    sourceCodes.map((source) => [source, new Map()]),
  );
  for (const r of reviews) {
    let quarters = bySource.get(r.source);
    if (!quarters) {
      quarters = new Map();
      bySource.set(r.source, quarters);
    }
    const index = quarterIndex(r.publishedAt);
    first = Math.min(first, index);
    last = Math.max(last, index);
    const bucket = quarters.get(index) ?? { volume: 0, ratings: 0, starsTotal: 0 };
    bucket.volume++;
    if (r.stars !== null) {
      bucket.ratings++;
      bucket.starsTotal += r.stars;
    }
    quarters.set(index, bucket);
  }
  return [...bySource.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([source, quarters]) => ({
    source,
    quarters: Array.from({ length: last - first + 1 }, (_, offset) => {
      const index = first + offset;
      const bucket = quarters.get(index);
      return {
        quarter: quarterLabel(index),
        stars: bucket && bucket.ratings >= 5 ? bucket.starsTotal / bucket.ratings : null,
        ratings: bucket?.ratings ?? 0,
        volume: bucket?.volume ?? 0,
      };
    }),
  }));
}

/**
 * Per-Source Review window (ADR 0004, ADR 0007): each Source's text Reviews, newest first, up to
 * `reviewWindowCap` and no older than `reviewWindowMaxAgeMonths` or the newest confirmed Change
 * point, whichever cuts shorter. The window then runs from the oldest included text Review to now;
 * every rating dated inside it, rating-only Reviews included, is kept. A Source with no qualifying
 * text Review has no window and contributes nothing. Reviews outside the window are simply left out
 * of the result — nothing is deleted, they just stop counting.
 */
export function reviewWindowCutoff(now: Date, changePointAt: Date | null): Date {
  const maxAge = new Date(now.getTime() - PARAMS.reviewWindowMaxAgeMonths * MONTH_MS);
  return changePointAt && changePointAt > maxAge ? changePointAt : maxAge;
}

export function applyReviewWindow(reviews: RollupReview[], now: Date, changePointAt: Date | null): RollupReview[] {
  const cutoff = reviewWindowCutoff(now, changePointAt);

  const bySource = new Map<string, RollupReview[]>();
  for (const r of reviews) {
    const list = bySource.get(r.source);
    if (list) list.push(r);
    else bySource.set(r.source, [r]);
  }

  const out: RollupReview[] = [];
  for (const rs of bySource.values()) {
    const text = rs
      .filter((r) => r.hasText && r.publishedAt >= cutoff)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, PARAMS.reviewWindowCap);
    if (!text.length) continue;
    const start = text[text.length - 1]!.publishedAt;
    for (const r of rs) if (r.publishedAt >= start) out.push(r);
  }
  return out;
}

function evidenceBars(reviews: RollupReview[], now: Date): Rollup["notEnoughEvidence"] {
  const text = reviews.filter((r) => r.hasText);
  const foodMentions = text.filter((r) => r.aspects?.food !== null && r.aspects?.food !== undefined).length;
  const newest = reviews.reduce<Date | null>((m, r) => (!m || r.publishedAt > m ? r.publishedAt : m), null);
  const newestAgeMonths = newest ? ageMonths(now, newest) : null;
  const bars = {
    textReviews: { have: text.length, need: PARAMS.minTextReviews, met: text.length >= PARAMS.minTextReviews },
    foodMentions: { have: foodMentions, need: PARAMS.minFoodMentions, met: foodMentions >= PARAMS.minFoodMentions },
    newestReview: { have: newestAgeMonths, need: PARAMS.maxNewestAgeMonths, met: newestAgeMonths !== null && newestAgeMonths <= PARAMS.maxNewestAgeMonths },
  };
  const missed: string[] = [];
  if (!bars.textReviews.met) missed.push(`fewer than ${bars.textReviews.need} Reviews with text`);
  if (!bars.foodMentions.met) missed.push(`food mentioned in fewer than ${bars.foodMentions.need} Reviews`);
  if (!bars.newestReview.met) missed.push(`newest Review older than ${bars.newestReview.need} months`);
  return { textReviews: text.length, foodMentions, newestAgeMonths, missed, bars, reasonLine: null };
}

export function rollup(input: RollupInput): Rollup {
  const { now, format } = input;
  const reviews = applyReviewWindow(input.reviews, now, input.changePointAt ?? null);
  const stats = inputStats(reviews, now, format);
  const composite = compositeOf(stats);
  const text = reviews.filter((r) => r.hasText);
  const analysed = text.filter((r) => r.aspects);

  // Not enough evidence.
  const notEnoughEvidence = evidenceBars(reviews, now);
  const { missed } = notEnoughEvidence;

  // Red flags.
  const textIn12m = textIn12mCount(text, now);
  const redFlags = redFlagGroups(input);
  const forced = redFlags.some((g) => g.forcesAvoid);

  const base = tierFrom(stats);
  const tier = tierWithRedFlags(base.tier, redFlags);

  // Peer-relative Tier (issue #35): mid-rank standings, the composite ranked again among Peer
  // composites, and the resulting Tier with its floors. Falls back to the provisional θ-based
  // Tier above when the snapshot is missing or incomplete for a counted input.
  const peers = judgeWithSnapshot(stats, format, input.city, input.peerSnapshot, forced, exceptionalCounts(reviews));

  // Confidence: bootstrap over Reviews, then the caps. A still-provisional Verdict always ends Low.
  const rand = mulberry32(42);
  let same = 0;
  for (let b = 0; b < PARAMS.bootstrap; b++) {
    const sample = Array.from({ length: reviews.length }, () => reviews[Math.floor(rand() * reviews.length)]!);
    if ((forced ? "avoid" : tierFrom(inputStats(sample, now, format)).tier) === tier) same++;
  }
  const share = reviews.length ? same / PARAMS.bootstrap : 0;
  const levels = ["low", "medium", "high"] as const;
  let level = share >= 0.8 ? 2 : share >= 0.55 ? 1 : 0;
  const caps: string[] = [];
  const sources = [...new Set(reviews.map((r) => r.source))];
  if (sources.length < 2) {
    caps.push("only one Crowd Source");
    level = Math.min(level, 1);
  }
  if (textIn12m < 5) {
    caps.push("fewer than 5 Reviews with text in the last 12 months");
    level = Math.min(level, 1);
  }

  // Per-Source Tier readings (issue #38): each Crowd Source judged on its own Reviews alone, using
  // the same Peer snapshot. Listed Sources with no Reviews yet still get a (null, quiet) reading.
  const readingSources = [...new Set([...(input.sourceCodes ?? []), ...sources])];
  const sourceEntries = readingSources.map((source) => {
    const sourceReviews = reviews.filter((r) => r.source === source);
    const windowTextCount = sourceReviews.filter((r) => r.hasText).length;
    const textReviews12m = textIn12mCount(text.filter((r) => r.source === source), now);
    if (!sourceReviews.length) return { source, tier: null, textReviews12m, windowTextCount, compositePercentile: null };
    const sourceStats = inputStats(sourceReviews, now, format);
    const judged = judgeWithSnapshot(sourceStats, format, input.city, input.peerSnapshot, false, exceptionalCounts(sourceReviews));
    const tier = judged.provisional ? tierFrom(sourceStats).tier : judged.tier;
    return { source, tier, textReviews12m, windowTextCount, compositePercentile: judged.provisional ? null : judged.compositeStanding?.percentile ?? null };
  });
  const sourceReadings: SourceReading[] = sourceEntries.map(({ source, tier, textReviews12m }) => ({
    source, tier, textReviews12m, quiet: textReviews12m < 10,
  }));

  // Sources disagree (issue #38): only Sources with at least 10 text Reviews in their own window
  // count toward diversity, so a quiet Source can't trigger this cap.
  const qualifyingSources = sourceEntries.filter((e) => e.windowTextCount >= 10 && e.compositePercentile !== null);
  if (qualifyingSources.length > 1) {
    const percentiles = qualifyingSources.map((e) => e.compositePercentile!);
    const spread = Math.max(...percentiles) - Math.min(...percentiles);
    if (spread >= 30) {
      caps.push(`Sources disagree by ${Math.round(spread)} points (${qualifyingSources.map((e) => `${e.source}: ${formatPercentile(e.compositePercentile!)}`).join(", ")})`);
      level = Math.max(0, level - 1);
    }
  }

  // Text and stars disagree (issue #38): the text-only composite percentile against the stars-only
  // (overall) percentile, both from the same Peer standings used for the issued Tier.
  if (!peers.provisional) {
    const weightOf = (i: Input) => stats.find((s) => s.input === i)?.weight ?? 0;
    const textStandings = peers.standings.filter((s) => s.input !== "overall");
    const textWeight = textStandings.reduce((s, st) => s + weightOf(st.input), 0);
    const textPercentile = textWeight
      ? textStandings.reduce((s, st) => s + weightOf(st.input) * st.percentile, 0) / textWeight
      : null;
    const starsStanding = peers.standings.find((s) => s.input === "overall");
    if (textPercentile !== null && starsStanding) {
      const spread = Math.abs(textPercentile - starsStanding.percentile);
      if (spread >= 30) {
        caps.push(`text and stars disagree by ${Math.round(spread)} points (text: ${formatPercentile(textPercentile)}, stars: ${formatPercentile(starsStanding.percentile)})`);
        level = Math.max(0, level - 1);
      }
    }
  }
  if (peers.provisional) {
    caps.push("provisional: judged against default cut-offs, not Peers");
    level = 0;
  }
  if (input.failedSourceCodes?.length) {
    caps.push(`a Crowd Source failed: ${input.failedSourceCodes.join(", ")}`);
    level = 0;
  }

  // Consistency spread (informational: derived, not extracted — issue #32): the recency-weighted
  // spread of per-Review stance, shrunk toward a robust, median-anchored spread below about
  // `consistencyShrinkK` Reviews so one or two outliers can't swing it — the same
  // (n·x + k·prior)/(n+k) blend `shrunk()` uses for θ, with the median-anchored spread standing in
  // for that function's fixed `priorMu`. `reviews` is already the per-Source window (applyReviewWindow
  // above), so no separate age cutoff is applied here.
  const stancePoints = reviews
    .map((r) => ({ w: recency(ageMonths(now, r.publishedAt)), x: stanceOf(r) }))
    .filter((p): p is { w: number; x: number } => p.x !== null);
  let sd: number | null = null;
  if (stancePoints.length >= 2) {
    const sw = stancePoints.reduce((s, p) => s + p.w, 0);
    const mean = stancePoints.reduce((s, p) => s + p.w * p.x, 0) / sw;
    const sdMean = Math.sqrt(stancePoints.reduce((s, p) => s + p.w * (p.x - mean) ** 2, 0) / sw);

    const median = weightedMedian(stancePoints);
    const mad = weightedMedian(stancePoints.map((p) => ({ w: p.w, x: Math.abs(p.x - median) })));
    const sdMedian = mad * 1.4826;

    const n = stancePoints.length;
    const k = PARAMS.consistencyShrinkK;
    sd = (n * sdMean + k * sdMedian) / (n + k);
  }

  // Themes over the recent window (all analysed Reviews if the window is thin).
  let themeBase = analysed.filter((r) => ageMonths(now, r.publishedAt) <= PARAMS.themeWindowMonths);
  let themeWindow: number = PARAMS.themeWindowMonths;
  if (themeBase.length < 50) {
    themeBase = analysed;
    themeWindow = 0;
  }
  const themeCounts = new Map<ThemeCode, number>();
  for (const r of themeBase) for (const t of r.themes) if (t in THEMES) themeCounts.set(t as ThemeCode, (themeCounts.get(t as ThemeCode) ?? 0) + 1);
  const themes = [...themeCounts.entries()]
    .map(([code, count]) => ({ code, aspect: THEMES[code].aspect as Aspect, polarity: THEMES[code].polarity, count, share: count / themeBase.length }))
    .sort((a, b) => b.count - a.count);

  // Quarterly series: each quarter on its own Reviews, no recency decay.
  const byQ = new Map<string, RollupReview[]>();
  for (const r of reviews) {
    const q = quarterOf(r.publishedAt);
    byQ.set(q, [...(byQ.get(q) ?? []), r]);
  }
  // The composite layer (issue #41): each quarter judged on its own Reviews only (no recency decay),
  // ranked against today's Peer snapshot ("vs today's Peers") rather than a snapshot from that
  // quarter. Omitted entirely while the Verdict is provisional.
  const series = [...byQ.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarter, rs]) => {
      const quarterStats = rs.some((r) => r.aspects) ? inputStats(rs, now, format, false) : null;
      const compositePercentile = !peers.provisional && quarterStats
        ? compositePercentileFor(quarterStats, format, input.city, input.peerSnapshot)
        : null;
      return {
        quarter,
        composite: quarterStats ? compositeOf(quarterStats) : null,
        compositePercentile,
        enoughReviews: rs.filter((r) => r.hasText).length >= 8,
        volume: rs.length,
        textVolume: rs.filter((r) => r.hasText).length,
      };
    });

  const perSource: Rollup["counts"]["perSource"] = {};
  for (const s of sources) {
    const rs = reviews.filter((r) => r.source === s);
    const nw = rs.reduce<Date | null>((m, r) => (!m || r.publishedAt > m ? r.publishedAt : m), null);
    const textDates = rs.filter((r) => r.hasText).map((r) => r.publishedAt);
    const windowStart = textDates.length ? textDates.reduce((m, d) => (d < m ? d : m)) : null;
    perSource[s] = {
      reviews: rs.length,
      text: rs.filter((r) => r.hasText).length,
      newest: nw?.toISOString() ?? null,
      windowStart: windowStart?.toISOString() ?? null,
    };
  }

  // Sources disagree line (issue #41): named Sources whose per-Source Tier readings differ, built
  // from the same non-quiet readings the Confidence cap above draws on.
  const disagreeingReadings = sourceReadings.filter((s) => !s.quiet && s.tier !== null);
  const disagreement: SourceDisagreement | null =
    new Set(disagreeingReadings.map((s) => s.tier)).size > 1
      ? {
          sources: disagreeingReadings.map((s) => ({ source: s.source, tier: s.tier! })),
          since: disagreeingReadings.reduce<string>(
            (latest, s) => {
              const start = perSource[s.source]?.windowStart;
              return start && start > latest ? start : latest;
            },
            "",
          ),
          textReviews: disagreeingReadings.reduce((sum, s) => sum + (perSource[s.source]?.text ?? 0), 0),
        }
      : null;

  const state = missed.length && !forced ? "not_enough_evidence" : "verdict";
  if (state === "not_enough_evidence" && input.changePointAt) {
    const withoutChange = evidenceBars(applyReviewWindow(input.reviews, now, null), now);
    if (withoutChange.missed.length === 0) {
      const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(input.changePointAt);
      const event = input.changePointDescription?.trim() || "Change point";
      notEnoughEvidence.reasonLine = `${event} on ${date}; ${notEnoughEvidence.textReviews} Reviews since`;
    }
  }
  const finalTier = tierWithRedFlags(peers.provisional ? tier : peers.tier!, redFlags);
  const finalFloorCap = peers.provisional ? (forced ? null : base.floorCap) : peers.floorCap;
  // tierWithRedFlags only ever moves a peer-judged Life Changing when a confirmed Red flag is
  // present (issue #36); anything else that changed the Tier already has its own ceiling note.
  const finalCeilingNote = !peers.provisional && peers.tier === "life_changing" && finalTier !== "life_changing"
    ? "blocked by a verified Red flag in the last 12 months"
    : peers.provisional ? null : peers.ceilingNote;
  const result: Rollup = {
    ruleVersion: RULE_VERSION,
    provisional: peers.provisional,
    peerSnapshot: peers.peerSnapshot,
    standings: peers.standings,
    compositeStanding: peers.compositeStanding,
    state,
    tier: state === "verdict" ? finalTier : null,
    composite,
    inputs: stats,
    contributions: stats
      .filter((s) => s.counted)
      .map((s) => ({ input: s.input, value: s.weight * s.theta }))
      .sort((a, b) => b.value - a.value),
    floorCap: finalFloorCap,
    tierFloors: peers.provisional ? [] : peers.tierFloors,
    ceilingNote: finalCeilingNote,
    notEnoughEvidence,
    redFlags,
    confidence: { level: levels[level]!, bootstrapShare: share, caps },
    consistencySpread: { sd, n: stancePoints.length, windowMonths: PARAMS.reviewWindowMaxAgeMonths },
    counts: { reviews: reviews.length, textReviews: text.length, ratingOnly: reviews.length - text.length, analysed: analysed.length, perSource },
    themes,
    themeBase: { analysed: themeBase.length, windowMonths: themeWindow },
    series,
    sourceHistory: quarterlySourceHistory(input.reviews, now, input.sourceCodes),
    sourceReadings,
    changePointAt: input.changePointAt?.toISOString() ?? null,
    changePointDescription: input.changePointAt ? input.changePointDescription : undefined,
    disagreement,
  };
  return result;
}
