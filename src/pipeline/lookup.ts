// The lookup pipeline: fetch every Listing, extract per-Review Aspects, verify Red flags, and
// issue a Verdict. Waiting is injected so the same code runs locally (setTimeout) and in
// Trigger.dev (checkpointed wait.for, which costs no compute while it waits).
import { batchEnded, collectBatch, extractSync, submitBatch, type ExtractInput, type Extracted } from "@/analysis/extract";
import { readRestaurantFacts } from "@/analysis/restaurant-facts";
import { emptyUsage, EXTRACT_MODEL, JUDGE_MODEL } from "@/analysis/llm";
import { pendingExtraction, saveAnalyses } from "@/analysis/store";
import { reproposesFormat } from "@/domain/aspects";
import { choosePriceTier } from "@/domain/restaurant-facts";
import { verifyPendingFlags } from "@/analysis/verify";
import { depthFor, getReviewTask, postReviewTask, type DfsSource, type ReviewTaskParams } from "@/ingest/dataforseo";
import { normaliseGoogle, normaliseTripadvisor } from "@/ingest/normalise";
import { storeListingFetch } from "@/ingest/store";
import { db } from "@/lib/db";
import { raiseChangePointProposal } from "@/lib/change-point-proposal";
import { addLlmUsage, addVendorCost, createJob, finishJob, setStep, type LlmUsage, type LookupStage } from "@/lib/job";
import { raiseFailedLookupQuestion, raiseFormatQuestion, raiseSourceRetryQuestions } from "@/lib/owner-question";
import { PipelineError, toPipelineError } from "@/lib/pipeline-error";
import { sendPush } from "@/lib/push-send";
import { issueVerdict, loadNewestChangePoint } from "@/verdict/issue";
import { PARAMS } from "@/verdict/rollup";
import type { RejudgeCause } from "@/verdict/stability";

export type Sleep = (seconds: number) => Promise<void>;
export const localSleep: Sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

const SYNC_FIRST = 300; // newest Reviews go through the sync path so a Verdict can show sooner
const POLL_VENDOR_S = 30;
const POLL_BATCH_S = 60;
const MAX_WAIT_S = 3 * 3600;
const MAX_TASK_POST_ATTEMPTS = 3;
const MAX_TASK_GET_FAILURES = 3;
const SOURCE_FETCH_ERROR = "The Reviews vendor could not complete this request. Retry in a few minutes.";

type ListingRow = { id: number; source: DfsSource; placeRef: string };

function taskParams(l: ListingRow, depth: number): ReviewTaskParams {
  return l.source === "google" ? { source: "google", placeId: l.placeRef, depth } : { source: "tripadvisor", urlPath: l.placeRef, depth };
}

async function postReviewTaskWithRetries(params: ReviewTaskParams, sleep: Sleep): Promise<{ taskId: string; cost: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_TASK_POST_ATTEMPTS; attempt++) {
    try {
      return await postReviewTask(params);
    } catch (error) {
      lastError = error;
      if (error instanceof PipelineError && error.code === "vendor_balance_low") throw error;
      if (error instanceof Error && error.message === "DataForSEO credentials are not set") throw error;
      if (attempt < MAX_TASK_POST_ATTEMPTS) await sleep(2 ** (attempt - 1));
    }
  }
  throw lastError;
}

/** Posts tasks for every listing and polls them together until each returns a result. */
async function runVendorTasks(
  listings: ListingRow[],
  depthOf: (l: ListingRow) => number,
  jobId: number,
  sleep: Sleep,
): Promise<{ results: Map<number, unknown>; failures: Map<number, unknown> }> {
  const posted = new Map<number, string>();
  const failures = new Map<number, unknown>();
  for (const l of listings) {
    let task: { taskId: string; cost: number };
    try {
      task = await postReviewTaskWithRetries(taskParams(l, depthOf(l)), sleep);
    } catch (error) {
      failures.set(l.id, error);
      continue;
    }
    await addVendorCost(jobId, task.cost);
    posted.set(l.id, task.taskId);
  }
  const results = new Map<number, unknown>();
  const pollFailures = new Map<number, number>();
  for (let waited = 0; results.size + failures.size < listings.length; waited += POLL_VENDOR_S) {
    if (waited > MAX_WAIT_S) {
      for (const l of listings) if (!results.has(l.id) && !failures.has(l.id)) {
        failures.set(l.id, new Error("DataForSEO task did not finish within 3 hours"));
      }
      break;
    }
    await sleep(POLL_VENDOR_S);
    for (const l of listings) {
      const taskId = posted.get(l.id);
      if (!taskId || results.has(l.id) || failures.has(l.id)) continue;
      let got: Awaited<ReturnType<typeof getReviewTask>>;
      try {
        got = await getReviewTask(l.source, taskId);
      } catch (error) {
        const attempts = (pollFailures.get(l.id) ?? 0) + 1;
        if (attempts >= MAX_TASK_GET_FAILURES) failures.set(l.id, error);
        else pollFailures.set(l.id, attempts);
        continue;
      }
      pollFailures.delete(l.id);
      if (!got) continue;
      if (got.cost) await addVendorCost(jobId, got.cost);
      results.set(l.id, got.result);
    }
  }
  return { results, failures };
}

