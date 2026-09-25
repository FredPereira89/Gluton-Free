// The Verdict rule, provisional form ("Verdict rule: gates, weights, confidence", section 8):
// the ADR 0002 weights applied to absolute θ on the −2..+2 scale, because there are no Peers yet.
// Pure: no I/O, deterministic (the bootstrap uses a seeded generator).
import { ASPECTS, INFORMATIVE_ONLY, INPUTS, INPUT_WEIGHTS, type Aspect, type FlagType, type Input, type Tier } from "@/domain/aspects";
import { THEMES, type ThemeCode } from "@/domain/themes";
import { DEFAULT_SHRINK_K, judgeWithSnapshot, type PeerSnapshot, type Standing } from "./peer";

export const RULE_VERSION = "provisional-v1";

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
};

export type RollupInput = {
  now: Date;
  format: string;
  city?: string;
  peerSnapshot?: PeerSnapshot | null;
  reviews: RollupReview[];
  flags: RollupFlag[];
  /** The newest confirmed Change point, if any (ADR 0007). Cuts every Source's window short. */
  changePointAt?: Date | null;
  /** Owner-confirmed description, for example "Reopened after renovation". */
  changePointDescription?: string;
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
};

export type SourceHistory = {
  source: string;
  quarters: { quarter: string; stars: number | null; ratings: number; volume: number }[];
};

export type Rollup = {
  ruleVersion: string;
  provisional: boolean;
  peerSnapshot?: { id: number; month: string; publishedAt: string } | null;
  standings?: Standing[];
  state: "verdict" | "not_enough_evidence";
  tier: Tier | null;
  composite: number;
  inputs: InputStat[];
  contributions: { input: Input; value: number }[];
  floorCap: string | null;
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
  series: { quarter: string; composite: number | null; volume: number; textVolume: number }[];
  sourceHistory: SourceHistory[];
};

const MONTH_MS = 30.4375 * 24 * 3600 * 1000;
const ageMonths = (now: Date, d: Date) => Math.max(0, (now.getTime() - d.getTime()) / MONTH_MS);
const recency = (age: number) => Math.pow(0.5, age / PARAMS.halfLifeMonths);

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

