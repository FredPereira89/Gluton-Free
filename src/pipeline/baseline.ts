import { FORMATS, baselineFormat, isFoodCategoryId, type BaselineFormat } from "@/domain/baseline-format";
import type { PriceTier } from "@/domain/restaurant-facts";
import { sourcePriceTier } from "@/domain/restaurant-facts";
import { depthFor, getReviewTask, postGoogleReviewTasks, postReviewTask } from "@/ingest/dataforseo";
import { normaliseGoogle } from "@/ingest/normalise";
import { mergeBusinessListings, type BusinessListing, type VendorCostCallback, type VendorCostReservation } from "@/ingest/dataforseo-business-listings";
import { searchLisbonBusinessListings } from "@/ingest/dataforseo-business-listings";
import { insideLisboaMunicipality } from "./lisboa-boundary";

export const BASELINE_MIN_GOOGLE_REVIEWS = 25;
export const BASELINE_REVIEW_SAMPLE_DEPTH = 10;
export const GOOGLE_REVIEWS_PRIORITY_USD_PER_10 = 0.0015;
export const BASELINE_REVIEW_MAX_USD_PER_TEN = 0.003;
const POLL_SECONDS = 30;
const MAX_WAIT_SECONDS = 3 * 60 * 60;
const MAX_POLL_FAILURES = 3;

export type BaselineCandidate = {
  placeId: string;
  name: string;
  url: string;
  address: string | null;
  area: string | null;
  latitude: number;
  longitude: number;
  rating: number | null;
  reviewCount: number;
  categories: string[];
  priceLevel: string | null;
  priceTier: PriceTier | null;
  format: BaselineFormat;
  formatProvenance: "baseline_auto" | "llm";
  newestReviewAt: Date;
};

export type BaselineReviewFetchResult = {
  reviews: ReturnType<typeof normaliseGoogle>["reviews"];
  costUsd: number;
  reviewCount?: number | null;
  returnedCount?: number;
  unavailable?: boolean;
};

export type BaselineDropReason = "not_food_category" | "missing_listing_data" | "outside_boundary" | "not_open" | "fewer_than_25_reviews" | "no_recent_google_review";
export type BaselineSweepCosts = {
  businessListingsBilledUsd: number;
  recencyChecksBilledUsd: number;
  estimatedFullGoogleReviewsUsd: number;
  estimatedTotalVendorUsd: number;
};

export type BaselineSweepReport = {
  candidates: BaselineCandidate[];
  countsByFormat: Record<BaselineFormat, number>;
  dropped: Record<BaselineDropReason, number>;
  costs: BaselineSweepCosts;
};

export type BaselineSearchResult = { items: BusinessListing[]; costUsd: number };
export type RecentReviewDates = { newestByPlaceId: Map<string, Date | null>; costUsd: number };
export type BaselineProviders = {
  searchListings: (onCost?: VendorCostCallback, reserveCost?: VendorCostReservation) => Promise<BaselineSearchResult>;
  recentReviews: (placeIds: string[], sleep?: (seconds: number) => Promise<void>, onCost?: VendorCostCallback, reserveCost?: VendorCostReservation) => Promise<RecentReviewDates>;
};

export type BaselineSweepOptions = {
  sleep?: (seconds: number) => Promise<void>;
  onVendorCost?: VendorCostCallback;
  reserveVendorCost?: VendorCostReservation;
  onProgress?: (step: string) => void | Promise<void>;
};

function roundUsd(value: number): number {
  return Math.round(value * 100_000) / 100_000;
}

function categoryValues(item: BusinessListing): string[] {
  return [...new Set([
    item.category ?? "",
    ...(item.category_ids ?? []),
    ...(item.additional_categories ?? []),
  ].filter(Boolean))];
}

function isFoodListing(item: BusinessListing): boolean {
  return categoryValues(item).some(isFoodCategoryId);
}

