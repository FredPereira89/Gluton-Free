// Publishes a Peer snapshot and re-judges every Verdict against it (ADR 0003, issue #70).
// Re-judges are automatic, so Tier stability applies; `issueVerdict` copies an explanation
// forward when its inputs are unchanged, so only changed ones cost an LLM call.
import { emptyUsage, JUDGE_MODEL } from "@/analysis/llm";
import { db } from "@/lib/db";
import { addLlmUsage, createJob, finishJob, setStep } from "@/lib/job";
import { PipelineError, toPipelineError } from "@/lib/pipeline-error";
import { issueVerdict } from "@/verdict/issue";
import { buildPeerSnapshot } from "@/verdict/snapshot-build";
import { loadPeerCandidates, storePeerSnapshot } from "@/verdict/snapshot-store";

export async function runPeerSnapshotPublish(opts: { triggerRunId?: string; jobId?: number; now?: Date } = {}) {
  const jobId = opts.jobId ?? await createJob("snapshot", null, opts.triggerRunId);
  try {
    if (opts.jobId) await db()`update job set status = 'running', trigger_run_id = ${opts.triggerRunId ?? null}, updated_at = now() where id = ${jobId}`;
    const now = opts.now ?? new Date();
    await setStep(jobId, "building Peer snapshot");
    const built = buildPeerSnapshot(await loadPeerCandidates(now), now);
    const snapshotId = await storePeerSnapshot(built);
    await setStep(jobId, "re-judging Verdicts", { snapshotId, month: built.month, members: built.members.length, groups: built.groups.length });

    const restaurants = await db()`select distinct restaurant_id from verdict order by restaurant_id`;
    let rejudged = 0, rewritten = 0, copied = 0;
    const failed: number[] = [];
    for (const { restaurant_id } of restaurants) {
      const restaurantId = Number(restaurant_id);
      const usage = emptyUsage("explain", JUDGE_MODEL, false);
      let ok = true;
      try {
        await issueVerdict(restaurantId, jobId, usage, "automatic");
      } catch (error) {
        console.error(`Peer snapshot re-judge failed for Restaurant ${restaurantId}`, error);
        failed.push(restaurantId);
        ok = false;
      }
      // Tokens spent before a failure are still the job's cost.
      if (usage.requests) await addLlmUsage(jobId, usage);
      if (!ok) continue;
      rejudged++;
      if (usage.requests) rewritten++;
      else copied++;
    }
    const summary = { snapshotId, rejudged, rewritten, copied, failed };
    await setStep(jobId, "Peer snapshot published", summary);
    if (failed.length) throw new PipelineError("rejudge_failed", `${failed.length} Verdict(s) could not be re-judged against snapshot ${snapshotId}; Restaurants ${failed.join(", ")}.`);
    await finishJob(jobId);
    return { jobId, ...summary };
  } catch (error) {
    await finishJob(jobId, toPipelineError(error));
    throw error;
  }
}
