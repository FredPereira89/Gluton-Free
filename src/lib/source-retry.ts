import { tasks } from "@trigger.dev/sdk";
import { db } from "./db";
import { acceptedJobResponse } from "./api-contract";
import { markJobStartFailed } from "./job";
import { ApiError } from "./problem";

/** Queues a retry for a failed Crowd Source while leaving its Owner question open until re-judging finishes. */
export async function retrySource(slug: string, source: "google" | "tripadvisor"): Promise<Response> {
  const sql = db();
  const { restaurantId, listingId, questionId, jobId } = await sql.begin(async (tx) => {
    const [restaurant] = await tx`select id from restaurant where slug = ${slug} for update`;
    if (!restaurant) throw new ApiError(404, "not_found", "Restaurant not found");
    const restaurantId = Number(restaurant.id);

    const [question] = await tx`
      select id, status from owner_question
      where restaurant_id = ${restaurantId} and source_code = ${source} and kind = 'retry_source'
      order by id desc limit 1 for update`;
    if (!question) throw new ApiError(404, "not_found", "No retry question for that Source");
    if (question.status !== "open") throw new ApiError(409, "already_settled", "This Owner question was already settled");

    const [activeJob] = await tx`
      select id from job where restaurant_id = ${restaurantId} and status in ('queued', 'running')
      order by id desc limit 1`;
    if (activeJob) throw new ApiError(409, "job_in_progress", "A Restaurant job is already running. Try again after it finishes.");

    const [listing] = await tx`
      select id, fetch_status from listing where restaurant_id = ${restaurantId} and source_code = ${source}`;
    if (!listing) throw new ApiError(404, "not_found", "Listing not found for that Source");
    if (listing.fetch_status !== "failed" && listing.fetch_status !== "fetched") {
      throw new ApiError(409, "source_not_failed", "That Source is already being fetched or is not ready for retry");
    }

    const [job] = await tx`
      insert into job (kind, restaurant_id, status, step)
      values ('listing_fetch', ${restaurantId}, 'queued', 'Retrying failed Source') returning id`;
    return {
      restaurantId,
      listingId: Number(listing.id),
      questionId: Number(question.id),
      jobId: Number(job!.id),
    };
  });

  try {
    const handle = await tasks.trigger("owner-source-retry", { restaurantId, listingId, questionId, jobId }, {
      idempotencyKey: `source-retry-${jobId}`,
    });
    await sql`update job set trigger_run_id = ${handle.id}, updated_at = now() where id = ${jobId}`;
  } catch (error) {
    await markJobStartFailed(jobId, "Could not start Source retry");
    throw error;
  }
  return acceptedJobResponse(jobId);
}
