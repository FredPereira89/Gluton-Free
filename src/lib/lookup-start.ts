import { tasks } from "@trigger.dev/sdk";
import { googleBusinessByReference } from "@/ingest/dataforseo";
import { estimateLookup, googleMapsUrl } from "@/app/api/v1/lookups/preview/preview";
import { LISBON } from "@/app/api/v1/search/route";
import type { z } from "zod";
import { startLookupBodySchema } from "./api-contract";
import { db } from "./db";
import { raiseListingQuestions } from "./owner-question";
import { ApiError } from "./problem";
import { recordSearchCost, spendCapStatus } from "./spend-cap";

type Input = z.infer<typeof startLookupBodySchema>;
type Started = { jobId: number; restaurantSlug: string; created: boolean };

function slugPart(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 75) || "restaurant";
}

async function existing(placeId: string): Promise<Started | null> {
  const [row] = await db()`
    select r.slug, j.id from listing l join restaurant r on r.id = l.restaurant_id
    left join lateral (select id from job where restaurant_id = r.id and kind = 'lookup' order by id desc limit 1) j on true
    where l.source_code = 'google' and l.place_ref = ${placeId}`;
  return row?.id ? { jobId: Number(row.id), restaurantSlug: row.slug as string, created: false } : null;
}

export async function startLookup(input: Input): Promise<Started> {
  const known = await existing(input.googlePlaceId);
  if (known) return known;
  const cap = await spendCapStatus();
  if (cap.atCap) throw new ApiError(429, "spend_cap_reached", "Daily vendor spend cap reached", { resetAt: cap.resetAt });

  const resolved = await googleBusinessByReference(`place_id:${input.googlePlaceId}`, LISBON);
  const business = resolved.item;
  if (!business?.place_id || !business.title) {
    await recordSearchCost(resolved.cost);
    throw new ApiError(404, "not_found", "No Restaurant found for that Google Listing");
  }
  const name = business.title;
  const city = business.address_info?.city || "Lisbon";
  const area = business.address_info?.district || null;
  const base = slugPart(name);
  const estimateMinutes = estimateLookup([{ reviewCount: business.rating?.votes_count ?? null }]).minutes;
  const googleUrl = googleMapsUrl(input.googlePlaceId);
  // Tripadvisor Search has no phone or distance evidence. Carry its suggestion forward for
  // the Owner-question flow (#50); only the exact Google place ID is auto accepted here.
  const askLater = input.listings.filter((listing) => listing.source === "tripadvisor");

  const result = await db().begin(async (sql) => {
    await sql`select pg_advisory_xact_lock(hashtext(${input.googlePlaceId}))`;
    await sql`select pg_advisory_xact_lock(hashtext(${`slug:${base}`}))`;
    const [found] = await sql`
      select r.id as restaurant_id, r.slug, j.id from listing l join restaurant r on r.id = l.restaurant_id
      left join lateral (select id from job where restaurant_id = r.id and kind = 'lookup' order by id desc limit 1) j on true
      where l.source_code = 'google' and l.place_ref = ${input.googlePlaceId}`;
    if (found?.id) return { jobId: Number(found.id), restaurantSlug: found.slug as string, created: false };
    if (found) {
      const [job] = await sql`
        insert into job (kind, restaurant_id, status, step, progress, vendor_cost_usd)
        values ('lookup', ${found.restaurant_id}, 'queued', 'Listings matched', ${sql.json({ estimateMinutes, askLater } as never)}, ${resolved.cost}) returning id`;
      await raiseListingQuestions(sql, Number(found.restaurant_id), askLater);
      return { jobId: Number(job!.id), restaurantSlug: found.slug as string, created: true, restaurantId: Number(found.restaurant_id) };
    }
    let slug = base;
    if ((await sql`select 1 from restaurant where slug = ${slug}`).length) slug = `${base}-${slugPart(area || city)}`;
    for (let suffix = 2; (await sql`select 1 from restaurant where slug = ${slug}`).length; suffix++) {
      slug = `${base}-${slugPart(area || city)}-${suffix}`;
    }
    const [restaurant] = await sql`
      insert into restaurant (slug, name, city, area, address, lat, lng, format, format_provenance)
      values (${slug}, ${name}, ${city}, ${area}, ${business.address ?? null}, ${business.latitude ?? null}, ${business.longitude ?? null}, 'casual_contemporary', 'baseline_auto') returning id`;
    const restaurantId = Number(restaurant!.id);
    await sql`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance, source_rating, source_review_count, price_level, categories)
      values (${restaurantId}, 'google', ${input.googlePlaceId}, ${googleUrl}, 'auto_accepted', ${business.rating?.value ?? null}, ${business.rating?.votes_count ?? null}, ${business.price_level ?? null}, ${[business.category, ...(business.category_ids ?? [])].filter((category): category is string => !!category)})`;
    const [job] = await sql`
      insert into job (kind, restaurant_id, status, step, progress, vendor_cost_usd)
      values ('lookup', ${restaurantId}, 'queued', 'Listings matched', ${sql.json({ estimateMinutes, askLater } as never)}, ${resolved.cost}) returning id`;
    await raiseListingQuestions(sql, restaurantId, askLater);
    return { jobId: Number(job!.id), restaurantSlug: slug, created: true, restaurantId };
  });

  if (!result.created) {
    // A concurrent POST may already have resolved the same Google Listing; this vendor call
    // still incurred a search cost even though it did not create another Job.
    await recordSearchCost(resolved.cost);
    return result;
  }
  try {
    const handle = await tasks.trigger("restaurant-lookup", { restaurantId: result.restaurantId, jobId: result.jobId }, {
      idempotencyKey: `lookup-${result.jobId}`,
    });
    await db()`update job set trigger_run_id = ${handle.id}, updated_at = now() where id = ${result.jobId}`;
  } catch (error) {
    await db()`update job set status = 'failed', error = 'Could not start lookup', finished_at = now(), updated_at = now() where id = ${result.jobId}`;
    throw error;
  }
  return result;
}
