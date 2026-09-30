import { tasks } from "@trigger.dev/sdk";
import { apifyConfigured } from "@/ingest/apify";
import { db } from "./db";
import { finishJob, markJobStartFailed } from "./job";
import { PipelineError } from "./pipeline-error";

/**
 * Starts TheFork matching beside a new Lookup as its own `source_match` Job. Best effort: nothing
 * here may fail or delay the Lookup, so every failure is recorded on the Job and never thrown.
 */
export async function startTheForkMatch(restaurantId: number): Promise<void> {
  try {
    const [job] = await db()`
      insert into job (kind, restaurant_id, status, step) values ('source_match', ${restaurantId}, 'queued', 'TheFork match queued')
      returning id`;
    const jobId = Number(job!.id);
    if (!apifyConfigured()) {
      await finishJob(jobId, new PipelineError("apify_not_configured", "TheFork matching is unavailable: Apify access is not configured."));
      return;
    }
    try {
      const handle = await tasks.trigger("thefork-match", { restaurantId, jobId }, { idempotencyKey: `thefork-match-${jobId}` });
      await db()`update job set trigger_run_id = ${handle.id}, updated_at = now() where id = ${jobId}`;
    } catch {
      await markJobStartFailed(jobId, "TheFork matching was unavailable: it could not be started.");
    }
  } catch (error) {
    console.error("Could not record TheFork match Job", error instanceof Error ? error.message : error);
  }
}

/**
 * Starts TheFork matching again when a Lookup is started for a Restaurant that already has one, but
 * only if its last match failed (or never ran) and no TheFork Listing is known. A match that
 * succeeded, is running, or was answered "none" is never repeated, so a double click costs nothing.
 */
export async function retryTheForkMatch(restaurantId: number): Promise<void> {
  const [due] = await db()`
    select 1 where not exists (select 1 from listing where restaurant_id = ${restaurantId} and source_code = 'thefork')
      and coalesce((select status from job where restaurant_id = ${restaurantId} and kind = 'source_match' order by id desc limit 1), 'failed') = 'failed'`;
  if (due) await startTheForkMatch(restaurantId);
}
