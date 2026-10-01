// Trend (issue #113): the direction of a Restaurant's standing among its Peers over the last 12 months.
// A pure function over the Rollup's quarterly composite standing series; never feeds the Tier.
import type { Rollup } from "./rollup";

export type Trend = "improving" | "steady" | "slipping";
export type TrendPoint = Pick<Rollup["series"][number], "quarter" | "textVolume"> & { compositePercentile?: number | null };

const QUARTERS_PER_YEAR = 4;

export const TREND_PARAMS = {
  /** Quarters back from the current one that the year reaches: the current quarter and the four before it. */
  lookbackQuarters: 4,
  /** Quarters with a standing needed inside the window to draw a line at all. */
  minPoints: 3,
  /** Slope, in Peer-percentile points per year, at or beyond which the standing counts as moving. Set from the measured spread of slopes across the 341 Restaurants (sd 38, quartiles -21 / +25): about a quarter each way. */
  slopeCut: 25,
} as const;

const quarterIndex = (quarter: string): number | null => {
  const m = /^(\d{4})-Q([1-4])$/.exec(quarter);
  return m ? Number(m[1]) * QUARTERS_PER_YEAR + Number(m[2]) - 1 : null;
};

/**
 * Text-volume-weighted least-squares slope of the composite standing over the last year's quarters,
 * in percentile points per year. Null when the standing cannot be read as a year-long line: the
 * series starts less than a year of quarters back (quarter-granular: the first quarter must be the current one minus `lookbackQuarters` or earlier), or fewer than `minPoints` quarters have a standing in the window.
 */
export function trendSlope(series: TrendPoint[], now: Date): number | null {
  const current = now.getUTCFullYear() * QUARTERS_PER_YEAR + Math.floor(now.getUTCMonth() / 3);
  const windowStart = current - TREND_PARAMS.lookbackQuarters;
  const indexed = series.flatMap((q) => {
    const index = quarterIndex(q.quarter);
    return index === null ? [] : [{ index, percentile: q.compositePercentile ?? null, weight: Math.max(1, q.textVolume) }];
  });
  if (!indexed.length || Math.min(...indexed.map((q) => q.index)) > windowStart) return null;
  const points = indexed.filter((q): q is typeof q & { percentile: number } => q.percentile !== null && q.index >= windowStart && q.index <= current);
  if (points.length < TREND_PARAMS.minPoints) return null;
  const total = points.reduce((s, p) => s + p.weight, 0);
  const meanX = points.reduce((s, p) => s + p.weight * p.index, 0) / total;
  const meanY = points.reduce((s, p) => s + p.weight * p.percentile, 0) / total;
  const sxx = points.reduce((s, p) => s + p.weight * (p.index - meanX) ** 2, 0);
  if (sxx === 0) return null;
  const sxy = points.reduce((s, p) => s + p.weight * (p.index - meanX) * (p.percentile - meanY), 0);
  return (sxy / sxx) * QUARTERS_PER_YEAR;
}

/** Improving, Steady or Slipping; null (not shown) at Low Confidence or without a year of readable history. */
export function trendOf(series: TrendPoint[], confidence: Rollup["confidence"]["level"] | null | undefined, now: Date): Trend | null {
  if (confidence !== "medium" && confidence !== "high") return null;
  const slope = trendSlope(series, now);
  if (slope === null) return null;
  if (slope >= TREND_PARAMS.slopeCut) return "improving";
  if (slope <= -TREND_PARAMS.slopeCut) return "slipping";
  return "steady";
}
