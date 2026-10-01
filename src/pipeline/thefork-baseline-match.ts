// Matches the baseline Restaurants against a swept TheFork catalogue with the same name-and-distance rule a
// Lookup uses (proposeTheForkListings), so no per-Restaurant search is paid for. Only one confident, unclaimed
// candidate is accepted; anything else stays unmatched and is reported.
import { proposeTheForkListings } from "@/app/api/v1/lookups/preview/preview";
import type { TheForkSearchItem } from "@/ingest/apify";
import { db } from "@/lib/db";

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

/** Baseline Restaurants that have coordinates and no TheFork Listing yet. */
export async function loadBaselineWithoutTheFork(): Promise<BaselineRestaurantRow[]> {
  const rows = await db()`
    select r.id, r.name, r.lat::float as lat, r.lng::float as lng from restaurant r
    where r.baseline_sampled and r.lat is not null and r.lng is not null
      and not exists (select 1 from listing l where l.restaurant_id = r.id and l.source_code = 'thefork')
    order by r.id`;
  return rows.map((row) => ({ id: Number(row.id), name: row.name as string, lat: row.lat as number, lng: row.lng as number }));
}

/** Records each accepted match as an auto-accepted, not yet fetched Listing. Returns how many were inserted. */
export async function storeTheForkListings(accepted: TheForkAcceptance[]): Promise<number> {
  const sql = db();
  let inserted = 0;
  for (const match of accepted) {
    const rows = await sql`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance, source_review_count)
      values (${match.restaurantId}, 'thefork', ${match.placeRef}, ${match.url}, 'auto_accepted', ${match.reviewCount})
      on conflict do nothing
      returning id`;
    inserted += rows.length;
  }
  return inserted;
}
