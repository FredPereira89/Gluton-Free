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
