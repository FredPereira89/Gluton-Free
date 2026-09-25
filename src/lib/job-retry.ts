import { tasks } from "@trigger.dev/sdk";
import { db } from "./db";
import { acceptedJobResponse } from "./api-contract";
import { markJobStartFailed } from "./job";
import { ApiError } from "./problem";

/** Retries a failed Lookup Job, resuming from the stage that failed so already-fetched Reviews are not paid for again. */
export async function retryJob(id: number): Promise<Response> {
  const sql = db();
  const [job] = await sql`select id, kind, restaurant_id, failed_stage from job where id = ${id}`;
  if (!job) throw new ApiError(404, "not_found", "Job not found");
  if (job.kind !== "lookup") throw new ApiError(400, "unsupported_job_kind", "Only a failed Lookup can be retried");
  const restaurantId = Number(job.restaurant_id);
  const from = job.failed_stage as "ingest" | "extract" | "judge" | null;

  const [retried] = await sql`
    update job set status = 'queued', error_code = null, error_detail = null, finished_at = null, updated_at = now()
    where id = ${id} and status = 'failed'
    returning id`;
  if (!retried) throw new ApiError(409, "not_failed", "This Job is not in a failed state");

  try {
    const handle = await tasks.trigger("restaurant-lookup", { restaurantId, jobId: id, from: from ?? undefined }, {
      idempotencyKey: `lookup-retry-${id}-${Date.now()}`,
    });
    await sql`update job set trigger_run_id = ${handle.id}, updated_at = now() where id = ${id}`;
  } catch (error) {
    await markJobStartFailed(id, "Could not start retry");
    throw error;
  }
  return acceptedJobResponse(id);
}
