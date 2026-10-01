// Apify: TheFork search (mscraper/thefork-restaurant-scraper, by coordinates), whole-city catalogue (memo23), profile
// (parsebird/thefork-scraper) and Reviews (clearpath/thefork-restaurant-reviews), all pay per event.
// Items may carry reviewer names; callers must whitelist them through normalise.ts in memory
// and never log or persist them. Every run is capped with maxTotalChargeUsd and reports its cost.
import { PipelineError } from "@/lib/pipeline-error";
import { PARAMS } from "@/verdict/rollup";

const BASE = "https://api.apify.com/v2";
const DEFAULT_PROFILE_ACTOR = "parsebird/thefork-scraper";
/** Returns the whole Review history, one row per Review; parsebird's page only exposes about 20. */
const REVIEWS_ACTOR = "clearpath/thefork-restaurant-reviews";
/** Searches by latitude/longitude and returns the restaurants around that point. parsebird's actor lists a whole city by popularity. */
const SEARCH_ACTOR = "mscraper/thefork-restaurant-scraper";
const WAIT_FOR_FINISH_S = 60;
const MAX_WAIT_ATTEMPTS = 5;

/** Nearby search: one page of 25 restaurants at $0.01 each, no Reviews. */
export const APIFY_SEARCH_MAX_USD = 0.3;
/** One profile without Reviews is about $0.003. */
export const APIFY_PROFILE_MAX_USD = 0.1;
/** The newest 100 Reviews at about $0.003 each. */
export const APIFY_REVIEWS_MAX_USD = 0.5;
export const APIFY_SEARCH_MAX_RESTAURANTS = 25;
/** The newest Reviews to fetch for an accepted TheFork Listing: the Review window cap. */
export const APIFY_REVIEWS_PER_LISTING = PARAMS.reviewWindowCap;

export class ApifyError extends PipelineError {
  constructor(detail: string, readonly costUsd = 0, code = "vendor_error") {
    super(code, detail);
  }
}

export function apifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

function token(): string {
  const value = process.env.APIFY_TOKEN;
  if (!value) throw new ApifyError("Apify access is not configured.", 0, "apify_not_configured");
  return value;
}

export type TheForkSearchItem = {
  id?: string | number | null; name?: string | null; url?: string | null;
  latitude?: number | null; longitude?: number | null; thefork_review_count?: number | null;
};

/** The search actor's restaurant, as much of it as matching uses. */
type NearbyRestaurant = {
  name?: string | null; url?: string | null; geolocation?: { latitude?: number | null; longitude?: number | null } | null;
  reviewCount?: number | null;
};

type RunInfo = {
  id?: string; defaultDatasetId?: string; status?: string; usageTotalUsd?: number;
  chargedEventCounts?: Record<string, number>;
  pricingInfo?: { pricingPerEvent?: { actorChargeEvents?: Record<string, { eventPriceUsd?: number; isOneTimeEvent?: boolean; isPrimaryEvent?: boolean }> } };
};

const START_EVENT = "apify-actor-start";
const DATASET_ITEM_EVENT = "apify-default-dataset-item";

/**
 * What Apify charged, at least. Its totals and event counters lag the run by seconds, so the reported total
 * is raised to the events counted at list price, and to the start fee plus what every returned item costs.
 * An item costs its actor's main event (`isPrimaryEvent`, else the dearest one) plus the dataset-item event when that
 * is a separate charge: the Reviews actor bills $0.00299 per review on top of $0.00001 per result, the search actor $0.01 per restaurant.
 */
function runCost(info: RunInfo | undefined, items = 0): number {
  if (!info) return 0;
  const events = Object.entries(info.pricingInfo?.pricingPerEvent?.actorChargeEvents ?? {});
  const counts = info.chargedEventCounts ?? {};
  const price = (event: { eventPriceUsd?: number }) => event.eventPriceUsd ?? 0;
  const counted = events.reduce((sum, [name, event]) => sum + (counts[name] ?? 0) * price(event), 0);
  const isStart = ([name, event]: (typeof events)[number]) => name === START_EVENT || event.isOneTimeEvent === true;
  const startFees = events.filter(isStart).reduce((sum, [name, event]) => sum + Math.max(counts[name] ?? 0, 1) * price(event), 0);
  const perItem = events.filter((entry) => !isStart(entry));
  const main = perItem.find(([, event]) => event.isPrimaryEvent) ?? [...perItem].sort((a, b) => price(b[1]) - price(a[1]))[0];
  const dataset = perItem.find(([name]) => name === DATASET_ITEM_EVENT);
  const itemPrice = main ? price(main[1]) + (dataset && dataset !== main ? price(dataset[1]) : 0) : 0;
  const fromItems = itemPrice > 0 ? startFees + items * itemPrice : 0;
  return Math.max(info.usageTotalUsd ?? 0, counted, fromItems);
}