/**
 * Fetches every Review of every Listing: a depth-10 probe for the count, then the full depth.
 * With `sample`, fetches only the newest `sample` Reviews per Listing and skips the probe.
 * With `listingId`, scopes the fetch to that one Listing (an owner-answered Listing joining late).
 */
export async function ingestRestaurant(restaurantId: number, jobId: number, sleep: Sleep, sample?: number, listingId?: number) {
  const sql = db();
  const scope = listingId ? sql`and id = ${listingId}` : sql``;
  const rows = await sql`select id, source_code, place_ref from listing where restaurant_id = ${restaurantId} ${scope} order by id`;
  const listings: ListingRow[] = rows.map((r) => ({ id: Number(r.id), source: r.source_code as DfsSource, placeRef: r.place_ref as string }));
  await sql`update listing set fetch_status = 'fetching', fetch_error = null where restaurant_id = ${restaurantId} ${scope}`;
  try {
    let depthOf: (l: ListingRow) => number = () => sample!;
    let fetchListings = listings;
    const failedSources = new Set<string>();
    let firstVendorFailure: unknown;
    if (sample) {
      await setStep(jobId, "fetching Reviews", { sample });
    } else {
      await setStep(jobId, "probing Listings");
      const probeBatch = await runVendorTasks(listings, () => 10, jobId, sleep);
      const probeFailedIds = [...probeBatch.failures.keys()];
      firstVendorFailure = probeBatch.failures.values().next().value;
      if (probeFailedIds.length) await sql`
        update listing set fetch_status = 'failed', fetch_error = ${SOURCE_FETCH_ERROR}
        where id = any(${probeFailedIds})`;
      for (const id of probeFailedIds) {
        const source = listings.find((l) => l.id === id)?.source;
        if (source) failedSources.add(source);
      }
      const expected = new Map<number, number>();
      for (const l of listings) {
        const probe = probeBatch.results.get(l.id);
        if (probe === undefined) continue;
        const n = (l.source === "google" ? normaliseGoogle : normaliseTripadvisor)(probe);
        expected.set(l.id, n.facts.reviewCount ?? 0);
      }
      fetchListings = listings.filter((l) => !probeBatch.failures.has(l.id));
      await setStep(jobId, "fetching Reviews", { expected: Object.fromEntries(fetchListings.map((l) => [l.source, expected.get(l.id)])) });
      depthOf = (l) => depthFor(expected.get(l.id) ?? 0);
    }

    const fullBatch = await runVendorTasks(fetchListings, depthOf, jobId, sleep);
    const fullFailedIds = [...fullBatch.failures.keys()];
    firstVendorFailure ??= fullBatch.failures.values().next().value;
    if (fullFailedIds.length) await sql`
      update listing set fetch_status = 'failed', fetch_error = ${SOURCE_FETCH_ERROR}
      where id = any(${fullFailedIds})`;
    for (const id of fullFailedIds) {
      const source = fetchListings.find((l) => l.id === id)?.source;
      if (source) failedSources.add(source);
    }
    const summary: Record<string, { fetched: number; inserted: number; droppedThirdParty: number }> = {};
    for (const l of fetchListings) {
      const result = fullBatch.results.get(l.id);
      if (result === undefined) continue;
      const n = (l.source === "google" ? normaliseGoogle : normaliseTripadvisor)(result);
      fullBatch.results.delete(l.id); // drop the raw vendor payload as soon as it is whitelisted
      const { inserted } = await storeListingFetch(l.id, n);
      summary[l.source] = { fetched: n.reviews.length, inserted, droppedThirdParty: n.droppedThirdParty };
      await setStep(jobId, "fetching Reviews", { fetched: { ...summary } });
    }
    if (!Object.keys(summary).length && firstVendorFailure) {
      if (firstVendorFailure instanceof PipelineError) throw firstVendorFailure;
      throw new PipelineError("vendor_error", SOURCE_FETCH_ERROR, { cause: firstVendorFailure });
    }
    await setStep(jobId, "Reviews stored", { fetched: summary, failedSources: [...failedSources] }, "Reviews fetched");
    return summary;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sql`update listing set fetch_status = 'failed', fetch_error = ${msg} where restaurant_id = ${restaurantId} and fetch_status = 'fetching' ${scope}`;
    throw e;
  }
}

