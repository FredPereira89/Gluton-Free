import { tasks } from "@trigger.dev/sdk";
import { acceptedJobResponse } from "./api-contract";
import { db } from "./db";
import { ApiError } from "./problem";

/** Removes an auto-accepted Listing and queues a Verdict from the remaining Sources. */
export async function undoAutoAcceptedListing(slug: string, source: "google" | "tripadvisor"): Promise<Response> {
  const { restaurantId, jobId } = await db().begin(async (tx) => {
    const [restaurant] = await tx`select id from restaurant where slug = ${slug} for update`;
    if (!restaurant) throw new ApiError(404, "not_found", "Restaurant not found");
    const restaurantId = Number(restaurant.id);

    const [listing] = await tx`
      select id, match_provenance from listing
      where restaurant_id = ${restaurantId} and source_code = ${source}
      for update`;
    if (!listing) throw new ApiError(404, "not_found", "Listing not found");
    if (listing.match_provenance !== "auto_accepted") {
      throw new ApiError(409, "not_auto_accepted", "Only automatically accepted Listings can be undone");
    }

    const [activeJob] = await tx`
      select id from job where restaurant_id = ${restaurantId} and status in ('queued', 'running')
      order by id desc limit 1`;
    if (activeJob) throw new ApiError(409, "job_in_progress", "Wait for the current job to finish before undoing a Listing");

    // review_flag has a restrictive foreign key; remove source-specific flags before Reviews.
    await tx`
      delete from review_flag f using review r
      where f.review_id = r.id and r.listing_id = ${listing.id}`;
    await tx`delete from review where listing_id = ${listing.id}`;
    const [detached] = await tx`
      delete from listing where id = ${listing.id} and match_provenance = 'auto_accepted'
      returning id`;
    if (!detached) throw new ApiError(409, "not_auto_accepted", "This Listing is no longer an automatically accepted match");

    const [job] = await tx`
      insert into job (kind, restaurant_id, status, step)
      values ('rejudge', ${restaurantId}, 'queued', 'Listing removed') returning id`;
    return { restaurantId, jobId: Number(job!.id) };
  });

  try {
    const handle = await tasks.trigger("owner-listing-undo", { restaurantId, jobId }, {
      idempotencyKey: `listing-undo-${jobId}`,
    });
    await db()`update job set trigger_run_id = ${handle.id}, updated_at = now() where id = ${jobId}`;
  } catch {
    await db()`
      update job set status = 'failed', error = 'Could not start Listing rejudge', finished_at = now(), updated_at = now()
      where id = ${jobId}`;
    throw new ApiError(503, "job_start_failed", "Could not start the Verdict update. Try again later.");
  }
  return acceptedJobResponse(jobId);
}
