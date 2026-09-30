import { db } from "@/lib/db";
import type { Normalised, NormalisedReview } from "./normalise";

/**
 * DataForSEO exposes a newest-first depth, not a server-side cursor. Keep the
 * Listing's newest source Review ID as our watermark and discard the overlap.
 * Ties at the cursor timestamp are kept so a newly-published Review with the
 * same timestamp is not lost; the unique Listing/source ID constraint removes
 * any overlap rows already stored.
 */
export function reviewsPastCursor(
  reviews: NormalisedReview[],
  cursor: string | null,
  newestReviewAt: Date | null,
): NormalisedReview[] {
  const newestFirst = [...reviews].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  if (!cursor) return newestFirst;

  const cursorIndex = newestFirst.findIndex((review) => review.sourceReviewId === cursor);
  if (cursorIndex >= 0) {
    const cursorTime = newestFirst[cursorIndex]!.publishedAt.getTime();
    return newestFirst.filter((review, index) => review.sourceReviewId !== cursor
      && (index < cursorIndex || review.publishedAt.getTime() === cursorTime));
  }

  // If a bounded fetch did not reach the ID, its dates still let us keep new
  // Reviews without re-inserting the older part of the history.
  return newestReviewAt
    ? newestFirst.filter((review) => review.publishedAt.getTime() >= newestReviewAt.getTime())
    : [];
}

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
  const newestReview = [...n.reviews].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())[0];
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
      fetch_cursor = coalesce(${newestReview?.sourceReviewId ?? null}, fetch_cursor),
      fetch_status = 'fetched', fetch_error = null, last_fetched_at = now()
    where id = ${listingId}`;
  return { inserted };
}