async function apify(path: string, init?: { body?: unknown }): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method: init?.body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

/** Runs the actor to completion under a spend cap and returns its dataset items plus what Apify charged. */
async function runActor(actorName: string, input: Record<string, unknown>, maxTotalChargeUsd: number): Promise<{ items: unknown[]; costUsd: number }> {
  const actor = actorName.replace("/", "~");
  const started = await apify(`/acts/${actor}/runs?maxTotalChargeUsd=${maxTotalChargeUsd}`, { body: input });
  let run = (started.data as { data?: RunInfo } | null)?.data;
  if (started.status >= 300 || !run?.id) throw new ApifyError(`Apify could not start the TheFork run (HTTP ${started.status}).`);
  let cost = run.usageTotalUsd ?? 0;
  for (let attempt = 0; !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status ?? ""); attempt++) {
    if (attempt >= MAX_WAIT_ATTEMPTS) {
      // Stop the run so it cannot keep billing after we gave up on it.
      await apify(`/actor-runs/${run.id}/abort`, { body: {} }).catch(() => undefined);
      // The last poll predates the abort: read the run again for what Apify finally charged.
      const settled = await apify(`/actor-runs/${run.id}`).catch(() => null);
      cost = Math.max(cost, runCost((settled?.data as { data?: RunInfo } | null)?.data));
      throw new ApifyError("The TheFork run did not finish in time.", cost);
    }
    const polled = await apify(`/actor-runs/${run.id}?waitForFinish=${WAIT_FOR_FINISH_S}`);
    const next = (polled.data as { data?: RunInfo } | null)?.data;
    if (polled.status >= 300 || !next) throw new ApifyError(`Apify run status failed (HTTP ${polled.status}).`, cost);
    run = next;
    cost = run.usageTotalUsd ?? cost;
  }
  if (run.status !== "SUCCEEDED" || !run.defaultDatasetId) throw new ApifyError(`The TheFork run ended as ${run.status}.`, cost);
  const dataset = await apify(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json`);
  if (dataset.status >= 300 || !Array.isArray(dataset.data)) throw new ApifyError(`Apify dataset read failed (HTTP ${dataset.status}).`, cost);
  // The status poll can report SUCCEEDED before Apify adds the per-result charges (only the start fee was in):
  // the run is read again now that its dataset is out, and every returned item counts at its price.
  const settled = await apify(`/actor-runs/${run.id}`).catch(() => null);
  cost = Math.max(cost, runCost((settled?.data as { data?: RunInfo } | null)?.data, dataset.data.length));
  return { items: dataset.data, costUsd: cost };
}

/** The restaurant id in a TheFork URL (`.../restaurant/<slug>-r<id>`): the id the Listing is stored under. */
function restaurantIdFromUrl(url: string): string | null {
  return /^https:\/\/www\.thefork\.com\/restaurant\/[^/?#]*-r(\d+)\/?(?:[?#].*)?$/.exec(url)?.[1] ?? null;
}

/** A TheFork restaurant page URL pasted by a person, reduced to the id it is stored under and its canonical form; null when it is not one. */
export function parseTheForkUrl(input: string): { placeRef: string; url: string } | null {
  const match = /^https:\/\/www\.thefork\.com\/restaurant\/([^/?#\s]*-r(\d+))\/?(?:[?#].*)?$/.exec(input.trim());
  return match ? { placeRef: match[2]!, url: `https://www.thefork.com/restaurant/${match[1]}` } : null;
}

/** TheFork restaurants around a point, without Reviews, in the shape matching uses. */
export async function searchTheFork(point: { lat: number; lng: number }): Promise<{ items: TheForkSearchItem[]; costUsd: number }> {
  const { items, costUsd } = await runActor(SEARCH_ACTOR, {
    latitude: point.lat, longitude: point.lng, maxResults: APIFY_SEARCH_MAX_RESTAURANTS, maxPages: 1,
    includeReviews: false, includeExtendedInfo: false,
  }, APIFY_SEARCH_MAX_USD);
  const found: TheForkSearchItem[] = [];
  for (const raw of items as NearbyRestaurant[]) {
    const id = raw.url ? restaurantIdFromUrl(raw.url) : null;
    if (!id || !raw.name) continue;
    found.push({
      id, name: raw.name, url: raw.url, latitude: raw.geolocation?.latitude ?? null, longitude: raw.geolocation?.longitude ?? null,
      thefork_review_count: raw.reviewCount ?? null,
    });
  }
  return { items: found, costUsd };
}

