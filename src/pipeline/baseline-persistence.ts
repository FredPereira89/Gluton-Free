import type { BaselineCandidate } from "./baseline";
import { normalizeBaselineLabel } from "@/domain/baseline-format";
import { db } from "@/lib/db";

function slugPart(text: string): string {
  return normalizeBaselineLabel(text).replace(/_/g, "-").slice(0, 75) || "restaurant";
}

/** Persists only baseline candidates; existing Google Listings are left untouched. */
export async function persistBaselineCandidates(candidates: BaselineCandidate[]): Promise<number> {
  const sql = db();
  return sql.begin(async (tx) => {
    let inserted = 0;
    for (const candidate of candidates) {
      await tx`select pg_advisory_xact_lock(hashtext(${candidate.placeId}))`;
      const [existing] = await tx`select id from listing where source_code = 'google' and place_ref = ${candidate.placeId}`;
      if (existing) continue;

      const base = slugPart(candidate.name);
      await tx`select pg_advisory_xact_lock(hashtext(${`slug:${base}`}))`;
      let slug = base;
      if ((await tx`select 1 from restaurant where slug = ${slug}`).length) {
        slug = `${base}-${slugPart(candidate.area || "lisbon")}`;
      }
      for (let suffix = 2; (await tx`select 1 from restaurant where slug = ${slug}`).length; suffix++) {
        slug = `${base}-${slugPart(candidate.area || "lisbon")}-${suffix}`;
      }

      const [restaurant] = await tx`
        insert into restaurant (slug, name, city, area, address, lat, lng, status, format, format_provenance, price_tier, price_provenance)
        values (${slug}, ${candidate.name}, 'Lisbon', ${candidate.area}, ${candidate.address}, ${candidate.latitude}, ${candidate.longitude},
          'open', ${candidate.format}, ${candidate.formatProvenance}, ${candidate.priceTier}, ${candidate.priceTier ? "source" : null})
        returning id`;
      await tx`
        insert into listing (restaurant_id, source_code, place_ref, url, match_provenance, source_rating, source_review_count,
          newest_review_at, categories, price_level, closed_flag)
        values (${restaurant!.id}, 'google', ${candidate.placeId}, ${candidate.url}, 'auto_accepted', ${candidate.rating},
          ${candidate.reviewCount}, ${candidate.newestReviewAt}, ${candidate.categories}, ${candidate.priceLevel}, false)`;
      inserted++;
    }
    return inserted;
  });
}