function currentStatus(item: BusinessListing): string | null {
  const value = item.work_hours?.current_status ?? item.work_time?.work_hours?.current_status;
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function validCoordinates(item: BusinessListing): item is BusinessListing & { latitude: number; longitude: number } {
  return typeof item.latitude === "number" && Number.isFinite(item.latitude) && item.latitude >= -90 && item.latitude <= 90
    && typeof item.longitude === "number" && Number.isFinite(item.longitude) && item.longitude >= -180 && item.longitude <= 180;
}

function subtractTwelveMonths(now: Date): Date {
  const year = now.getUTCFullYear() - 1;
  const month = now.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    year, month, Math.min(now.getUTCDate(), lastDay), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds(),
  ));
}

function deduplicate(items: BusinessListing[]): BusinessListing[] {
  const byPlaceId = new Map<string, BusinessListing>();
  for (const item of items) {
    if (!item.place_id) continue;
    const previous = byPlaceId.get(item.place_id);
    byPlaceId.set(item.place_id, previous ? mergeBusinessListings(previous, item) : item);
  }
  return [...byPlaceId.values()];
}

function emptyDropCounts(): Record<BaselineDropReason, number> {
  return {
    not_food_category: 0,
    missing_listing_data: 0,
    outside_boundary: 0,
    not_open: 0,
    fewer_than_25_reviews: 0,
    no_recent_google_review: 0,
  };
}

/** Applies the baseline gates, probes only plausible candidates, and returns costed, pre-Format candidates. */
export async function runBaselineSweep(
  providers: BaselineProviders,
  now = new Date(),
  options: BaselineSweepOptions = {},
): Promise<BaselineSweepReport> {
  await options.onProgress?.("Searching Google Business Listings");
  const found = options.reserveVendorCost
    ? await providers.searchListings(options.onVendorCost, options.reserveVendorCost)
    : await providers.searchListings(options.onVendorCost);
  const unique = deduplicate(found.items);
  const dropped = emptyDropCounts();
  const toProbe: BusinessListing[] = [];

  for (const item of unique) {
    if (!isFoodListing(item)) {
      dropped.not_food_category++;
      continue;
    }
    if (!item.place_id || !item.title?.trim() || !validCoordinates(item)) {
      dropped.missing_listing_data++;
      continue;
    }
    if (!insideLisboaMunicipality({ lat: item.latitude, lng: item.longitude })) {
      dropped.outside_boundary++;
      continue;
    }
    if (currentStatus(item) !== "open") {
      dropped.not_open++;
      continue;
    }
    const reviewCount = item.rating?.votes_count;
    if (typeof reviewCount !== "number" || !Number.isInteger(reviewCount) || reviewCount < BASELINE_MIN_GOOGLE_REVIEWS) {
      dropped.fewer_than_25_reviews++;
      continue;
    }
    toProbe.push(item);
  }

  await options.onProgress?.("Checking recent Google Reviews");
  const freshness = toProbe.length
    ? options.reserveVendorCost
      ? await providers.recentReviews(toProbe.map((item) => item.place_id!), options.sleep, options.onVendorCost, options.reserveVendorCost)
      : await providers.recentReviews(toProbe.map((item) => item.place_id!), options.sleep, options.onVendorCost)
    : { newestByPlaceId: new Map<string, Date | null>(), costUsd: 0 };
  const cutoff = subtractTwelveMonths(now);
  const countsByFormat = Object.fromEntries(FORMATS.map((format) => [format, 0])) as Record<BaselineFormat, number>;
  const candidates: BaselineCandidate[] = [];
  await options.onProgress?.("Classifying baseline candidates");

  for (const item of toProbe) {
    const newestReviewAt = freshness.newestByPlaceId.get(item.place_id!) ?? null;
    if (!newestReviewAt || newestReviewAt < cutoff || newestReviewAt > now) {
      dropped.no_recent_google_review++;
      continue;
    }

    const categories = categoryValues(item);
    const reviewCount = item.rating!.votes_count!;
    const priceTier = sourcePriceTier("google", item.price_level ?? null);
    const format = baselineFormat(categories, priceTier);
    const candidate: BaselineCandidate = {
      placeId: item.place_id!,
      name: item.title!.trim(),
      url: item.url || `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(item.place_id!)}`,
      address: item.address ?? null,
      area: item.address_info?.borough ?? item.address_info?.district ?? null,
      latitude: item.latitude!,
      longitude: item.longitude!,
      rating: item.rating?.value ?? null,
      reviewCount,
      categories,
      priceLevel: item.price_level ?? null,
      priceTier,
      format,
      formatProvenance: "baseline_auto",
      newestReviewAt,
    };
    candidates.push(candidate);
    countsByFormat[format] = (countsByFormat[format] ?? 0) + 1;
  }

  const estimatedFullGoogleReviewsUsd = candidates.reduce((total, candidate) => {
    const depth = depthFor(candidate.reviewCount);
    return total + depth / 10 * GOOGLE_REVIEWS_PRIORITY_USD_PER_10;
  }, 0);
  const businessListingsBilledUsd = roundUsd(Math.max(0, found.costUsd));
  const recencyChecksBilledUsd = roundUsd(Math.max(0, freshness.costUsd));
  const estimatedFullCost = roundUsd(estimatedFullGoogleReviewsUsd);
  return {
    candidates,
    countsByFormat,
    dropped,
    costs: {
      businessListingsBilledUsd,
      recencyChecksBilledUsd,
      estimatedFullGoogleReviewsUsd: estimatedFullCost,
      estimatedTotalVendorUsd: roundUsd(businessListingsBilledUsd + recencyChecksBilledUsd + estimatedFullCost),
    },
  };
}