/** Band of a single θ-scale score, for the provisional disagreement caps. */
function band(x: number): Tier {
  if (x < 0) return "avoid";
  if (x >= PARAMS.mustGoCut) return "must_go";
  if (x >= PARAMS.goodCut) return "good";
  return "ok";
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

function redFlagGroups(input: RollupInput, textIn12m: number): RedFlagGroup[] {
  const groups: RedFlagGroup[] = [];
  for (const group of ["health", "money"] as const) {
    const recent = input.flags.filter(
      (f) => f.group === group && f.verification === "confirmed" && f.firstHand && ageMonths(input.now, f.publishedAt) <= 12,
    );
    const reviewIds = new Set(recent.map((f) => f.reviewId));
    if (!reviewIds.size) continue;
    const newest = recent.reduce<Date | null>((m, f) => (!m || f.publishedAt > m ? f.publishedAt : m), null);
    const share = textIn12m ? reviewIds.size / textIn12m : 1;
    const reviewIds3m = new Set(recent.filter((f) => ageMonths(input.now, f.publishedAt) <= 3).map((f) => f.reviewId));
    const forcesAvoid = reviewIds3m.size >= 3 && share >= 0.01;
    groups.push({
      group,
      incidents12m: reviewIds.size,
      newestAt: newest?.toISOString() ?? null,
      shareOfText12m: share,
      forcesAvoid,
      types: [...new Set(recent.map((f) => f.type))],
    });
  }
  return groups;
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

function quarterOf(d: Date): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/** Full stored Review history; the Verdict's Review window does not limit chart data. */
export function quarterlySourceHistory(reviews: Pick<RollupReview, "source" | "publishedAt" | "stars">[], now: Date): SourceHistory[] {
  if (!reviews.length) return [];
  const quarterIndex = (d: Date) => d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);
  const first = Math.min(...reviews.map((r) => quarterIndex(r.publishedAt)));
  const last = Math.max(quarterIndex(now), ...reviews.map((r) => quarterIndex(r.publishedAt)));
  const bySource = new Map<string, Map<number, { volume: number; ratings: number; starsTotal: number }>>();
  for (const r of reviews) {
    let quarters = bySource.get(r.source);
    if (!quarters) {
      quarters = new Map();
      bySource.set(r.source, quarters);
    }
    const index = quarterIndex(r.publishedAt);
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
        quarter: `${Math.floor(index / 4)}-Q${index % 4 + 1}`,
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
export function applyReviewWindow(reviews: RollupReview[], now: Date, changePointAt: Date | null): RollupReview[] {
  const maxAge = new Date(now.getTime() - PARAMS.reviewWindowMaxAgeMonths * MONTH_MS);
  const cutoff = changePointAt && changePointAt > maxAge ? changePointAt : maxAge;

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
  const textIn12m = text.filter((r) => ageMonths(now, r.publishedAt) <= 12).length;
  const redFlags = redFlagGroups(input, textIn12m);
  const forced = redFlags.some((g) => g.forcesAvoid);

  const base = tierFrom(stats);
  const tier: Tier = forced ? "avoid" : base.tier;

  // Confidence: bootstrap over Reviews, then the caps. Provisional always ends Low.
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
  const perSourceBands = sources.map((s) => ({ s, band: tierFrom(inputStats(reviews.filter((r) => r.source === s), now, format)).tier }));
  if (new Set(perSourceBands.map((x) => x.band)).size > 1) {
    caps.push(`Sources disagree (${perSourceBands.map((x) => `${x.s}: ${x.band}`).join(", ")})`);
    level = Math.max(0, level - 1);
  }
  const textOnly = stats.filter((s) => s.counted && s.input !== "overall");
  const textW = textOnly.reduce((s, x) => s + x.weight, 0);
  const textComposite = textW ? textOnly.reduce((s, x) => s + x.weight * x.theta, 0) / textW : 0;
  const starsBand = band(theta(stats, "overall"));
  if (band(textComposite) !== starsBand) {
    caps.push(`text and stars disagree (text: ${band(textComposite)}, stars: ${starsBand})`);
    level = Math.max(0, level - 1);
  }
  caps.push("provisional: judged against default cut-offs, not Peers");
  level = 0;

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
  const series = [...byQ.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarter, rs]) => ({
      quarter,
      composite: rs.some((r) => r.aspects) ? compositeOf(inputStats(rs, now, format, false)) : null,
      volume: rs.length,
      textVolume: rs.filter((r) => r.hasText).length,
    }));

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

  const state = missed.length && !forced ? "not_enough_evidence" : "verdict";
  if (state === "not_enough_evidence" && input.changePointAt) {
    const withoutChange = evidenceBars(applyReviewWindow(input.reviews, now, null), now);
    if (withoutChange.missed.length === 0) {
      const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(input.changePointAt);
      const event = input.changePointDescription?.trim() || "Change point";
      notEnoughEvidence.reasonLine = `${event} on ${date}; ${notEnoughEvidence.textReviews} Reviews since`;
    }
  }
  const result: Rollup = {
    ruleVersion: RULE_VERSION,
    provisional: true,
    state,
    tier: state === "verdict" ? tier : null,
    composite,
    inputs: stats,
    contributions: stats
      .filter((s) => s.counted)
      .map((s) => ({ input: s.input, value: s.weight * s.theta }))
      .sort((a, b) => b.value - a.value),
    floorCap: forced ? null : base.floorCap,
    notEnoughEvidence,
    redFlags,
    confidence: { level: levels[level]!, bootstrapShare: share, caps },
    consistencySpread: { sd, n: stancePoints.length, windowMonths: PARAMS.reviewWindowMaxAgeMonths },
    counts: { reviews: reviews.length, textReviews: text.length, ratingOnly: reviews.length - text.length, analysed: analysed.length, perSource },
    themes,
    themeBase: { analysed: themeBase.length, windowMonths: themeWindow },
    series,
    sourceHistory: quarterlySourceHistory(input.reviews, now),
  };
  return judgeWithSnapshot(result, input.peerSnapshot, input.city, format);
}
