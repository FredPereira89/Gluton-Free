// TheFork matching (#63): finds nearby TheFork Listings through Apify and raises an Owner question.
// It runs as its own `source_match` Job beside the Lookup (ADR-0005), so a missing token, a spend
// cap, or a failed Apify run never touches the Google/Tripadvisor Verdict. Its failure is stored on
// the Job and shown to the owner as "TheFork matching was unavailable".
import { proposeTheForkListings } from "@/app/api/v1/lookups/preview/preview";
import { ApifyError, apifyConfigured, searchTheFork } from "@/ingest/apify";
import { db } from "@/lib/db";
import { addVendorCost, createJob, finishJob, setStep } from "@/lib/job";
import { raiseListingQuestions } from "@/lib/owner-question";
import { PipelineError, toPipelineError } from "@/lib/pipeline-error";
import { sendPush } from "@/lib/push-send";
import { spendCapStatus } from "@/lib/spend-cap";

/** Searches TheFork near the Restaurant and raises one Owner question with the plausible candidates. */
export async function runTheForkMatch(restaurantId: number, opts: { jobId?: number; triggerRunId?: string } = {}) {
  const sql = db();
  const jobId = opts.jobId ?? await createJob("source_match", restaurantId, opts.triggerRunId);
  if (opts.jobId) await sql`update job set status = 'running', trigger_run_id = ${opts.triggerRunId ?? null}, updated_at = now() where id = ${jobId}`;
  try {
    if (!apifyConfigured()) throw new PipelineError("apify_not_configured", "TheFork matching is unavailable: Apify access is not configured.");
    if ((await spendCapStatus()).atCap) throw new PipelineError("spend_cap_reached", "TheFork matching is unavailable: the daily vendor spend cap was reached.");
    const [restaurant] = await sql`select name, lat, lng from restaurant where id = ${restaurantId}`;
    if (!restaurant) throw new PipelineError("not_found", "Restaurant not found");
    const [known] = await sql`select 1 from listing where restaurant_id = ${restaurantId} and source_code = 'thefork'`;
    if (known) {
      await sql`update job set status = 'succeeded', step = 'TheFork already matched', finished_at = now(), updated_at = now() where id = ${jobId}`;
      return { jobId, candidates: 0 };
    }

    if (restaurant.lat == null || restaurant.lng == null) {
      throw new PipelineError("vendor_error", "TheFork matching was unavailable: the restaurant has no coordinates to search around.");
    }
    await setStep(jobId, "searching TheFork");
    let found: Awaited<ReturnType<typeof searchTheFork>>;
    try {
      found = await searchTheFork({ lat: Number(restaurant.lat), lng: Number(restaurant.lng) });
    } catch (error) {
      if (error instanceof ApifyError && error.costUsd) await addVendorCost(jobId, error.costUsd);
      throw new PipelineError("vendor_error", "TheFork matching was unavailable: the TheFork search failed.", { cause: error });
    }
    await addVendorCost(jobId, found.costUsd);
    const candidates = proposeTheForkListings(
      { name: restaurant.name as string, lat: restaurant.lat as number | null, lng: restaurant.lng as number | null },
      found.items,
    );
    // sql.begin only resolves once the transaction commits, so a rolled-back question never notifies.
    const questionIds = candidates.length ? await sql.begin((tx) => raiseListingQuestions(tx, restaurantId, candidates)) : [];
    // A failed push must not mark the search failed once its questions are committed.
    for (const questionId of questionIds) await sendPush("owner_question", restaurantId, questionId).catch(() => undefined);
    await setStep(jobId, "TheFork searched", { theFork: { searched: found.items.length, candidates: candidates.length } });
    // Not finishJob: its success path settles failed_lookup questions, which belong to the Lookup, not to this Job.
    await sql`update job set status = 'succeeded', finished_at = now(), updated_at = now() where id = ${jobId}`;
    return { jobId, candidates: candidates.length };
  } catch (e) {
    await finishJob(jobId, toPipelineError(e));
    throw e;
  }
}
