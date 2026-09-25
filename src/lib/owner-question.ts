import { tasks } from "@trigger.dev/sdk";
import type postgres from "postgres";
import type { PreviewListing } from "@/app/api/v1/lookups/preview/preview";
import { db } from "./db";
import { acceptedJobResponse, answerListingResponseSchema } from "./api-contract";
import { ApiError } from "./problem";

/** Raises one Owner question per uncertain candidate (ADR-0005: a Lookup never waits for it). */
export async function raiseListingQuestions(sql: postgres.TransactionSql, restaurantId: number, askLater: PreviewListing[]) {
  for (const candidate of askLater) {
    await sql`
      insert into owner_question (restaurant_id, kind, source_code, payload)
      values (${restaurantId}, 'listing_match', ${candidate.source}, ${sql.json(candidate as never)})
      on conflict (restaurant_id, source_code, kind) where status = 'open' do nothing`;
  }
}

export function questionPrompt(sourceCode: string, payload: PreviewListing): string {
  const pct = Math.round(payload.evidence.nameSimilarity * 100);
  return `Is "${payload.name}" on ${sourceCode} your Restaurant? (name match ${pct}%)`;
}

/** Answers the most recent Owner question for that Source. Settles `none` outright; `accept` fetches the Listing and re-judges. */
export async function answerListingQuestion(
  slug: string,
  source: "google" | "tripadvisor",
  answer: "accept" | "none",
): Promise<Response> {
  const sql = db();
  const [restaurant] = await sql`select id from restaurant where slug = ${slug}`;
  if (!restaurant) throw new ApiError(404, "not_found", "Restaurant not found");
  const restaurantId = Number(restaurant.id);
  const [question] = await sql`
    select id, status, payload from owner_question
    where restaurant_id = ${restaurantId} and source_code = ${source} and kind = 'listing_match'
    order by id desc limit 1`;
  if (!question) throw new ApiError(404, "not_found", "No Owner question for that Source");
  if (question.status !== "open") throw new ApiError(409, "already_settled", "This Owner question was already settled");

  if (answer === "none") {
    await sql`update owner_question set status = 'dismissed', settled_at = now() where id = ${question.id}`;
    return Response.json(answerListingResponseSchema.parse({ settled: true }), { status: 200, headers: { "Cache-Control": "private, no-store" } });
  }

  const candidate = question.payload as PreviewListing;
  const { listingId, fetchJobId } = await db().begin(async (tx) => {
    await tx`update owner_question set status = 'answered', settled_at = now() where id = ${question.id}`;
    const [listing] = await tx`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance, source_review_count)
      values (${restaurantId}, ${source}, ${candidate.placeRef}, ${candidate.url}, 'proposed_confirmed', ${candidate.reviewCount})
      returning id`;
    const [job] = await tx`
      insert into job (kind, restaurant_id, status, step) values ('listing_fetch', ${restaurantId}, 'queued', 'Listings matched') returning id`;
    return { listingId: Number(listing!.id), fetchJobId: Number(job!.id) };
  });

  try {
    const handle = await tasks.trigger("owner-listing-answer", { restaurantId, listingId, fetchJobId }, {
      idempotencyKey: `listing-answer-${fetchJobId}`,
    });
    await sql`update job set trigger_run_id = ${handle.id}, updated_at = now() where id = ${fetchJobId}`;
  } catch (error) {
    await sql`update job set status = 'failed', error = 'Could not start listing fetch', finished_at = now(), updated_at = now() where id = ${fetchJobId}`;
    throw error;
  }
  return acceptedJobResponse(fetchJobId);
}
