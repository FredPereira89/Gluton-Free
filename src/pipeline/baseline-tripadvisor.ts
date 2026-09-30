import { nameSimilarity, normaliseName } from "@/app/api/v1/search/input";
import type { TripadvisorSearchItem } from "@/ingest/dataforseo";
import type { Normalised, NormalisedReview } from "@/ingest/normalise";
import type { BaselineBuiltCandidate } from "./baseline-build";
import { initialBaselineReviewDepth, nextBaselineReviewDepth, selectBaselineReviewWindow } from "./baseline-build";
import { BASELINE_REVIEW_WINDOW_CAP } from "./baseline-window";
import { BaselineSpendBudget } from "./baseline-budget";

const SEARCH_MAX_USD = 0.0015; // 30 standard results plus the en language charge
const REVIEW_USD_PER_TEN = 0.00075; // Tripadvisor standard queue, without translation or language filter
const MAX_SEARCH_CANDIDATES = 3;

type Evidence = { placeRef: string; nameSimilarity: number; addressMatch: boolean; phoneMatch: boolean | null; distanceMeters: number | null };
export type BaselineTripadvisorSkip = {
  googlePlaceId: string;
  reason: "no_candidate" | "uncertain" | "shared_listing" | "search_failed" | "review_failed" | "no_recent_text" | "extraction_failed";
  candidates: Evidence[];
};
export type BaselineTripadvisorMatch = {
  googlePlaceId: string;
  placeRef: string;
  url: string;
  normalised: Normalised;
  window: NormalisedReview[];
  windowStart: Date;
  evidence: Evidence;
};
export type BaselineTripadvisorProviders = {
  search: (name: string) => Promise<{ items: TripadvisorSearchItem[]; costUsd: number }>;
  fetch: (path: string, depth: number) => Promise<{ normalised: Normalised; returnedCount: number; costUsd: number }>;
};
export type BaselineTripadvisorReport = { matches: BaselineTripadvisorMatch[]; skipped: BaselineTripadvisorSkip[]; costsUsd: { dataforseo: number; llm: number } };

function street(address: string | null): string | null {
  const first = normaliseName(address?.split(",")[0] ?? "");
  // A street without a house number cannot disambiguate adjacent businesses.
  return /\d/.test(first) ? first : null;
}

function phone(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 9 ? digits.slice(-9) : null;
}

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(h)));
}

