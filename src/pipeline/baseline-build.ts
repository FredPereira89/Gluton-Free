import { FORMATS, type BaselineFormat } from "@/domain/baseline-format";
import type { NormalisedReview } from "@/ingest/normalise";
import type { ExtractInput, Extracted } from "@/analysis/extract";
import type { BaselineCandidate, BaselineReviewFetchResult } from "./baseline";
import { BASELINE_REVIEW_WINDOW_CAP } from "./baseline-window";
import { BASELINE_REVIEW_MAX_USD_PER_TEN } from "./baseline";
import { BaselineSpendBudget } from "./baseline-budget";
import type { LlmUsage } from "@/lib/job";

export const FROZEN_BASELINE_EXTRACTOR_VERSION = "claude-haiku-4-5|extract-v4|themes-v1";
export const BASELINE_OVERSAMPLE_PERCENT = 30;
export const BASELINE_REVIEW_WINDOW_MONTHS = 24;
export const BASELINE_REVIEW_FETCH_MAX_DEPTH = 4_490;

export const BASELINE_TARGETS: Partial<Record<BaselineFormat, number>> = {
  tasca: 25,
  restaurante_tradicional: 25,
  casual_contemporary: 25,
  international_casual: 25,
  cafe_pastelaria: 25,
  snack_street: 25,
  marisqueira_cervejaria: 15,
  churrasqueira: 15,
  fine_dining: 15,
  brunch_all_day_cafe: 15,
};

export type BaselineWindowReview = NormalisedReview & { text: string };
export type BaselineAnalysis = { sourceReviewId: string; analysis: Extracted };
export type BaselineBuiltCandidate = {
  candidate: BaselineCandidate & { formatProvenance: "llm" };
  reviews: NormalisedReview[];
  reviewWindow: BaselineWindowReview[];
  reviewWindowStart: Date;
  analyses: BaselineAnalysis[];
};

export type BaselineFormatInput = {
  candidate: BaselineCandidate;
  reviews: NormalisedReview[];
};

export type BaselineBuildProviders = {
  fetchReviews: (requests: { candidate: BaselineCandidate; depth: number }[]) => Promise<Map<string, BaselineReviewFetchResult>>;
  /** Must use the Anthropic Batch API; the run passes this operation only Reviews in the selected window. */
  extractBatch: (items: ExtractInput[], spend: BaselineSpendBudget, onUsage?: (usage: LlmUsage) => void | Promise<void>) => Promise<{ results: Map<number, Extracted>; costUsd: number }>;
  /** Confirms each Restaurant's Format from its Reviews and returns one fixed Format per place ID. */
  confirmFormats: (restaurants: BaselineFormatInput[], spend: BaselineSpendBudget, onUsage?: (usage: LlmUsage) => void | Promise<void>) => Promise<{ formats: Map<string, BaselineFormat>; costUsd: number }>;
};

export type BaselineBuildReport = {
  candidates: BaselineBuiltCandidate[];
  countsByFormat: Record<BaselineFormat, number>;
  targets: Partial<Record<BaselineFormat, number>>;
  shortByFormat: Partial<Record<BaselineFormat, number>>;
  initialSampleCounts: Partial<Record<BaselineFormat, number>>;
  fetchedDepthByPlaceId: Record<string, number>;
  incompleteReviewWindowPlaceIds: string[];
  skippedWithoutText: number;
  skippedExtraction: number;
  extractionAttempts: number;
  failedExtractions: number;
  costsUsd: { dataforseo: number; llm: number };
};

export type BaselineBuildOptions = {
  now?: Date;
  random?: () => number;
  extractorVersion: string;
  spend?: BaselineSpendBudget;
  onProgress?: (step: string) => void | Promise<void>;
  onDataForSeoCost?: (usd: number) => void | Promise<void>;
  onLlmCost?: (usd: number) => void | Promise<void>;
  onLlmUsage?: (usage: LlmUsage) => void | Promise<void>;
};

export class ExtractorFreezeMismatchError extends Error {
  constructor(actual: string) {
    super(`Baseline requires owner-approved frozen extractor ${FROZEN_BASELINE_EXTRACTOR_VERSION}; current extractor is ${actual}`);
    this.name = "ExtractorFreezeMismatchError";
  }
}

export function assertFrozenBaselineExtractorVersion(actual: string): void {
  if (actual !== FROZEN_BASELINE_EXTRACTOR_VERSION) throw new ExtractorFreezeMismatchError(actual);
}

function emptyCounts(): Record<BaselineFormat, number> {
  return Object.fromEntries(FORMATS.map((format) => [format, 0])) as Record<BaselineFormat, number>;
}

