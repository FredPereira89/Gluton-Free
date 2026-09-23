// The lookup pipeline: fetch every Listing, extract per-Review Aspects, verify Red flags, and
// issue a Verdict. Waiting is injected so the same code runs locally (setTimeout) and in
// Trigger.dev (checkpointed wait.for, which costs no compute while it waits).
import { batchEnded, collectBatch, extractSync, submitBatch, type ExtractInput, type Extracted } from "@/analysis/extract";
import { emptyUsage, EXTRACT_MODEL, JUDGE_MODEL } from "@/analysis/llm";
import { pendingExtraction, saveAnalyses } from "@/analysis/store";
import { verifyPendingFlags } from "@/analysis/verify";
import { depthFor, getReviewTask, postReviewTask, type DfsSource, type ReviewTaskParams } from "@/ingest/dataforseo";
import { normaliseGoogle, normaliseTripadvisor } from "@/ingest/normalise";
import { storeListingFetch } from "@/ingest/store";
import { db } from "@/lib/db";
import { addLlmUsage, addVendorCost, createJob, finishJob, setStep, type LlmUsage } from "@/lib/job";
import { issueVerdict } from "@/verdict/issue";

export type Sleep = (seconds: number) => Promise<void>;
export const localSleep: Sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

const SYNC_FIRST = 300; // newest Reviews go through the sync path so a Verdict can show sooner
const POLL_VENDOR_S = 30;
const POLL_BATCH_S = 60;
const MAX_WAIT_S = 3 * 3600;

type ListingRow = { id: number; source: DfsSource; placeRef: string };

function taskParams(l: ListingRow, depth: number): ReviewTaskParams {
  return l.source === "google" ? { source: "google", placeId: l.placeRef, depth } : { source: "tripadvisor", urlPath: l.placeRef, depth };
}

/** Posts tasks for every listing and polls them together until each returns a result. */
async function runVendorTasks(
  listings: ListingRow[],
  depthOf: (l: ListingRow) => number,
  jobId: number,
  sleep: Sleep,
): Promise<Map<number, unknown>> {
  const posted = new Map<number, string>();
  for (const l of listings) {
    const { taskId, cost } = await postReviewTask(taskParams(l, depthOf(l)));
    await addVendorCost(jobId, cost);
    posted.set(l.id, taskId);
  }
  const results = new Map<number, unknown>();
  for (let waited = 0; results.size < listings.length; waited += POLL_VENDOR_S) {
    if (waited > MAX_WAIT_S) throw new Error("DataForSEO tasks did not finish within 3 hours");
    await sleep(POLL_VENDOR_S);
    for (const l of listings) {
      if (results.has(l.id)) continue;
      const got = await getReviewTask(l.source, posted.get(l.id)!);
      if (!got) continue;
      if (got.cost) await addVendorCost(jobId, got.cost);
      results.set(l.id, got.result);
    }
  }
  return results;
}

/** Fetches every Review of every Listing: a depth-10 probe for the count, then the full depth. */
export async function ingestRestaurant(restaurantId: number, jobId: number, sleep: Sleep) {
  const sql = db();
  const rows = await sql`select id, source_code, place_ref from listing where restaurant_id = ${restaurantId} order by id`;
  const listings: ListingRow[] = rows.map((r) => ({ id: Number(r.id), source: r.source_code as DfsSource, placeRef: r.place_ref as string }));
  await sql`update listing set fetch_status = 'fetching', fetch_error = null where restaurant_id = ${restaurantId}`;
  try {
    await setStep(jobId, "probing Listings");
    const probes = await runVendorTasks(listings, () => 10, jobId, sleep);
    const expected = new Map<number, number>();
    for (const l of listings) {
      const n = (l.source === "google" ? normaliseGoogle : normaliseTripadvisor)(probes.get(l.id));
      expected.set(l.id, n.facts.reviewCount ?? 0);
    }
    await setStep(jobId, "fetching Reviews", { expected: Object.fromEntries(listings.map((l) => [l.source, expected.get(l.id)])) });

    const full = await runVendorTasks(listings, (l) => depthFor(expected.get(l.id) ?? 0), jobId, sleep);
    const summary: Record<string, { fetched: number; inserted: number; droppedThirdParty: number }> = {};
    for (const l of listings) {
      const n = (l.source === "google" ? normaliseGoogle : normaliseTripadvisor)(full.get(l.id));
      full.delete(l.id); // drop the raw vendor payload as soon as it is whitelisted
      const { inserted } = await storeListingFetch(l.id, n);
      summary[l.source] = { fetched: n.reviews.length, inserted, droppedThirdParty: n.droppedThirdParty };
    }
    await setStep(jobId, "Reviews stored", { fetched: summary });
    return summary;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sql`update listing set fetch_status = 'failed', fetch_error = ${msg} where restaurant_id = ${restaurantId} and fetch_status = 'fetching'`;
    throw e;
  }
}

async function save(results: Map<number, Extracted>, items: ExtractInput[]) {
  await saveAnalyses(results, new Map(items.map((i) => [i.id, i.text])));
}

/** Extracts Aspects for every text Review not yet analysed: newest by sync, the rest by batch, then a sync retry. */
export async function extractRestaurant(restaurantId: number, jobId: number, sleep: Sleep) {
  const pending = await pendingExtraction(restaurantId);
  const first = pending.slice(0, SYNC_FIRST);
  const rest = pending.slice(SYNC_FIRST);

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

  const missing = await pendingExtraction(restaurantId);
  if (missing.length) {
    await setStep(jobId, "re-extracting missed Reviews");
    const retryUsage = emptyUsage("extract-retry", EXTRACT_MODEL, false);
    await save(await extractSync(missing, retryUsage), missing);
    await addLlmUsage(jobId, retryUsage);
  }
  const left = (await pendingExtraction(restaurantId)).length;
  await setStep(jobId, "extraction done", { extraction: { pending: pending.length, unanalysed: left } });
  return { pending: pending.length, unanalysed: left };
}

/** Verifies pending Red flags and issues a Verdict. */
export async function judgeRestaurant(restaurantId: number, jobId: number) {
  await setStep(jobId, "verifying Red flags");
  const verifyUsage: LlmUsage = emptyUsage("verify-flags", JUDGE_MODEL, false);
  const flags = await verifyPendingFlags(restaurantId, verifyUsage);
  await addLlmUsage(jobId, verifyUsage);

  await setStep(jobId, "issuing Verdict");
  const explainUsage = emptyUsage("explain", JUDGE_MODEL, false);
  const verdictId = await issueVerdict(restaurantId, jobId, explainUsage);
  await addLlmUsage(jobId, explainUsage);
  return { flags, verdictId };
}

export type LookupStage = "ingest" | "extract" | "judge";

/** The whole lookup, as one Job. `from` lets a re-run skip stages that already completed. */
export async function runLookup(restaurantId: number, sleep: Sleep, opts: { from?: LookupStage; triggerRunId?: string } = {}) {
  const jobId = await createJob("lookup", restaurantId, opts.triggerRunId);
  const from = opts.from ?? "ingest";
  try {
    const ingest = from === "ingest" ? await ingestRestaurant(restaurantId, jobId, sleep) : null;
    const extraction = from !== "judge" ? await extractRestaurant(restaurantId, jobId, sleep) : null;
    const judged = await judgeRestaurant(restaurantId, jobId);
    await finishJob(jobId);
    return { jobId, ingest, extraction, ...judged };
  } catch (e) {
    await finishJob(jobId, e instanceof Error ? e.message : String(e));
    throw e;
  }
}