/** Lists a whole TheFork city or search page at about $0.002 per restaurant, with no Reviews. */
const CATALOGUE_ACTOR = "memo23/thefork-restaurant-scraper";
/** One city page lists up to about 2,100 restaurants. */
export const APIFY_CATALOGUE_MAX_ITEMS = 2100;

type CatalogueRow = {
  rowType?: string; restaurantId?: string | number | null; name?: string | null; restaurantUrl?: string | null;
  latitude?: number | null; longitude?: number | null; reviewsCount?: number | null;
};

/** The catalogue actor's restaurant rows in the shape matching uses; other row types and rows without a TheFork page are dropped. */
export function theForkCatalogueItems(rows: unknown[]): TheForkSearchItem[] {
  const found = new Map<string, TheForkSearchItem>();
  for (const row of rows as CatalogueRow[]) {
    const id = row.restaurantUrl ? restaurantIdFromUrl(row.restaurantUrl) : null;
    if ((row.rowType && row.rowType !== "restaurant") || !id || !row.name) continue;
    found.set(id, {
      id, name: row.name, url: row.restaurantUrl, latitude: row.latitude ?? null, longitude: row.longitude ?? null,
      thefork_review_count: row.reviewsCount ?? null,
    });
  }
  return [...found.values()];
}

/** Every restaurant on the given TheFork city, cuisine or neighbourhood pages, in one run under a spend cap. */
export async function sweepTheForkCatalogue(
  pageUrls: string[], options: { maxItems?: number; maxUsd: number },
): Promise<{ items: TheForkSearchItem[]; costUsd: number }> {
  const { items, costUsd } = await runActor(CATALOGUE_ACTOR, {
    startUrls: pageUrls.map((url) => ({ url })), maxItems: options.maxItems ?? APIFY_CATALOGUE_MAX_ITEMS,
    maxItemsPerSearch: options.maxItems ?? APIFY_CATALOGUE_MAX_ITEMS, scrapeDetails: false,
  }, options.maxUsd);
  return { items: theForkCatalogueItems(items), costUsd };
}

/** One row per Review from the Reviews actor. Reviewer fields are never read here. */
type ReviewRow = { review_id?: string | number | null; rating_value?: number | null; meal_date?: string | null; review_body?: string | null };

/**
 * One TheFork restaurant with its newest Reviews, from two runs in parallel: the profile actor gives the rating,
 * count, address and price but stops at about 20 Reviews; the Reviews actor pages through the whole history.
 * Raw items may carry reviewer names: only whitelisted fields leave this function.
 */
export async function fetchTheForkListing(url: string): Promise<{ item: unknown; costUsd: number }> {
  const [profile, rows] = await Promise.allSettled([
    runActor(process.env.APIFY_THEFORK_ACTOR ?? DEFAULT_PROFILE_ACTOR, {
      startUrls: [url], language: "en", maxRestaurants: 1, maxReviews: 0, maxPhotos: 0,
    }, APIFY_PROFILE_MAX_USD),
    runActor(REVIEWS_ACTOR, {
      restaurantUrl: url, reviewLanguage: "all", sortBy: "newest", maxReviews: APIFY_REVIEWS_PER_LISTING,
    }, APIFY_REVIEWS_MAX_USD),
  ]);
  const spent = [profile, rows].reduce((sum, run) => sum + (run.status === "fulfilled" ? run.value.costUsd : run.reason instanceof ApifyError ? run.reason.costUsd : 0), 0);
  if (profile.status === "rejected") throw new ApifyError(profile.reason instanceof Error ? profile.reason.message : "The TheFork run failed.", spent);
  if (rows.status === "rejected") throw new ApifyError(rows.reason instanceof Error ? rows.reason.message : "The TheFork run failed.", spent);
  if (!profile.value.items.length) throw new ApifyError("TheFork returned no restaurant for that Listing.", spent);
  const reviews = (rows.value.items as ReviewRow[]).map((row) => ({
    id: row.review_id, rating_value: row.rating_value, meal_date: row.meal_date, review_body: row.review_body,
  }));
  return { item: { ...(profile.value.items[0] as object), reviews }, costUsd: spent };
}
