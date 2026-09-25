import { db } from "@/lib/db";
import type { Normalised } from "./normalise";

/** Inserts new Reviews (existing ones are immutable and skipped) and refreshes the Listing's Source stats. */
export async function storeListingFetch(listingId: number, n: Normalised): Promise<{ inserted: number }> {
  const sql = db();
  let inserted = 0;
  const rows = n.reviews.map((r) => ({
    listing_id: listingId,
    source_review_id: r.sourceReviewId,
    stars: r.stars,
    published_at: r.publishedAt,
    language: r.language,
    text: r.text,
    sub_ratings: r.subRatings,
    reviewer_review_count: r.reviewerReviewCount,
    local_guide: r.localGuide,
    reviewer_contributions: r.reviewerContributions,
    photo_count: r.photoCount,
    visited_on: r.visitedOn,
    owner_replied: r.ownerReplied,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const res = await sql`
      insert into review ${sql(chunk as never)}
      on conflict (listing_id, source_review_id) do nothing
      returning id`;
    inserted += res.length;
  }
  await sql`
    update listing set
      source_rating = ${n.facts.rating},
      source_review_count = ${n.facts.reviewCount},
      price_level = coalesce(${n.facts.priceLevel}, price_level),
      source_text_count = (select count(*) from review where listing_id = ${listingId} and text is not null),
      newest_review_at = (select max(published_at) from review where listing_id = ${listingId}),
      fetch_status = 'fetched', fetch_error = null, last_fetched_at = now()
    where id = ${listingId}`;
  return { inserted };
}