function shuffled<T>(values: T[], random: () => number): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function mostReviewedPlaceId(values: BaselineCandidate[]): string | undefined {
  return [...values].sort((a, b) => b.reviewCount - a.reviewCount || a.placeId.localeCompare(b.placeId))[0]?.placeId;
}

function eligibleForSampling(values: BaselineCandidate[], format: BaselineFormat, mostReviewed?: string): BaselineCandidate[] {
  // Issue #65 explicitly includes every eligible casa de fado, so that small Format is the
  // sole exception to excluding the most-reviewed candidate from the random sample.
  if (format === "casa_de_fado") return values;
  return values.filter((candidate) => candidate.placeId !== mostReviewed);
}

function sampleFormat(
  candidates: BaselineCandidate[],
  format: BaselineFormat,
  desired: number,
  random: () => number,
  excludedMostReviewed?: string,
): BaselineCandidate[] {
  const group = candidates.filter((candidate) => candidate.format === format);
  return shuffled(eligibleForSampling(group, format, excludedMostReviewed ?? mostReviewedPlaceId(group)), random).slice(0, Math.max(0, desired));
}

export function initialBaselineReviewDepth(reviewCount: number): number {
  const bounded = Math.min(BASELINE_REVIEW_WINDOW_CAP, Math.max(1, Math.floor(reviewCount)));
  return Math.max(10, Math.ceil(bounded / 10) * 10);
}

export function nextBaselineReviewDepth(depth: number): number | null {
  if (depth >= BASELINE_REVIEW_FETCH_MAX_DEPTH) return null;
  return Math.min(BASELINE_REVIEW_FETCH_MAX_DEPTH, Math.ceil(Math.max(depth + 10, depth * 2) / 10) * 10);
}

export function estimateBaselineReviewCost(depth: number): number {
  return Math.ceil(depth / 10) * BASELINE_REVIEW_MAX_USD_PER_TEN;
}

function subtractMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() - months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = (month % 12 + 12) % 12;
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate());
  return new Date(Date.UTC(targetYear, targetMonth, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
}

export function selectBaselineReviewWindow(reviews: NormalisedReview[], now: Date): {
  reviews: NormalisedReview[];
  start: Date | null;
} {
  const cutoff = subtractMonths(now, BASELINE_REVIEW_WINDOW_MONTHS);
  const textReviews = reviews
    .filter((review): review is BaselineWindowReview => Boolean(review.text?.trim()) && review.publishedAt <= now && review.publishedAt >= cutoff)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const includedText = textReviews.slice(0, BASELINE_REVIEW_WINDOW_CAP);
  const oldestIncluded = includedText.at(-1)?.publishedAt;
  if (!oldestIncluded) return { reviews: [], start: null };
  const start = oldestIncluded > cutoff ? oldestIncluded : cutoff;
  const includedTextIds = new Set(includedText.map((review) => review.sourceReviewId));
  const window = reviews
    .filter((review) => review.publishedAt >= start && review.publishedAt <= now
      && (includedTextIds.has(review.sourceReviewId) || !review.text?.trim()))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return { reviews: window as BaselineWindowReview[], start };
}

function chooseInitialSample(
  candidates: BaselineCandidate[],
  random: () => number,
  mostReviewedByFormat: Map<BaselineFormat, string | undefined>,
): BaselineCandidate[] {
  const selected: BaselineCandidate[] = [];
  for (const format of FORMATS) {
    const target = BASELINE_TARGETS[format];
    const desired = target === undefined ? candidates.filter((candidate) => candidate.format === format).length
      : Math.ceil(target * (100 + BASELINE_OVERSAMPLE_PERCENT) / 100);
    selected.push(...sampleFormat(candidates, format, desired, random, mostReviewedByFormat.get(format)));
  }
  return selected;
}

function countFormats(candidates: BaselineBuiltCandidate[]): Record<BaselineFormat, number> {
  const counts = emptyCounts();
  for (const built of candidates) counts[built.candidate.format]++;
  return counts;
}

function reviewWindowFetchState(
  candidate: BaselineCandidate,
  result: BaselineReviewFetchResult,
  depth: number,
  now: Date,
): { complete: boolean; limitedByVendorDepth: boolean } {
  if (result.unavailable) return { complete: true, limitedByVendorDepth: false };
  const cutoff = subtractMonths(now, BASELINE_REVIEW_WINDOW_MONTHS);
  const eligible = result.reviews.filter((review) => review.publishedAt <= now && review.publishedAt >= cutoff);
  const textCount = eligible.filter((review) => Boolean(review.text?.trim())).length;
  if (textCount >= BASELINE_REVIEW_WINDOW_CAP) return { complete: true, limitedByVendorDepth: false };
  const oldest = result.reviews.reduce<Date | null>((date, review) => !date || review.publishedAt < date ? review.publishedAt : date, null);
  if (oldest && oldest <= cutoff) return { complete: true, limitedByVendorDepth: false };
  if ((result.returnedCount ?? result.reviews.length) < depth) return { complete: true, limitedByVendorDepth: false };
  if ((result.reviewCount ?? candidate.reviewCount) <= depth) return { complete: true, limitedByVendorDepth: false };
  if (depth >= BASELINE_REVIEW_FETCH_MAX_DEPTH) return { complete: true, limitedByVendorDepth: true };
  return { complete: false, limitedByVendorDepth: false };
}

/** Samples each predicted Format, fetches only its newest review-window depth, then reclassifies from text. */
export async function runBaselineBuild(
  candidates: BaselineCandidate[],
  providers: BaselineBuildProviders,
  options: BaselineBuildOptions,
): Promise<BaselineBuildReport> {
  assertFrozenBaselineExtractorVersion(options.extractorVersion);
  const now = options.now ?? new Date();
  const random = options.random ?? Math.random;
  const spend = options.spend ?? new BaselineSpendBudget();
  const allPlaceIds = new Set<string>();
  const mostReviewedByFormat = new Map<BaselineFormat, string | undefined>();
  for (const format of FORMATS) mostReviewedByFormat.set(format, mostReviewedPlaceId(candidates.filter((candidate) => candidate.format === format)));
  for (const candidate of candidates) {
    if (allPlaceIds.has(candidate.placeId)) throw new Error(`Duplicate baseline place ID: ${candidate.placeId}`);
    allPlaceIds.add(candidate.placeId);
  }

  const selected = chooseInitialSample(candidates, random, mostReviewedByFormat);
  const initialSampleCounts: Partial<Record<BaselineFormat, number>> = {};
  for (const candidate of selected) initialSampleCounts[candidate.format] = (initialSampleCounts[candidate.format] ?? 0) + 1;
  const used = new Set<string>();
  const fetchedDepthByPlaceId: Record<string, number> = {};
  const incompleteReviewWindowPlaceIds = new Set<string>();
  let skippedWithoutText = 0;
  let skippedExtraction = 0;
  let extractionAttempts = 0;
  let failedExtractions = 0;
  const built: BaselineBuiltCandidate[] = [];

  async function processWave(wave: BaselineCandidate[]): Promise<void> {
    if (!wave.length) return;
    await options.onProgress?.(`Fetching newest Review windows (${wave.length} Restaurants)`);
    const fetched: { candidate: BaselineCandidate; reviews: NormalisedReview[]; reviewWindow: BaselineWindowReview[]; start: Date }[] = [];
    const requests = wave.map((candidate) => ({
      candidate,
      depth: initialBaselineReviewDepth(candidate.reviewCount),
    }));
    const resultsByPlaceId = new Map<string, BaselineReviewFetchResult>();
    let pending = requests;
    while (pending.length) {
      const reservations: { request: typeof pending[number]; maximumUsd: number; settle: (actualUsd: number) => Promise<void> }[] = [];
      try {
        for (const request of pending) {
          used.add(request.candidate.placeId);
          fetchedDepthByPlaceId[request.candidate.placeId] = request.depth;
          const maximumUsd = estimateBaselineReviewCost(request.depth);
          reservations.push({ request, maximumUsd, settle: await spend.reserve("dataforseo")(maximumUsd) });
        }
      } catch (error) {
        for (const reservation of reservations) await reservation.settle(0);
        throw error;
      }

      let batchResults: Map<string, BaselineReviewFetchResult>;
      try {
        batchResults = await providers.fetchReviews(pending);
      } catch (error) {
        // A batch may have been accepted before polling failed. Charge its full reserved maximum
        // to the guard so a retry cannot spend against an unknown vendor bill.
        for (const reservation of reservations) {
          await reservation.settle(reservation.maximumUsd);
          await options.onDataForSeoCost?.(reservation.maximumUsd);
        }
        throw error;
      }

      const reservationByPlaceId = new Map(reservations.map((reservation) => [reservation.request.candidate.placeId, reservation]));
      const next: typeof requests = [];
      for (const request of pending) {
        const { candidate, depth } = request;
        const result = batchResults.get(candidate.placeId) ?? { reviews: [], costUsd: 0, unavailable: true };
        const reservation = reservationByPlaceId.get(candidate.placeId)!;
        await reservation.settle(result.costUsd);
        await options.onDataForSeoCost?.(result.costUsd);
        resultsByPlaceId.set(candidate.placeId, result);
        const fetchState = reviewWindowFetchState(candidate, result, depth, now);
        if (fetchState.limitedByVendorDepth) incompleteReviewWindowPlaceIds.add(candidate.placeId);
        if (!fetchState.complete) {
          const nextDepth = nextBaselineReviewDepth(depth);
          if (nextDepth) next.push({ candidate, depth: nextDepth });
        }
      }
      pending = next;
    }

    for (const { candidate } of requests) {
      const result = resultsByPlaceId.get(candidate.placeId)!;
      const window = selectBaselineReviewWindow(result.reviews, now);
      if (!window.start || !window.reviews.some((review) => Boolean(review.text?.trim()))) {
        skippedWithoutText++;
        continue;
      }
      fetched.push({ candidate, reviews: window.reviews, reviewWindow: window.reviews as BaselineWindowReview[], start: window.start });
    }
    if (!fetched.length) return;

    const inputs: ExtractInput[] = [];
    const sourceReviewIdByTempId = new Map<number, string>();
    const candidateByTempId = new Map<number, string>();
    let tempId = 1;
    for (const entry of fetched) {
      for (const review of entry.reviewWindow) {
        if (!review.text?.trim()) continue;
        inputs.push({ id: tempId, text: review.text, stars: review.stars });
        sourceReviewIdByTempId.set(tempId, review.sourceReviewId);
        candidateByTempId.set(tempId, entry.candidate.placeId);
        tempId++;
      }
    }

    await options.onProgress?.(`Extracting ${inputs.length} Reviews with Anthropic Batch API`);
    const extraction = await providers.extractBatch(inputs, spend, options.onLlmUsage);
    if (extraction.costUsd) await options.onLlmCost?.(extraction.costUsd);
    const confirmations = await providers.confirmFormats(
      fetched.map(({ candidate, reviewWindow }) => ({ candidate, reviews: reviewWindow })),
      spend,
      options.onLlmUsage,
    );
    if (confirmations.costUsd) await options.onLlmCost?.(confirmations.costUsd);

    for (const entry of fetched) {
      const analyses = [...extraction.results.entries()].flatMap(([id, analysis]) => {
        if (candidateByTempId.get(id) !== entry.candidate.placeId) return [];
        const sourceReviewId = sourceReviewIdByTempId.get(id);
        return sourceReviewId ? [{ sourceReviewId, analysis }] : [];
      });
      const textReviewCount = entry.reviewWindow.filter((review) => Boolean(review.text?.trim())).length;
      extractionAttempts += textReviewCount;
      failedExtractions += Math.max(0, textReviewCount - analyses.length);

      const format = confirmations.formats.get(entry.candidate.placeId);
      if (!format || !FORMATS.includes(format)) continue;
      if (analyses.length !== textReviewCount) {
        skippedExtraction++;
        continue;
      }
      built.push({
        candidate: { ...entry.candidate, format, formatProvenance: "llm" },
        reviews: entry.reviews,
        reviewWindow: entry.reviewWindow,
        reviewWindowStart: entry.start,
        analyses,
      });
    }
  }

  await processWave(selected);
  for (;;) {
    const counts = countFormats(built);
    const topUps: BaselineCandidate[] = [];
    for (const format of FORMATS) {
      const target = BASELINE_TARGETS[format];
      if (target === undefined || counts[format] >= target) continue;
      const remaining = candidates.filter((candidate) => candidate.format === format && !used.has(candidate.placeId));
      const deficit = target - counts[format];
      const desired = Math.ceil(deficit * (100 + BASELINE_OVERSAMPLE_PERCENT) / 100);
      topUps.push(...sampleFormat(remaining, format, desired, random, mostReviewedByFormat.get(format)));
    }
    if (!topUps.length) break;
    await options.onProgress?.(`Topping up short Formats (${topUps.length} Restaurants)`);
    await processWave(topUps);
  }

  const countsByFormat = countFormats(built);
  const shortByFormat: Partial<Record<BaselineFormat, number>> = {};
  for (const [format, target] of Object.entries(BASELINE_TARGETS) as [BaselineFormat, number][]) {
    if (countsByFormat[format] < target) shortByFormat[format] = target - countsByFormat[format];
  }
  return {
    candidates: built,
    countsByFormat,
    targets: BASELINE_TARGETS,
    shortByFormat,
    initialSampleCounts,
    fetchedDepthByPlaceId,
    incompleteReviewWindowPlaceIds: [...incompleteReviewWindowPlaceIds],
    skippedWithoutText,
    skippedExtraction,
    extractionAttempts,
    failedExtractions,
    costsUsd: spend.totals(),
  };
}
