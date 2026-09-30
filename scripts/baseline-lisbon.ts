import { tasks } from "@trigger.dev/sdk";
import { closeDb, db } from "../src/lib/db";

const args = new Set(process.argv.slice(2));
const help = args.has("--help") || args.has("-h");
const persist = args.has("--persist");
const unknown = [...args].filter((arg) => !["--help", "-h", "--persist", "--dry-run"].includes(arg));

if (help) {
  console.log("Usage: npx tsx --env-file=.env.local scripts/baseline-lisbon.ts [--dry-run | --persist]");
  console.log("Default: Trigger.dev dry run; creates a Job, makes billable DataForSEO calls, and writes no candidates.");
  console.log("--persist: also insert eligible Restaurants and Google Listings after the sweep.");
} else if (unknown.length || (persist && args.has("--dry-run"))) {
  console.error("Use --dry-run or --persist; unknown or conflicting options were provided.");
  process.exitCode = 2;
} else {
  try {
    const sql = db();
    const [job] = await sql`
      insert into job (kind, restaurant_id, status, step, progress)
      values ('baseline', null, 'queued', 'Queued for Trigger.dev', ${sql.json({ persist } as never)})
      returning id
    `;
    const jobId = Number(job!.id);

    try {
      const handle = await tasks.trigger("lisbon-baseline-sweep", { jobId, persist }, {
        idempotencyKey: `lisbon-baseline-${jobId}`,
      });
      await sql`update job set trigger_run_id = ${handle.id}, updated_at = now() where id = ${jobId}`;
    } catch {
      await sql`
        update job set status = 'failed', step = 'Could not start Lisbon baseline', error_code = 'task_start_failed',
          error_detail = 'Could not start the Lisbon baseline in Trigger.dev.', finished_at = now(), updated_at = now()
        where id = ${jobId}
      `;
      throw new Error("Could not start the Lisbon baseline in Trigger.dev");
    }

    console.log(`Baseline Job ${jobId} started in Trigger.dev.`);
    let previousStep = "";
    for (;;) {
      const [current] = await sql`
        select status, step, progress, error_code, error_detail, vendor_cost_usd
        from job where id = ${jobId}
      `;
      if (!current) throw new Error(`Baseline Job ${jobId} disappeared`);
      const step = String(current.step ?? "");
      if (step && step !== previousStep) {
        console.log(step);
        previousStep = step;
      }
      if (current.status === "succeeded") {
        console.log(JSON.stringify({
          jobId,
          mode: persist ? "persist" : "dry-run (no candidate writes; DataForSEO calls are billable)",
          vendorCostUsd: Number(current.vendor_cost_usd),
          ...(current.progress as Record<string, unknown>),
        }, null, 2));
        break;
      }
      if (current.status === "failed") {
        console.error(JSON.stringify({
          jobId,
          status: current.status,
          errorCode: current.error_code,
          error: current.error_detail,
          vendorCostUsd: Number(current.vendor_cost_usd),
        }, null, 2));
        process.exitCode = 1;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