function newestTimestamp(raw: unknown): Date | null {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { items?: unknown }).items)) return null;
  const dates = (raw as { items: { timestamp?: unknown }[] }).items.flatMap((item) => {
    if (typeof item?.timestamp !== "string") return [];
    const date = new Date(item.timestamp.replace(" +00:00", "Z").replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? [] : [date];
  });
  return dates.reduce<Date | null>((newest, date) => !newest || date > newest ? date : newest, null);
}

/** Uses only the newest ten Google Reviews; their text and reviewer fields remain in memory and are discarded. */
export async function recentGoogleReviewDates(
  placeIds: string[],
  sleep: (seconds: number) => Promise<void> = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1_000)),
  onCost?: VendorCostCallback,
  reserveCost?: VendorCostReservation,
): Promise<RecentReviewDates> {
  const posted = new Map<string, { taskId: string; failures: number; costUsd: number; settle?: (actualUsd: number) => Promise<void> }>();
  const newestByPlaceId = new Map<string, Date | null>();
  let costUsd = 0;
  for (const placeId of placeIds) {
    const settle = await reserveCost?.(BASELINE_REVIEW_MAX_USD_PER_TEN);
    try {
      const task = await postReviewTask({ source: "google", placeId, depth: BASELINE_REVIEW_SAMPLE_DEPTH, priority: 1 });
      costUsd += task.cost;
      await onCost?.(task.cost);
      posted.set(placeId, { taskId: task.taskId, failures: 0, costUsd: task.cost, settle });
    } catch (error) {
      await settle?.(0);
      throw error;
    }
  }

  try {
    for (let waited = 0; newestByPlaceId.size < posted.size; waited += POLL_SECONDS) {
      if (waited > MAX_WAIT_SECONDS) throw new Error("Google Reviews recency checks exceeded the three-hour limit");
      await sleep(POLL_SECONDS);
      for (const [placeId, task] of posted) {
        if (newestByPlaceId.has(placeId)) continue;
        let result: Awaited<ReturnType<typeof getReviewTask>>;
        try {
          result = await getReviewTask("google", task.taskId);
        } catch {
          task.failures++;
          if (task.failures >= MAX_POLL_FAILURES) throw new Error("DataForSEO could not return a Google Reviews recency check");
          continue;
        }
        if (!result) continue;
        costUsd += result.cost;
        task.costUsd += result.cost;
        await onCost?.(result.cost);
        const settle = task.settle;
        task.settle = undefined;
        await settle?.(task.costUsd);
        newestByPlaceId.set(placeId, newestTimestamp(result.result));
      }
    }
  } finally {
    for (const task of posted.values()) {
      if (!task.settle) continue;
      const settle = task.settle;
      task.settle = undefined;
      await settle(task.costUsd);
    }
  }
  return { newestByPlaceId, costUsd };
}

