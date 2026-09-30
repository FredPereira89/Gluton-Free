import type { BaselineCandidate } from "./baseline";
import type { BaselineBuiltCandidate } from "./baseline-build";
import { normalizeBaselineLabel } from "@/domain/baseline-format";
import { db } from "@/lib/db";
import { storeListingFetch } from "@/ingest/store";
import { saveAnalyses } from "@/analysis/store";
import type { Extracted } from "@/analysis/extract";
import type { Normalised } from "@/ingest/normalise";
import type { BaselineTripadvisorMatch } from "./baseline-tripadvisor";
import type { BaselineAnalysis } from "./baseline-build";

function slugPart(text: string): string {
  return normalizeBaselineLabel(text).replace(/_/g, "-").slice(0, 75) || "restaurant";
}

/** Persists candidates and keeps any earlier auto-Format classification replaceable by Review confirmation. */
export async function persistBaselineCandidates(candidates: BaselineCandidate[]): Promise<number> {
  const sql = db();
  return sql.begin(async (tx) => {
    let inserted = 0;
    for (const candidate of candidates) {
      await tx`select pg_advisory_xact_lock(hashtext(${candidate.placeId}))`;
      const [existing] = await tx`
        select l.id, r.id as restaurant_id, r.format_provenance
        from listing l join restaurant r on r.id = l.restaurant_id
        where l.source_code = 'google' and l.place_ref = ${candidate.placeId}`;
      if (existing) {
        if (existing.format_provenance === "baseline_auto" && candidate.formatProvenance === "llm") {
          await tx`
            update restaurant set format = ${candidate.format}, format_provenance = 'llm', format_changed_at = now()
            where id = ${existing.restaurant_id} and format_provenance = 'baseline_auto'`;
        }
        continue;
      }

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

/** Stores only the sampled Review windows and their frozen analyses after Format confirmation. */
export async function persistBaselineBuild(candidates: BaselineBuiltCandidate[]): Promise<{
  insertedRestaurants: number;
  storedReviews: number;
  storedAnalyses: number;
}> {
  const insertedRestaurants = await persistBaselineCandidates(candidates.map(({ candidate }) => candidate));
  const sql = db();
  let storedReviews = 0;
  let storedAnalyses = 0;
  for (const built of candidates) {
    const [listing] = await sql`
      select l.id, l.source_review_count, l.source_rating, l.price_level, r.id as restaurant_id
      from listing l join restaurant r on r.id = l.restaurant_id
      where l.source_code = 'google' and l.place_ref = ${built.candidate.placeId}`;
    if (!listing) continue;
    const normalised: Normalised = {
      facts: {
        title: built.candidate.name,
        address: built.candidate.address,
        placeRef: built.candidate.placeId,
        rating: built.candidate.rating,
        reviewCount: built.candidate.reviewCount,
        priceLevel: built.candidate.priceLevel,
      },
      reviews: built.reviews,
      droppedThirdParty: 0,
    };
    const listingId = Number(listing.id);
    const inserted = await storeListingFetch(listingId, normalised);
    storedReviews += inserted.inserted;
    if (!built.analyses.length) continue;
    const reviewIds = built.reviews.map((review) => review.sourceReviewId);
    const rows = await sql`
      select id, source_review_id, text from review
      where listing_id = ${listingId} and source_review_id in ${sql(reviewIds)}
    `;
    const idsBySourceId = new Map(rows.map((row) => [String(row.source_review_id), { id: Number(row.id), text: row.text as string | null }]));
    const results = new Map<number, Extracted>();
    const texts = new Map<number, string>();
    for (const item of built.analyses) {
      const stored = idsBySourceId.get(item.sourceReviewId);
      if (!stored || stored.text === null) continue;
      const analysis = { ...item.analysis, reviewId: stored.id };
      results.set(stored.id, analysis);
      texts.set(stored.id, stored.text);
    }
    await saveAnalyses(results, texts);
    storedAnalyses += results.size;
  }
  return { insertedRestaurants, storedReviews, storedAnalyses };
}

/** Attach only unclaimed automatic matches to persisted sampled Restaurants. */
export async function persistBaselineTripadvisorMatches(
  matches: BaselineTripadvisorMatch[], analysesByPlaceRef: Map<string, BaselineAnalysis[]>,
): Promise<{ attached: number; storedReviews: number; storedAnalyses: number; conflicts: number }> {
  const sql = db();
  let attached = 0;
  let storedReviews = 0;
  let storedAnalyses = 0;
  let conflicts = 0;
  for (const match of matches) {
    const [google] = await sql`
      select r.id from restaurant r join listing l on l.restaurant_id = r.id
      where l.source_code = 'google' and l.place_ref = ${match.googlePlaceId}`;
    if (!google) { conflicts++; continue; }
    const [inserted] = await sql`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
      values (${google.id}, 'tripadvisor', ${match.placeRef}, ${match.url}, 'auto_accepted')
      on conflict do nothing returning id`;
    const [listing] = inserted ? [inserted] : await sql`
      select id from listing where restaurant_id = ${google.id} and source_code = 'tripadvisor' and place_ref = ${match.placeRef}`;
    if (!listing) { conflicts++; continue; }
    attached++;
    const listingId = Number(listing.id);
    const stored = await storeListingFetch(listingId, { ...match.normalised, reviews: match.window });
    storedReviews += stored.inserted;
    const sourceIds = (analysesByPlaceRef.get(match.placeRef) ?? []).map((item) => item.sourceReviewId);
    if (!sourceIds.length) continue;
    const rows = await sql`
      select id, source_review_id, text from review
      where listing_id = ${listingId} and source_review_id in ${sql(sourceIds)}`;
    const bySourceId = new Map(rows.map((row) => [String(row.source_review_id), { id: Number(row.id), text: row.text as string | null }]));
    const extracted = new Map<number, Extracted>();
    const texts = new Map<number, string>();
    for (const item of analysesByPlaceRef.get(match.placeRef) ?? []) {
      const saved = bySourceId.get(item.sourceReviewId);
      if (!saved?.text) continue;
      extracted.set(saved.id, { ...item.analysis, reviewId: saved.id });
      texts.set(saved.id, saved.text);
    }
    await saveAnalyses(extracted, texts);
    storedAnalyses += extracted.size;
  }
  return { attached, storedReviews, storedAnalyses, conflicts };
}
