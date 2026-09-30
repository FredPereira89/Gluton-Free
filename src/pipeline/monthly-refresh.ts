import { pendingExtraction } from "@/analysis/store";
import { db } from "@/lib/db";
import { createJob, finishJob, setStep } from "@/lib/job";
import { raiseSourceRetryQuestions } from "@/lib/owner-question";
import { PipelineError, toPipelineError } from "@/lib/pipeline-error";
import { sendPush } from "@/lib/push-send";
import { MONTH_MS, PARAMS } from "@/verdict/rollup";
import { runPeerSnapshotPublish } from "./snapshot-publish";
import { extractRestaurant, ingestRefreshRestaurant, judgeRestaurant, type Sleep } from "./lookup";

function reviewWindowSince(now: Date, changePointAt: Date | null): Date {
  const since = new Date(now.getTime() - PARAMS.reviewWindowMaxAgeMonths * MONTH_MS);
  return changePointAt && changePointAt > since ? changePointAt : since;
}

async function newestChangePointAt(restaurantId: number): Promise<Date | null> {
  const [row] = await db()`
    select date from change_point where restaurant_id = ${restaurantId} and deleted_at is null
    order by date desc, id desc limit 1`;
  return row?.date ? new Date(row.date as string) : null;
}

/** Runs the monthly refresh for one Restaurant and records its vendor and model costs on its Job. */
export async function runRestaurantRefresh(
  restaurantId: number,
  sleep: Sleep,
  opts: { jobId?: number; triggerRunId?: string; now?: Date; deferFinish?: boolean } = {},
) {
  const jobId = opts.jobId ?? await createJob("refresh", restaurantId, opts.triggerRunId);
  if (opts.jobId) await db()`
    update job set status = 'running', trigger_run_id = ${opts.triggerRunId ?? null}, updated_at = now()
    where id = ${jobId} and kind = 'refresh'`;
  let stage: "ingest" | "extract" | "judge" = "ingest";
  try {
    await setStep(jobId, "fetching new Reviews");
    const fetched = await ingestRefreshRestaurant(restaurantId, jobId, sleep);
    const questionIds = await raiseSourceRetryQuestions(db(), restaurantId);
    for (const questionId of questionIds) await sendPush("owner_question", restaurantId, questionId);

    const now = opts.now ?? new Date();
    const window = {
      since: reviewWindowSince(now, await newestChangePointAt(restaurantId)),
      maxPerSource: PARAMS.reviewWindowCap,
    };
    const toRead = await pendingExtraction(restaurantId, window);
    await setStep(jobId, "reading new Reviews", { newReviews: toRead.length, fetched });

    stage = "extract";
    const extraction = await extractRestaurant(restaurantId, jobId, sleep, undefined, window, true);
    stage = "judge";
    const judged = await judgeRestaurant(restaurantId, jobId, "automatic");
    if (!opts.deferFinish) await finishJob(jobId);
    return { jobId, fetched, extraction, ...judged };
  } catch (error) {
    await finishJob(jobId, toPipelineError(error), stage);
    throw error;
  }
}

async function refreshTargets(): Promise<number[]> {
  const rows = await db()`
    select r.id
    from restaurant r
    where exists (select 1 from listing l where l.restaurant_id = r.id)
      and (
        exists (
          select 1 from peer_snapshot_member m
          where m.restaurant_id = r.id
            and m.snapshot_id = (select id from peer_snapshot order by published_at desc, id desc limit 1)
        )
        or exists (select 1 from job j where j.restaurant_id = r.id and j.kind = 'lookup')
      )
    order by r.id`;
  return rows.map((row) => Number(row.id));
}

/** Refreshes every current Peer and looked-up Restaurant, then publishes the month's snapshot. */
export async function runMonthlyRefresh(
  sleep: Sleep,
  opts: { triggerRunId?: string; now?: Date } = {},
) {
  const targets = await refreshTargets();
  const refreshed: number[] = [];
  const failed: number[] = [];
  const pendingJobs: number[] = [];
  for (const restaurantId of targets) {
    try {
      const result = await runRestaurantRefresh(restaurantId, sleep, { triggerRunId: opts.triggerRunId, now: opts.now, deferFinish: true });
      refreshed.push(restaurantId);
      pendingJobs.push(result.jobId);
    } catch (error) {
      console.error(`Monthly refresh failed for Restaurant ${restaurantId}`, error);
      failed.push(restaurantId);
    }
  }
  if (failed.length) {
    const error = new PipelineError("refresh_failed", `Monthly refresh failed for ${failed.length} Restaurant(s): ${failed.join(", ")}. The Peer snapshot was not published.`);
    for (const jobId of pendingJobs) await finishJob(jobId, error);
    throw error;
  }
  let snapshot: Awaited<ReturnType<typeof runPeerSnapshotPublish>>;
  try {
    snapshot = await runPeerSnapshotPublish({ triggerRunId: opts.triggerRunId, now: opts.now });
  } catch (error) {
    const pipelineError = toPipelineError(error);
    for (const jobId of pendingJobs) await finishJob(jobId, pipelineError);
    throw error;
  }
  for (const jobId of pendingJobs) await finishJob(jobId);
  return { refreshed: refreshed.length, snapshotId: snapshot.snapshotId, snapshotRejudged: snapshot.rejudged };
}
