// Apify: TheFork search (mscraper/thefork-restaurant-scraper, by coordinates) and Reviews
// (parsebird/thefork-scraper, by restaurant URL), both pay per event.
// Items may carry reviewer names; callers must whitelist them through normalise.ts in memory
// and never log or persist them. Every run is capped with maxTotalChargeUsd and reports its cost.
import { PipelineError } from "@/lib/pipeline-error";
import { PARAMS } from "@/verdict/rollup";

const BASE = "https://api.apify.com/v2";
const DEFAULT_REVIEWS_ACTOR = "parsebird/thefork-scraper";
/** Searches by latitude/longitude and returns the restaurants around that point. parsebird's actor lists a whole city by popularity. */
const SEARCH_ACTOR = "mscraper/thefork-restaurant-scraper";
const WAIT_FOR_FINISH_S = 60;
const MAX_WAIT_ATTEMPTS = 5;

/** Nearby search: one page of 25 restaurants at $0.01 each, no Reviews. */
export const APIFY_SEARCH_MAX_USD = 0.3;
/** One profile with its first 50 Reviews is about $0.003, each Review past 50 about $0.002. */
export const APIFY_REVIEWS_MAX_USD = 0.25;
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

type RunInfo = { id?: string; defaultDatasetId?: string; status?: string; usageTotalUsd?: number };

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
      cost = (settled?.data as { data?: RunInfo } | null)?.data?.usageTotalUsd ?? cost;
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
  return { items: dataset.data, costUsd: cost };
}

/** The restaurant id in a TheFork URL (`.../restaurant/<slug>-r<id>`): the id the Listing is stored under. */
function restaurantIdFromUrl(url: string): string | null {
  return /^https:\/\/www\.thefork\.com\/restaurant\/[^/?#]*-r(\d+)\/?(?:[?#].*)?$/.exec(url)?.[1] ?? null;
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

/** One TheFork restaurant with its newest Reviews. The raw item carries reviewer names: whitelist it at once. */
export async function fetchTheForkListing(url: string): Promise<{ item: unknown; costUsd: number }> {
  const { items, costUsd } = await runActor(process.env.APIFY_THEFORK_ACTOR ?? DEFAULT_REVIEWS_ACTOR, {
    startUrls: [url], language: "en", maxRestaurants: 1, maxReviews: APIFY_REVIEWS_PER_LISTING, maxPhotos: 0,
  }, APIFY_REVIEWS_MAX_USD);
  if (!items.length) throw new ApifyError("TheFork returned no restaurant for that Listing.", costUsd);
  return { item: items[0], costUsd };
}
