// Apify: TheFork search and Reviews via the parsebird/thefork-scraper actor (pay per event).
// Items may carry reviewer names; callers must whitelist them through normalise.ts in memory
// and never log or persist them. Every run is capped with maxTotalChargeUsd and reports its cost.
import { PipelineError } from "@/lib/pipeline-error";
import { PARAMS } from "@/verdict/rollup";

const BASE = "https://api.apify.com/v2";
const DEFAULT_ACTOR = "parsebird/thefork-scraper";
const WAIT_FOR_FINISH_S = 60;
const MAX_WAIT_ATTEMPTS = 5;

/** Nearby search: 30 profiles at about $0.003 each, no Reviews. */
export const APIFY_SEARCH_MAX_USD = 0.15;
/** One profile with its first 50 Reviews is about $0.003, each Review past 50 about $0.002. */
export const APIFY_REVIEWS_MAX_USD = 0.25;
export const APIFY_SEARCH_MAX_RESTAURANTS = 30;
export const APIFY_SEARCH_RADIUS_KM = 1;
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
async function runActor(input: Record<string, unknown>, maxTotalChargeUsd: number): Promise<{ items: unknown[]; costUsd: number }> {
  const actor = (process.env.APIFY_THEFORK_ACTOR ?? DEFAULT_ACTOR).replace("/", "~");
  const started = await apify(`/acts/${actor}/runs?maxTotalChargeUsd=${maxTotalChargeUsd}`, { body: input });
  let run = (started.data as { data?: RunInfo } | null)?.data;
  if (started.status >= 300 || !run?.id) throw new ApifyError(`Apify could not start the TheFork run (HTTP ${started.status}).`);
  let cost = run.usageTotalUsd ?? 0;
  for (let attempt = 0; !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status ?? ""); attempt++) {
    if (attempt >= MAX_WAIT_ATTEMPTS) {
      // Stop the run so it cannot keep billing after we gave up on it.
      await apify(`/actor-runs/${run.id}/abort`, { body: {} }).catch(() => undefined);
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

/** TheFork restaurants near an address or place name, without Reviews. */
export async function searchTheFork(location: string): Promise<{ items: TheForkSearchItem[]; costUsd: number }> {
  const { items, costUsd } = await runActor({
    searchLocation: location, searchRadiusKm: APIFY_SEARCH_RADIUS_KM, language: "en",
    maxRestaurants: APIFY_SEARCH_MAX_RESTAURANTS, maxReviews: 0, maxPhotos: 0,
  }, APIFY_SEARCH_MAX_USD);
  return { items: items as TheForkSearchItem[], costUsd };
}

/** One TheFork restaurant with its newest Reviews. The raw item carries reviewer names: whitelist it at once. */
export async function fetchTheForkListing(url: string): Promise<{ item: unknown; costUsd: number }> {
  const { items, costUsd } = await runActor({
    startUrls: [{ url }], language: "en", maxRestaurants: 1, maxReviews: APIFY_REVIEWS_PER_LISTING, maxPhotos: 0,
  }, APIFY_REVIEWS_MAX_USD);
  if (!items.length) throw new ApifyError("TheFork returned no restaurant for that Listing.", costUsd);
  return { item: items[0], costUsd };
}
