import { depthFor, getTripadvisorSearch, type TripadvisorSearchItem } from "@/ingest/dataforseo";
import type { TheForkSearchItem } from "@/ingest/apify";
import { PARAMS } from "@/verdict/rollup";
import { nameSimilarity } from "../../search/input";

export type PreviewEvidence = { distanceMeters: number | null; phoneMatch: boolean | null; nameSimilarity: number };
export type PreviewListing = {
  source: "google" | "tripadvisor" | "thefork";
  url: string;
  placeRef: string;
  name: string;
  confidence: "confident" | "uncertain";
  autoAccept: boolean;
  reviewCount: number | null;
  evidence: PreviewEvidence;
};
export type LookupEstimate = { textReviews: number; costUsd: number; minutes: number };

export function googleMapsUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
}

export function tripadvisorUrl(urlPath: string): string {
  return `https://www.tripadvisor.com/${urlPath.replace(/^\/+/, "")}`;
}

/** The Google Listing is resolved by exact place ID, never searched, so it is always a confident match. */
export function proposeGoogleListing(name: string, placeId: string, reviewCount: number | null): PreviewListing {
  return {
    source: "google", url: googleMapsUrl(placeId), placeRef: placeId, name, confidence: "confident", autoAccept: true,
    reviewCount, evidence: { distanceMeters: 0, phoneMatch: null, nameSimilarity: 1 },
  };
}

// Tripadvisor Search has no phone or distance. A name alone cannot satisfy ADR-0005's
// auto-accept rule, so every plausible candidate remains an Owner question.
const MIN_PROPOSAL_NAME_SIMILARITY = 0.5;
const MAX_TRIPADVISOR_CANDIDATES = 3;

/** Keeps the plausible Tripadvisor matches so the owner can choose after the lookup completes. */
export function proposeTripadvisorListings(googleName: string, candidates: TripadvisorSearchItem[]): PreviewListing[] {
  const matches: { item: TripadvisorSearchItem; score: number }[] = [];
  for (const item of candidates) {
    if (!item.title || !item.url_path) continue;
    const score = nameSimilarity(googleName, item.title);
    if (score >= MIN_PROPOSAL_NAME_SIMILARITY && !matches.some((match) => match.item.url_path === item.url_path)) {
      matches.push({ item, score });
    }
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, MAX_TRIPADVISOR_CANDIDATES).map(({ item, score }) => ({
    source: "tripadvisor", url: tripadvisorUrl(item.url_path!), placeRef: item.url_path!, name: item.title!,
    confidence: "uncertain", autoAccept: false,
    reviewCount: item.reviews_count ?? item.rating?.votes_count ?? null,
    evidence: { distanceMeters: null, phoneMatch: null, nameSimilarity: score },
  }));
}

// TheFork exposes coordinates but no phone, so phone match stays unknown. ADR-0005 auto-accepts a
// near-identical name within ~100 m, but only when exactly one candidate qualifies: two such
// neighbours (a chain's twin branches) stay an Owner question.
const MAX_THEFORK_DISTANCE_METERS = 300;
const AUTO_ACCEPT_THEFORK_DISTANCE_METERS = 100;
const AUTO_ACCEPT_THEFORK_NAME_SIMILARITY = 0.9;
const MAX_THEFORK_CANDIDATES = 3;

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Keeps TheFork restaurants that are near the Restaurant and share a plausible name. */
export function proposeTheForkListings(
  restaurant: { name: string; lat: number | null; lng: number | null },
  candidates: TheForkSearchItem[],
): PreviewListing[] {
  const matches: { item: TheForkSearchItem; score: number; distance: number | null }[] = [];
  for (const item of candidates) {
    if (item.id == null || !item.name || !item.url) continue;
    const score = nameSimilarity(restaurant.name, item.name);
    const here = restaurant.lat != null && restaurant.lng != null && item.latitude != null && item.longitude != null
      ? distanceMeters({ lat: restaurant.lat, lng: restaurant.lng }, { lat: item.latitude, lng: item.longitude })
      : null;
    if (score < MIN_PROPOSAL_NAME_SIMILARITY || (here !== null && here > MAX_THEFORK_DISTANCE_METERS)) continue;
    if (matches.some((match) => String(match.item.id) === String(item.id))) continue;
    matches.push({ item, score, distance: here === null ? null : Math.round(here) });
  }
  const isConfident = (match: { score: number; distance: number | null }) =>
    match.distance !== null && match.distance <= AUTO_ACCEPT_THEFORK_DISTANCE_METERS && match.score >= AUTO_ACCEPT_THEFORK_NAME_SIMILARITY;
  const onlyConfident = matches.filter(isConfident).length === 1 ? matches.find(isConfident) : undefined;
  return matches.sort((a, b) => b.score - a.score).slice(0, MAX_THEFORK_CANDIDATES).map((match) => ({
    source: "thefork", url: match.item.url!, placeRef: String(match.item.id), name: match.item.name!,
    confidence: match === onlyConfident ? "confident" : "uncertain", autoAccept: match === onlyConfident,
    reviewCount: match.item.thefork_review_count ?? null,
    evidence: { distanceMeters: match.distance, phoneMatch: null, nameSimilarity: match.score },
  }));
}

// Not every counted review carries text, and fewer still fall inside the review window; this
// conservative yield is a placeholder guess until #49 gives us anything better pre-fetch.
const ASSUMED_TEXT_REVIEW_YIELD = 0.5;

/** How many of a vendor's counted reviews are likely to be usable text Reviews within the window. */
export function predictTextReviews(reviewCount: number | null): number {
  if (!reviewCount || reviewCount <= 0) return 0;
  return Math.min(PARAMS.reviewWindowCap, Math.round(reviewCount * ASSUMED_TEXT_REVIEW_YIELD));
}

/** Predicts Not enough evidence from Google's own review count alone, before any vendor money is spent. */
export function predictNotEnoughEvidence(googleReviewCount: number | null): boolean {
  return predictTextReviews(googleReviewCount) < PARAMS.minTextReviews;
}

// Calibrated from scripts/probe-listing.ts's measured depth-10 cost of ~$0.001.
const COST_PER_DEPTH_UNIT_USD = 0.0001;
const SECONDS_PER_DEPTH_UNIT = 3;

export function estimateLookup(listings: { reviewCount: number | null }[]): LookupEstimate {
  let textReviews = 0;
  let costUsd = 0;
  let seconds = 0;
  for (const listing of listings) {
    const predicted = predictTextReviews(listing.reviewCount);
    const depth = depthFor(predicted);
    textReviews += predicted;
    costUsd += depth * COST_PER_DEPTH_UNIT_USD;
    seconds += depth * SECONDS_PER_DEPTH_UNIT;
  }
  return { textReviews, costUsd: Math.round(costUsd * 100) / 100, minutes: Math.max(1, Math.round(seconds / 60)) };
}

export type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * DataForSEO's Tripadvisor Search is standard-queue only (no live/synchronous form), so the
 * preview polls a short, bounded number of times and gives up rather than blocking the request.
 */
export async function pollTripadvisorSearch(
  taskId: string,
  opts: { attempts?: number; intervalMs?: number; sleep?: Sleep } = {},
): Promise<{ items: TripadvisorSearchItem[]; cost: number }> {
  const attempts = opts.attempts ?? 4;
  const intervalMs = opts.intervalMs ?? 1500;
  const sleep = opts.sleep ?? realSleep;
  let cost = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await getTripadvisorSearch(taskId);
    if (result) return { items: result.items, cost: cost + result.cost };
    if (attempt < attempts) await sleep(intervalMs);
  }
  return { items: [], cost };
}
