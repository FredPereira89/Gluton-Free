// Matches Restaurants against a crawled TheFork city with the same name-and-distance rule a Lookup uses
// (proposeTheForkListings), so no per-Restaurant search is paid for. Only one confident, unclaimed candidate is
// accepted; anything else stays unmatched and is reported. The crawl carries each page's newest Reviews, which are stored
// and judged here, so no per-Restaurant Review fetch is paid for either.
import { proposeTheForkListings } from "@/app/api/v1/lookups/preview/preview";
import { emptyUsage, JUDGE_MODEL } from "@/analysis/llm";
import { verifyPendingFlags } from "@/analysis/verify";
import type { TheForkCityRestaurant, TheForkSearchItem } from "@/ingest/apify";
import { normaliseTheFork } from "@/ingest/normalise";
import { storeListingFetch } from "@/ingest/store";
import { db } from "@/lib/db";
import { addLlmUsage, createJob, finishJob } from "@/lib/job";
import { toPipelineError } from "@/lib/pipeline-error";
import { issueVerdict } from "@/verdict/issue";
import { extractRestaurant, localSleep } from "./lookup";

export type BaselineRestaurantRow = { id: number; name: string; lat: number; lng: number };
export type TheForkAcceptance = { restaurantId: number; placeRef: string; url: string; reviewCount: number | null };
export type TheForkMatchReport = {
  accepted: TheForkAcceptance[];
  uncertain: number[];
  none: number[];
  sharedPage: number[];
};

const METERS_PER_DEGREE = 111_000;

/** Pure matching: one confident candidate per Restaurant, and no TheFork page claimed by two Restaurants. */
export function matchTheForkCatalogue(restaurants: BaselineRestaurantRow[], catalogue: TheForkSearchItem[]): TheForkMatchReport {
  const report: TheForkMatchReport = { accepted: [], uncertain: [], none: [], sharedPage: [] };
  const proposals: { restaurantId: number; placeRef: string; url: string; reviewCount: number | null }[] = [];
  for (const restaurant of restaurants) {
    // A degree box around the Restaurant keeps the similarity check to the few dozen TheFork pages nearby.
    const near = catalogue.filter((item) => item.latitude != null && item.longitude != null
      && Math.abs(item.latitude - restaurant.lat) * METERS_PER_DEGREE < 400
      && Math.abs(item.longitude - restaurant.lng) * METERS_PER_DEGREE * Math.cos(restaurant.lat * Math.PI / 180) < 400);
    const candidates = proposeTheForkListings(restaurant, near);
    if (!candidates.length) { report.none.push(restaurant.id); continue; }
    const confident = candidates.filter((candidate) => candidate.autoAccept);
    if (confident.length !== 1) { report.uncertain.push(restaurant.id); continue; }
    const [chosen] = confident;
    proposals.push({ restaurantId: restaurant.id, placeRef: chosen!.placeRef, url: chosen!.url, reviewCount: chosen!.reviewCount });
  }
  const claims = new Map<string, number>();
  for (const proposal of proposals) claims.set(proposal.placeRef, (claims.get(proposal.placeRef) ?? 0) + 1);
  for (const proposal of proposals) {
    if (claims.get(proposal.placeRef)! > 1) report.sharedPage.push(proposal.restaurantId);
    else report.accepted.push(proposal);
  }
  return report;
}

/** Restaurants that have coordinates, no TheFork Listing yet and no Job running (one would race the Reviews stored here). */
export async function loadRestaurantsWithoutTheFork(): Promise<BaselineRestaurantRow[]> {
  const rows = await db()`
    select r.id, r.name, r.lat::float as lat, r.lng::float as lng from restaurant r
    where r.lat is not null and r.lng is not null
      and not exists (select 1 from listing l where l.restaurant_id = r.id and l.source_code = 'thefork')
      and not exists (select 1 from job j where j.restaurant_id = r.id and j.status in ('queued', 'running'))
    order by r.id`;
  return rows.map((row) => ({ id: Number(row.id), name: row.name as string, lat: row.lat as number, lng: row.lng as number }));
}

/**
 * Records each accepted match as a fetched TheFork Listing with the Reviews the crawl carried: auto-accepted by the matching rule,
 * or `proposed_confirmed` when the owner approved an uncertain candidate.
 * Returns the Restaurants stored; a Restaurant that already has the Listing (a rerun) is skipped.
 */
export async function storeTheForkMatches(
  accepted: TheForkAcceptance[], crawled: TheForkCityRestaurant[], provenance: "auto_accepted" | "proposed_confirmed" = "auto_accepted",
): Promise<number[]> {
  const sql = db();
  const profiles = new Map(crawled.map((restaurant) => [String(restaurant.id), restaurant.profile]));
  const stored: number[] = [];
  for (const match of accepted) {
    const profile = profiles.get(match.placeRef);
    if (profile === undefined) continue;
    const rows = await sql`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance, source_review_count)
      values (${match.restaurantId}, 'thefork', ${match.placeRef}, ${match.url}, ${provenance}, ${match.reviewCount})
      on conflict do nothing
      returning id`;
    if (!rows[0]) continue;
    await storeListingFetch(Number(rows[0].id), normaliseTheFork(profile));
    stored.push(match.restaurantId);
  }
  return stored;
}

/**
 * Analyses a Restaurant's new Reviews and issues a Verdict that includes them. Unlike a Lookup it sends no push:
 * these Restaurants were already in the app. Returns what the Anthropic calls cost.
 */
export async function judgeWithTheFork(restaurantId: number): Promise<number> {
  const jobId = await createJob("rejudge", restaurantId);
  try {
    await extractRestaurant(restaurantId, jobId, localSleep);
    const verifyUsage = emptyUsage("verify-flags", JUDGE_MODEL, false);
    await verifyPendingFlags(restaurantId, verifyUsage);
    await addLlmUsage(jobId, verifyUsage);
    const explainUsage = emptyUsage("explain", JUDGE_MODEL, false);
    await issueVerdict(restaurantId, jobId, explainUsage, "automatic");
    await addLlmUsage(jobId, explainUsage);
    await finishJob(jobId);
  } catch (error) {
    await finishJob(jobId, toPipelineError(error));
    throw error;
  }
  const [job] = await db()`select coalesce(sum((u->>'cost_usd')::numeric), 0)::float as cost from job, jsonb_array_elements(llm_usage) u where job.id = ${jobId}`;
  return Number(job?.cost ?? 0);
}
