import { schemaTask, wait } from "@trigger.dev/sdk";
import { z } from "zod";
import { closeDb, db } from "@/lib/db";
import { runLisbonBaselineSweep } from "@/pipeline/baseline";
import { persistBaselineCandidates } from "@/pipeline/baseline-persistence";

// The baseline can fan out to many DataForSEO calls; checkpoint Review polling in Trigger.dev.
export const lisbonBaselineTask = schemaTask({
  id: "lisbon-baseline-sweep",
  schema: z.object({ jobId: z.number().int().positive(), persist: z.boolean().default(false) }),
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async ({ jobId, persist }, { ctx }) => {
    const sql = db();
    try {
      const [job] = await sql`
        update job set status = 'running', step = 'Starting Lisbon baseline', trigger_run_id = ${ctx.run.id}, updated_at = now()
          where id = ${jobId} and kind = 'baseline'
        returning id
      `;
      if (!job) throw new Error("Lisbon baseline Job was not found");
      const report = await runLisbonBaselineSweep(new Date(), {
        sleep: (seconds) => wait.for({ seconds }),
        onProgress: async (step) => {
          await sql`update job set step = ${step}, progress = ${sql.json({ phase: step } as never)}, updated_at = now() where id = ${jobId}`;
        },
        onVendorCost: async (costUsd) => {
          await sql`update job set vendor_cost_usd = vendor_cost_usd + ${costUsd}, updated_at = now() where id = ${jobId}`;
        },
      });
      const persistedCount = persist ? await persistBaselineCandidates(report.candidates) : 0;
      const summary = {
        candidateCount: report.candidates.length,
        countsByFormat: report.countsByFormat,
        dropped: report.dropped,
        costsUsd: report.costs,
        ...(persist ? { persistedCount } : {}),
      };
      await sql`
        update job set status = 'succeeded', step = 'Lisbon baseline complete', progress = ${sql.json(summary as never)},
          finished_at = now(), updated_at = now()
        where id = ${jobId}
      `;
      return summary;
    } catch (error) {
      await sql`
        update job set status = 'failed', step = 'Lisbon baseline failed', error_code = 'baseline_failed',
          error_detail = 'The Lisbon baseline sweep failed. Review Trigger.dev logs before retrying.',
          finished_at = now(), updated_at = now()
        where id = ${jobId}
      `;
      throw error;
    } finally {
      await closeDb();
    }
  },
});