async function save(results: Map<number, Extracted>, items: ExtractInput[]) {
  await saveAnalyses(results, new Map(items.map((i) => [i.id, i.text])));
}

/**
 * Extracts Aspects for every text Review not yet analysed: newest by sync, the rest by batch, then a sync retry.
 * With `limit`, extracts only the newest `limit` pending Reviews, by sync (a quick end-to-end check).
 */
export async function extractRestaurant(restaurantId: number, jobId: number, sleep: Sleep, limit?: number) {
  const all = await pendingExtraction(restaurantId);
  const pending = limit ? all.slice(0, limit) : all;
  const first = pending.slice(0, limit ?? SYNC_FIRST);
  const rest = pending.slice(first.length);

  await setStep(jobId, "extracting newest Reviews", { extraction: { pending: pending.length } });
  const syncUsage = emptyUsage("extract", EXTRACT_MODEL, false);
  await save(await extractSync(first, syncUsage), first);
  await addLlmUsage(jobId, syncUsage);

  if (rest.length) {
    await setStep(jobId, "extracting older Reviews (batch)");
    const batchId = await submitBatch(rest);
    await setStep(jobId, "extracting older Reviews (batch)", { extraction: { pending: pending.length, batchId } });
    for (let waited = 0; !(await batchEnded(batchId)); waited += POLL_BATCH_S) {
      if (waited > MAX_WAIT_S) throw new Error(`batch ${batchId} did not end within 3 hours`);
      await sleep(POLL_BATCH_S);
    }
    const batchUsage = emptyUsage("extract", EXTRACT_MODEL, true);
    await save(await collectBatch(batchId, rest, batchUsage), rest);
    await addLlmUsage(jobId, batchUsage);
  }

  const pendingIds = new Set(pending.map((p) => p.id));
  const missing = (await pendingExtraction(restaurantId)).filter((p) => pendingIds.has(p.id));
  if (missing.length) {
    await setStep(jobId, "re-extracting missed Reviews");
    const retryUsage = emptyUsage("extract-retry", EXTRACT_MODEL, false);
    await save(await extractSync(missing, retryUsage), missing);
    await addLlmUsage(jobId, retryUsage);
  }
  const left = (await pendingExtraction(restaurantId)).length;
  await setStep(jobId, "extraction done", { extraction: { pending: all.length, attempted: pending.length, unanalysed: left } }, "window extracted");
  return { pending: all.length, attempted: pending.length, unanalysed: left };
}

