import { emptyUsage, JUDGE_MODEL } from "../src/analysis/llm";
import { closeDb, db } from "../src/lib/db";
import { addLlmUsage, createJob, finishJob, setStep } from "../src/lib/job";
import { toPipelineError } from "../src/lib/pipeline-error";
import { issueVerdict } from "../src/verdict/issue";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

if (flag("--help") || flag("-h")) {
  console.log("Usage: npx tsx --env-file=.env.local scripts/issue-baseline-verdicts.ts (--limit N | --all) [--max-usd 3]");
  console.log("Issues a Verdict from already-stored Reviews and analyses for every baseline Restaurant that has none,");
  console.log("and records a lookup Job so it appears in the Restaurants list. No vendor fetching; Anthropic tokens only.");
} else if ((!flag("--all") && !value("--limit")) || args.some((a) => a.startsWith("-") && !["--all", "--limit", "--max-usd"].includes(a))) {
  console.error("Pass --limit N or --all (and optionally --max-usd N).");
  process.exitCode = 2;
} else {
  const limit = flag("--all") ? null : Number(value("--limit"));
  const maxUsd = Number(value("--max-usd") ?? "3");
  if ((limit !== null && !(limit > 0)) || !(maxUsd > 0)) {
    console.error("--limit and --max-usd must be positive numbers.");
    process.exitCode = 2;
  } else {
    try {
      const sql = db();
      const rows = await sql`
        select r.id, r.name from restaurant r
        where r.baseline_sampled
          and not exists (select 1 from verdict v where v.restaurant_id = r.id)
          and not exists (select 1 from job j where j.restaurant_id = r.id and j.kind = 'lookup' and j.status = 'running')
        order by r.id
        ${limit ? sql`limit ${limit}` : sql``}`;
      console.log(`${rows.length} baseline Restaurant(s) to judge; LLM cap $${maxUsd}.`);
      let spent = 0, done = 0, rewritten = 0;
      const failed: { id: number; error: string }[] = [];
      for (const row of rows) {
        if (spent >= maxUsd) { console.log(`LLM cap reached at $${spent.toFixed(4)}; stopping.`); break; }
        const restaurantId = Number(row.id);
        const jobId = await createJob("lookup", restaurantId);
        const usage = emptyUsage("explain", JUDGE_MODEL, false);
        try {
          await setStep(jobId, "judging from stored baseline Reviews", { origin: "baseline" });
          await issueVerdict(restaurantId, jobId, usage, "automatic");
          if (usage.requests) await addLlmUsage(jobId, usage);
          await setStep(jobId, "judged from stored baseline Reviews", { origin: "baseline" });
          await finishJob(jobId);
          done++;
          if (usage.requests) rewritten++;
        } catch (error) {
          if (usage.requests) await addLlmUsage(jobId, usage);
          await finishJob(jobId, toPipelineError(error));
          failed.push({ id: restaurantId, error: error instanceof Error ? error.message : String(error) });
        }
        spent += usage.cost_usd;
      }
      console.log(JSON.stringify({ judged: done, explanationsWritten: rewritten, failed, llmCostUsd: Number(spent.toFixed(4)) }, null, 2));
      if (failed.length) process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    } finally {
      await closeDb();
    }
  }
}
