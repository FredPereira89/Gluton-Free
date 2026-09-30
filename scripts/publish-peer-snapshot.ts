import { tasks } from "@trigger.dev/sdk";
import { closeDb, db } from "../src/lib/db";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: npx tsx --env-file=.env.local scripts/publish-peer-snapshot.ts");
  console.log("Builds a Peer snapshot from every Restaurant and re-judges every Verdict against it in Trigger.dev.");
  console.log("Spends Anthropic tokens only on explanations whose inputs changed.");
} else if (args.length) {
  console.error("This script takes no options except --help; unknown options were provided.");
  process.exitCode = 2;
} else {
  try {
    const sql = db();
    const [job] = await sql`
      insert into job (kind, restaurant_id, status, step)
      values ('snapshot', null, 'queued', 'Queued for Trigger.dev')
      returning id`;
    const jobId = Number(job!.id);
    try {
      const handle = await tasks.trigger("peer-snapshot-publish", { jobId }, { idempotencyKey: `peer-snapshot-${jobId}` });
      await sql`update job set trigger_run_id = ${handle.id}, updated_at = now() where id = ${jobId}`;
    } catch {
      await sql`
        update job set status = 'failed', step = 'Could not start Peer snapshot', error_code = 'task_start_failed',
          error_detail = 'Could not start the Peer snapshot publish in Trigger.dev.', finished_at = now(), updated_at = now()
        where id = ${jobId}`;
      throw new Error("Could not start the Peer snapshot publish in Trigger.dev");
    }
    console.log(`Peer snapshot Job ${jobId} started in Trigger.dev.`);
    let previousStep = "";
    for (;;) {
      const [current] = await sql`select status, step, progress, error_code, error_detail, llm_usage from job where id = ${jobId}`;
      if (!current) throw new Error(`Peer snapshot Job ${jobId} disappeared`);
      const step = String(current.step ?? "");
      if (step && step !== previousStep) {
        console.log(step);
        previousStep = step;
      }
      const costUsd = (current.llm_usage as { cost_usd: number }[]).reduce((sum, u) => sum + u.cost_usd, 0);
      if (current.status === "succeeded") {
        console.log(JSON.stringify({ jobId, llmCostUsd: costUsd, ...(current.progress as Record<string, unknown>) }, null, 2));
        break;
      }
      if (current.status === "failed") {
        console.error(JSON.stringify({ jobId, errorCode: current.error_code, error: current.error_detail, llmCostUsd: costUsd, ...(current.progress as Record<string, unknown>) }, null, 2));
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