/** Verifies pending Red flags and issues a Verdict. */
export async function judgeRestaurant(restaurantId: number, jobId: number, cause: RejudgeCause = "automatic") {
  const sql = db();
  const [restaurant] = await sql`select format_provenance, price_provenance from restaurant where id = ${restaurantId}`;
  // A confirmed new concept or moved Change point re-proposes the Format from the Reviews since
  // the change (ADR 0007); other kinds (reopened, new owner, new chef) don't affect the Format.
  const changePoint = await loadNewestChangePoint(restaurantId);
  const formatSince = changePoint && reproposesFormat(changePoint.kind) ? changePoint.date : null;
  const listings = await sql`select source_code, price_level, categories from listing where restaurant_id = ${restaurantId}`;
  const reviews = await sql`
    select text from (
      select r.text, r.published_at,
        row_number() over (partition by l.source_code order by r.published_at desc) as source_rank
      from review r join listing l on l.id = r.listing_id
      where l.restaurant_id = ${restaurantId} and r.text is not null
        and r.published_at >= now() - ${PARAMS.reviewWindowMaxAgeMonths} * interval '1 month'
        and (${formatSince}::timestamptz is null or r.published_at >= ${formatSince})
    ) windowed where source_rank <= ${PARAMS.reviewWindowCap}
    order by published_at desc`;
  const sourcePrices = listings.map((l) => ({ source: l.source_code as string, priceLevel: l.price_level as string | null }));
  const googleCategories = listings.find((listing) => listing.source_code === "google")?.categories as string[] | null ?? [];
  const needReading = restaurant?.format_provenance !== "owner"
    || (choosePriceTier(sourcePrices, null) === null && restaurant?.price_provenance !== "owner");
  const factsUsage = emptyUsage("restaurant-facts", EXTRACT_MODEL, false);
  const reading = needReading ? await readRestaurantFacts(
    reviews.map((r) => r.text as string),
    listings.flatMap((listing) => listing.categories as string[] | null ?? []),
    googleCategories,
    factsUsage,
  ) : null;
  if (factsUsage.requests) await addLlmUsage(jobId, factsUsage);
  if (reading) {
    // sql.begin only resolves once the transaction commits, so pushing on its result never notifies about a rolled-back question.
    const formatQuestionId = await sql.begin(async (tx) => {
      const [current] = await tx`select format_provenance from restaurant where id = ${restaurantId} for update`;
      if (current?.format_provenance === "owner") return undefined;
      await tx`
        update restaurant set format = ${reading.format}, format_provenance = 'llm',
          format_changed_at = case when format is distinct from ${reading.format} then now() else format_changed_at end
        where id = ${restaurantId}`;
      if (reading.googleCategoryDisagrees && googleCategories.length) {
        return await raiseFormatQuestion(tx, restaurantId, reading.format, googleCategories);
      }
      return undefined;
    });
    if (formatQuestionId) await sendPush("owner_question", restaurantId, formatQuestionId);
  }
  const price = choosePriceTier(sourcePrices, reading?.reviewPriceTier ?? null);
  if (price) await sql`
    update restaurant set price_tier = ${price.tier}, price_provenance = ${price.provenance}
    where id = ${restaurantId} and price_provenance is distinct from 'owner'`;
  await setStep(jobId, "verifying Red flags");
  const verifyUsage: LlmUsage = emptyUsage("verify-flags", JUDGE_MODEL, false);
  const flags = await verifyPendingFlags(restaurantId, verifyUsage);
  await addLlmUsage(jobId, verifyUsage);

  await setStep(jobId, "flags verified", { flags }, "flags verified");
  await setStep(jobId, "checking signals", undefined, "signals checked");
  await setStep(jobId, "issuing Verdict");
  const explainUsage = emptyUsage("explain", JUDGE_MODEL, false);
  const verdictId = await issueVerdict(restaurantId, jobId, explainUsage, cause);
  await addLlmUsage(jobId, explainUsage);
  await raiseChangePointProposal(restaurantId);
  await setStep(jobId, "Verdict issued", { verdictId }, "judged and explained");
  await sendPush("verdict_ready", restaurantId);
  await setStep(jobId, "notified", undefined, "notified");
  return { flags, verdictId };
}

/** The whole lookup, as one Job. `from` lets a re-run skip stages that already completed. */
export async function runLookup(
  restaurantId: number,
  sleep: Sleep,
  opts: { from?: LookupStage; triggerRunId?: string; jobId?: number; sample?: number; extractLimit?: number } = {},
) {
  const jobId = opts.jobId ?? await createJob("lookup", restaurantId, opts.triggerRunId);
  if (opts.jobId) await db()`update job set status = 'running', trigger_run_id = ${opts.triggerRunId ?? null}, updated_at = now() where id = ${jobId}`;
  const from = opts.from ?? "ingest";
  let stage: LookupStage = from;
  try {
    await setStep(jobId, "Listings matched", undefined, "Listings matched");
    const ingest = from === "ingest" ? await ingestRestaurant(restaurantId, jobId, sleep, opts.sample) : null;
    stage = "extract";
    const extraction = from !== "judge" ? await extractRestaurant(restaurantId, jobId, sleep, opts.extractLimit) : null;
    const questionIds = await raiseSourceRetryQuestions(db(), restaurantId);
    for (const questionId of questionIds) await sendPush("owner_question", restaurantId, questionId);
    stage = "judge";
    const judged = await judgeRestaurant(restaurantId, jobId);
    await finishJob(jobId);
    return { jobId, ingest, extraction, ...judged };
  } catch (e) {
    const error = toPipelineError(e);
    await finishJob(jobId, error, stage);
    await raiseFailedLookupQuestion(db(), restaurantId, jobId, error);
    await sendPush("lookup_failed", restaurantId);
    throw e;
  }
}