async function allSettledOrThrow<T>(operations: Promise<T>[]): Promise<T[]> {
  const outcomes = await Promise.allSettled(operations);
  const failed = outcomes.find((outcome) => outcome.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return outcomes.map((outcome) => {
    if (outcome.status === "rejected") throw outcome.reason;
    return outcome.value;
  });
}

async function charged<T extends { costUsd: number }>(
  spend: BaselineSpendBudget, maximumUsd: number, operation: () => Promise<T>, onCost?: (usd: number) => void | Promise<void>,
): Promise<T> {
  const settle = await spend.reserve("dataforseo")(maximumUsd);
  let operated = false;
  try {
    const result = await operation();
    operated = true;
    await settle(result.costUsd);
    await onCost?.(result.costUsd);
    return result;
  } catch (error) {
    // A posted task may have been billed even when polling fails.
    if (!operated) {
      await settle(maximumUsd);
      await onCost?.(maximumUsd);
    }
    throw error;
  }
}

/** Only the Google sample that survived Review extraction enters this paid matching stage. */
export async function runBaselineTripadvisor(
  sampled: BaselineBuiltCandidate[], providers: BaselineTripadvisorProviders,
  options: { now?: Date; spend: BaselineSpendBudget; onProgress?: (step: string) => void | Promise<void>; onCost?: (usd: number) => void | Promise<void> },
): Promise<BaselineTripadvisorReport> {
  const now = options.now ?? new Date();
  await options.onProgress?.(`Matching Tripadvisor Listings (${sampled.length} sampled Restaurants)`);

  // Live search results have no phone or coordinates. Probe plausible pages for their address;
  // accept only one confident page by phone, proximity, or exact numbered street and name.
  const outcomes = await allSettledOrThrow(sampled.map(async (built): Promise<
    { proposed: BaselineTripadvisorMatch; skipped?: never } | { proposed?: never; skipped: BaselineTripadvisorSkip }
  > => {
    const { candidate } = built;
    let found: Awaited<ReturnType<typeof providers.search>>;
    try {
      found = await charged(options.spend, SEARCH_MAX_USD, () => providers.search(candidate.name), options.onCost);
    } catch (error) {
      if (error instanceof Error && error.name === "BaselineSpendCapError") throw error;
      return { skipped: { googlePlaceId: candidate.placeId, reason: "search_failed", candidates: [] } };
    }
    const candidates = found.items.filter((item) => item.title && item.url_path)
      .map((item) => ({ item, similarity: nameSimilarity(candidate.name, item.title!),
        samePhone: Boolean(phone(candidate.phone) && phone(candidate.phone) === phone(item.phone)) }))
      .filter(({ similarity, samePhone }) => samePhone || similarity >= 0.5)
      .sort((a, b) => Number(b.samePhone) - Number(a.samePhone) || b.similarity - a.similarity)
      .slice(0, MAX_SEARCH_CANDIDATES);
    if (!candidates.length) {
      return { skipped: { googlePlaceId: candidate.placeId, reason: "no_candidate", candidates: [] } };
    }
    const evidence: Evidence[] = [];
    const probed = new Map<string, Normalised>();
    let failed = false;
    for (const { item, similarity } of candidates) {
      const path = item.url_path!;
      if (evidence.some((entry) => entry.placeRef === path)) continue;
      try {
        const result = await charged(options.spend, REVIEW_USD_PER_TEN, () => providers.fetch(path, 10), options.onCost);
        probed.set(path, result.normalised);
        const googlePhone = phone(candidate.phone);
        const otherPhone = phone(item.phone);
        const distance = item.latitude != null && item.longitude != null
          ? distanceMeters(candidate, { latitude: item.latitude, longitude: item.longitude }) : null;
        evidence.push({ placeRef: path, nameSimilarity: similarity,
          addressMatch: Boolean(street(candidate.address) && street(candidate.address) === street(result.normalised.facts.address)),
          phoneMatch: googlePhone && otherPhone ? googlePhone === otherPhone : null, distanceMeters: distance });
      } catch (error) {
        if (error instanceof Error && error.name === "BaselineSpendCapError") throw error;
        failed = true;
      }
    }
    const confident = evidence.filter((entry) => entry.phoneMatch === true
      || (entry.nameSimilarity >= 0.9 && (entry.addressMatch || (entry.distanceMeters !== null && entry.distanceMeters <= 100))));
    if (confident.length !== 1 || failed) {
      return { skipped: { googlePlaceId: candidate.placeId, reason: failed ? "review_failed" : "uncertain", candidates: evidence } };
    }
    const chosen = confident[0]!;
    const initial = probed.get(chosen.placeRef)!;
    return { proposed: { googlePlaceId: candidate.placeId, placeRef: chosen.placeRef,
      url: `https://www.tripadvisor.com/${chosen.placeRef.replace(/^\/+/, "")}`,
      normalised: initial, window: [], windowStart: now, evidence: chosen } };
  }));
  const skipped = outcomes.flatMap((outcome) => outcome.skipped ? [outcome.skipped] : []);
  const proposed = outcomes.flatMap((outcome) => outcome.proposed ? [outcome.proposed] : []);

  // A Tripadvisor page claimed by two sampled Restaurants is ambiguous even if both probes agree.
  const claims = new Map<string, number>();
  for (const match of proposed) claims.set(match.placeRef, (claims.get(match.placeRef) ?? 0) + 1);
  const completed = await allSettledOrThrow(proposed.map(async (match): Promise<
    { match: BaselineTripadvisorMatch; skip?: never } | { match?: never; skip: BaselineTripadvisorSkip }
  > => {
    if (claims.get(match.placeRef)! > 1) {
      return { skip: { googlePlaceId: match.googlePlaceId, reason: "shared_listing", candidates: [match.evidence] } };
    }
    const count = match.normalised.facts.reviewCount ?? 10;
    let normalised = match.normalised;
    try {
      let depth = initialBaselineReviewDepth(count);
      for (;;) {
        if (depth > 10) {
          const fetched = await charged(options.spend, Math.ceil(depth / 10) * REVIEW_USD_PER_TEN,
            () => providers.fetch(match.placeRef, depth), options.onCost);
          normalised = fetched.normalised;
          const window = selectBaselineReviewWindow(normalised.reviews, now);
          const oldest = normalised.reviews.at(-1)?.publishedAt;
          const cutoff = new Date(now);
          cutoff.setUTCFullYear(now.getUTCFullYear() - 2);
          if (window.reviews.filter((item) => item.text?.trim()).length >= BASELINE_REVIEW_WINDOW_CAP
            || fetched.returnedCount < depth || (normalised.facts.reviewCount ?? 0) <= depth
            || (oldest && oldest <= cutoff)) break;
        } else break;
        const next = nextBaselineReviewDepth(depth);
        if (!next) break;
        depth = next;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "BaselineSpendCapError") throw error;
      return { skip: { googlePlaceId: match.googlePlaceId, reason: "review_failed", candidates: [match.evidence] } };
    }
    const window = selectBaselineReviewWindow(normalised.reviews, now);
    if (!window.start || !window.reviews.some((item) => item.text?.trim())) {
      return { skip: { googlePlaceId: match.googlePlaceId, reason: "no_recent_text", candidates: [match.evidence] } };
    }
    return { match: { ...match, normalised, window: window.reviews, windowStart: window.start } };
  }));
  const matches = completed.flatMap((outcome) => outcome.match ? [outcome.match] : []);
  skipped.push(...completed.flatMap((outcome) => outcome.skip ? [outcome.skip] : []));
  return { matches, skipped, costsUsd: options.spend.totals() };
}
