// The Verdict rule, provisional form ("Verdict rule: gates, weights, confidence", section 8):
// the ADR 0002 weights applied to absolute θ on the −2..+2 scale, because there are no Peers yet.
// Pure: no I/O, deterministic (the bootstrap uses a seeded generator).
import { INFORMATIVE_ONLY, INPUTS, INPUT_WEIGHTS, type Aspect, type FlagType, type Input, type Tier } from "@/domain/aspects";
import { THEMES, type ThemeCode } from "@/domain/themes";

export const RULE_VERSION = "provisional-v1";

export const PARAMS = {
  halfLifeMonths: 18,
  shrinkK: 10,
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
  spreadWindowMonths: 24,
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

export type RollupInput = { now: Date; format: string; reviews: RollupReview[]; flags: RollupFlag[] };

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

export type Rollup = {
  ruleVersion: string;
  provisional: true;
  state: "verdict" | "not_enough_evidence";
  tier: Tier | null;
  composite: number;
  inputs: InputStat[];
  contributions: { input: Input; value: number }[];
  floorCap: string | null;
  notEnoughEvidence: { textReviews: number; foodMentions: number; newestAgeMonths: number | null; missed: string[] };
  redFlags: RedFlagGroup[];
  confidence: { level: "low" | "medium" | "high"; bootstrapShare: number; caps: string[] };
  consistencySpread: { sd: number | null; n: number; windowMonths: number };
  counts: {
    reviews: number;
    textReviews: number;
    ratingOnly: number;
    analysed: number;
    perSource: Record<string, { reviews: number; text: number; newest: string | null }>;
  };
  themes: { code: ThemeCode; aspect: Aspect; polarity: 1 | -1; count: number; share: number }[];
  themeBase: { analysed: number; windowMonths: number };
  series: { quarter: string; composite: number | null; volume: number; textVolume: number }[];
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
    const forcesAvoid = reviewIds.size >= 2 && newest !== null && ageMonths(input.now, newest) <= 6 && share >= 0.01;
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

function quarterOf(d: Date): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

export function rollup(input: RollupInput): Rollup {
  const { now, format, reviews } = input;
  const stats = inputStats(reviews, now, format);
  const composite = compositeOf(stats);
  const text = reviews.filter((r) => r.hasText);
  const analysed = text.filter((r) => r.aspects);

  // Not enough evidence.
  const foodMentions = analysed.filter((r) => r.aspects!.food !== null).length;
  const newest = reviews.reduce<Date | null>((m, r) => (!m || r.publishedAt > m ? r.publishedAt : m), null);
  const newestAge = newest ? ageMonths(now, newest) : null;
  const missed: string[] = [];
  if (text.length < PARAMS.minTextReviews) missed.push(`fewer than ${PARAMS.minTextReviews} Reviews with text`);
  if (foodMentions < PARAMS.minFoodMentions) missed.push(`food mentioned in fewer than ${PARAMS.minFoodMentions} Reviews`);
  if (newestAge === null || newestAge > PARAMS.maxNewestAgeMonths) missed.push(`newest Review older than ${PARAMS.maxNewestAgeMonths} months`);

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

  // Consistency spread (information only while provisional): recency-weighted SD of stars − 3.
  const inWindow = reviews.filter((r) => r.stars !== null && ageMonths(now, r.publishedAt) <= PARAMS.spreadWindowMonths);
  let sd: number | null = null;
  if (inWindow.length >= 2) {
    const ws = inWindow.map((r) => [recency(ageMonths(now, r.publishedAt)), r.stars! - 3] as const);
    const sw = ws.reduce((s, [w]) => s + w, 0);
    const mean = ws.reduce((s, [w, x]) => s + w * x, 0) / sw;
    sd = Math.sqrt(ws.reduce((s, [w, x]) => s + w * (x - mean) ** 2, 0) / sw);
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
    perSource[s] = { reviews: rs.length, text: rs.filter((r) => r.hasText).length, newest: nw?.toISOString() ?? null };
  }

  const state = missed.length && !forced ? "not_enough_evidence" : "verdict";
  return {
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
    notEnoughEvidence: { textReviews: text.length, foodMentions, newestAgeMonths: newestAge, missed },
    redFlags,
    confidence: { level: levels[level]!, bootstrapShare: share, caps },
    consistencySpread: { sd, n: inWindow.length, windowMonths: PARAMS.spreadWindowMonths },
    counts: { reviews: reviews.length, textReviews: text.length, ratingOnly: reviews.length - text.length, analysed: analysed.length, perSource },
    themes,
    themeBase: { analysed: themeBase.length, windowMonths: themeWindow },
    series,
  };
}