/** Fetches one owner-answered Listing on its own, ahead of the Rejudge that follows it. */
export async function runListingFetch(
  restaurantId: number,
  listingId: number,
  sleep: Sleep,
  opts: { triggerRunId?: string; jobId?: number } = {},
) {
  const jobId = opts.jobId ?? await createJob("listing_fetch", restaurantId, opts.triggerRunId);
  if (opts.jobId) await db()`update job set status = 'running', trigger_run_id = ${opts.triggerRunId ?? null}, updated_at = now() where id = ${jobId}`;
  try {
    await setStep(jobId, "fetching Listing");
    const ingest = await ingestRestaurant(restaurantId, jobId, sleep, undefined, listingId);
    await finishJob(jobId);
    return { jobId, ingest };
  } catch (e) {
    await finishJob(jobId, toPipelineError(e));
    throw e;
  }
}

/** Retries one failed Crowd Source, then extracts its new Reviews and appends a re-judged Verdict. */
export async function runSourceRetry(
  restaurantId: number,
  listingId: number,
  questionId: number,
  sleep: Sleep,
  opts: { triggerRunId?: string; jobId?: number } = {},
) {
  const jobId = opts.jobId ?? await createJob("listing_fetch", restaurantId, opts.triggerRunId);
  if (opts.jobId) await db()`update job set status = 'running', trigger_run_id = ${opts.triggerRunId ?? null}, updated_at = now() where id = ${jobId}`;
  let stage: LookupStage = "ingest";
  try {
    const [beforeRetry] = await db()`select fetch_status from listing where id = ${listingId} and restaurant_id = ${restaurantId}`;
    let ingest: Awaited<ReturnType<typeof ingestRestaurant>> | null = null;
    if (beforeRetry?.fetch_status === "failed") {
      await setStep(jobId, "retrying failed Source");
      ingest = await ingestRestaurant(restaurantId, jobId, sleep, undefined, listingId);
    } else {
      await setStep(jobId, "re-judging fetched Reviews");
    }
    const [listing] = await db()`select fetch_status from listing where id = ${listingId} and restaurant_id = ${restaurantId}`;
    if (listing?.fetch_status !== "fetched") throw new PipelineError("vendor_error", SOURCE_FETCH_ERROR);
    stage = "extract";
    await setStep(jobId, "extracting new Reviews");
    const extraction = await extractRestaurant(restaurantId, jobId, sleep);
    stage = "judge";
    const judged = await judgeRestaurant(restaurantId, jobId, "owner_answer");
    await db()`update owner_question set status = 'answered', settled_at = now()
      where id = ${questionId} and restaurant_id = ${restaurantId} and kind = 'retry_source' and status = 'open'`;
    await finishJob(jobId);
    return { jobId, ingest, extraction, ...judged };
  } catch (error) {
    await finishJob(jobId, toPipelineError(error), stage);
    throw error;
  }
}

/** Extracts newly-fetched Reviews and re-issues a Verdict, bypassing the stability hold when `cause` is `owner_answer`. */
export async function runRejudge(
  restaurantId: number,
  sleep: Sleep,
  opts: { triggerRunId?: string; jobId?: number; cause?: RejudgeCause } = {},
) {
  const jobId = opts.jobId ?? await createJob("rejudge", restaurantId, opts.triggerRunId);
  if (opts.jobId) await db()`update job set status = 'running', trigger_run_id = ${opts.triggerRunId ?? null}, updated_at = now() where id = ${jobId}`;
  try {
    await setStep(jobId, "extracting new Reviews");
    const extraction = await extractRestaurant(restaurantId, jobId, sleep);
    const judged = await judgeRestaurant(restaurantId, jobId, opts.cause ?? "automatic");
    await finishJob(jobId);
    return { jobId, extraction, ...judged };
  } catch (e) {
    await finishJob(jobId, toPipelineError(e));
    throw e;
  }
}
