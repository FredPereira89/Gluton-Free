import { parseTheForkUrl } from "@/ingest/apify";
import { db } from "./db";
import { startListingFetch } from "./owner-question";
import { ApiError } from "./problem";

const UNIQUE_VIOLATION = "23505";

/**
 * The owner pastes the TheFork page of a Restaurant that has no TheFork Listing (matching missed it, or they
 * dismissed the proposals). The Listing is recorded as `pasted` and fetched like any accepted one; any open
 * TheFork question is settled, since the owner has answered it by hand.
 */
export async function addTheForkLink(slug: string, rawUrl: string): Promise<Response> {
  const link = parseTheForkUrl(rawUrl);
  if (!link) throw new ApiError(400, "invalid_request", "Paste a TheFork restaurant page, like https://www.thefork.com/restaurant/name-r123456");
  const sql = db();
  const [restaurant] = await sql`select id from restaurant where slug = ${slug}`;
  if (!restaurant) throw new ApiError(404, "not_found", "Restaurant not found");
  const restaurantId = Number(restaurant.id);
  const [lookup] = await sql`
    select id from job
    where restaurant_id = ${restaurantId} and kind = 'lookup' and status in ('queued', 'running')
    order by id desc limit 1`;
  if (lookup) throw new ApiError(409, "lookup_in_progress", "The initial Lookup is still running. Try again after it finishes.");

  let created: { listingId: number; fetchJobId: number };
  try {
    created = await sql.begin(async (tx) => {
      const [existing] = await tx`select id from listing where restaurant_id = ${restaurantId} and source_code = 'thefork'`;
      if (existing) throw new ApiError(409, "listing_exists", "This Restaurant already has a TheFork Listing");
      await tx`
        update owner_question set status = 'answered', settled_at = now()
        where restaurant_id = ${restaurantId} and source_code = 'thefork' and kind = 'listing_match' and status = 'open'`;
      const [listing] = await tx`
        insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
        values (${restaurantId}, 'thefork', ${link.placeRef}, ${link.url}, 'pasted')
        returning id`;
      const [job] = await tx`
        insert into job (kind, restaurant_id, status, step) values ('listing_fetch', ${restaurantId}, 'queued', 'Listings matched') returning id`;
      return { listingId: Number(listing!.id), fetchJobId: Number(job!.id) };
    });
  } catch (error) {
    // Another Restaurant already holds that TheFork page.
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw new ApiError(409, "listing_taken", "That TheFork page is already linked to another Restaurant");
    throw error;
  }
  return startListingFetch(restaurantId, created.listingId, created.fetchJobId);
}