/** Fetches up to 100 sampled Restaurants together on DataForSEO's normal-priority queue. */
export async function fetchBaselineGoogleReviewWindows(
  requests: { candidate: BaselineCandidate; depth: number }[],
  sleep: (seconds: number) => Promise<void> = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1_000)),
): Promise<Map<string, BaselineReviewFetchResult>> {
  if (!requests.length) return new Map();

  const byPlaceId = new Map<string, BaselineReviewFetchResult>();
  type PendingReviewTask = { placeId: string; taskId: string; cost: number; failures: number };
  const pending = new Map<string, PendingReviewTask>();
  for (let start = 0; start < requests.length; start += 100) {
    const batch = requests.slice(start, start + 100);
    const posted = await postGoogleReviewTasks(batch.map(({ candidate, depth }) => ({ placeId: candidate.placeId, depth })), 1);
    for (const task of posted.posted) pending.set(task.placeId, { ...task, failures: 0 });
    for (const failure of posted.failed) byPlaceId.set(failure.placeId, { reviews: [], costUsd: failure.cost, unavailable: true });
  }

  for (let waited = 0; pending.size > 0; waited += POLL_SECONDS) {
    if (waited > MAX_WAIT_SECONDS) throw new Error("Google Reviews window fetch exceeded the three-hour limit");
    await sleep(POLL_SECONDS);
    const polled: { task: PendingReviewTask; result: Awaited<ReturnType<typeof getReviewTask>>; failed: boolean }[] = [];
    for (const start of Array.from({ length: Math.ceil(pending.size / 100) }, (_, index) => index * 100)) {
      const batch = [...pending.values()].slice(start, start + 100);
      polled.push(...await Promise.all(batch.map(async (task) => {
        try {
          return { task, result: await getReviewTask("google", task.taskId), failed: false };
        } catch {
          return { task, result: null, failed: true };
        }
      })));
    }
    for (const item of polled) {
      const { task, result } = item;
      if (item.failed) {
        task.failures++;
        if (task.failures >= MAX_POLL_FAILURES) throw new Error("DataForSEO could not return a Google Reviews window");
        continue;
      }
      if (!result) continue;
      const current = pending.get(task.placeId);
      if (!current) continue;
      const normalized = normaliseGoogle(result.result);
      const rawItems = result.result && typeof result.result === "object"
        ? (result.result as { items?: unknown }).items
        : null;
      byPlaceId.set(task.placeId, {
        reviews: normalized.reviews,
        costUsd: current.cost + result.cost,
        reviewCount: normalized.facts.reviewCount,
        returnedCount: Array.isArray(rawItems) ? rawItems.length : 0,
      });
      pending.delete(task.placeId);
    }
  }
  return byPlaceId;
}

export async function runLisbonBaselineSweep(now = new Date(), options: BaselineSweepOptions = {}): Promise<BaselineSweepReport> {
  const providers: BaselineProviders = {
    searchListings: (onCost, reserveCost) => searchLisbonBusinessListings(onCost, reserveCost),
    recentReviews: (placeIds, sleep, onCost, reserveCost) => recentGoogleReviewDates(placeIds, sleep, onCost, reserveCost),
  };
  return runBaselineSweep(providers, now, options);
}
