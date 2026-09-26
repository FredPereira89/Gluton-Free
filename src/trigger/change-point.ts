import { schemaTask, wait } from "@trigger.dev/sdk";
import { z } from "zod";
import { closeDb, db } from "@/lib/db";
import { runRejudge } from "@/pipeline/lookup";
import { loadNewestChangePoint } from "@/verdict/issue";
import { PARAMS, reviewWindowCutoff } from "@/verdict/rollup";

// Rejudge after an owner declares or deletes a Change point, skipping the tier stability hold for this explicit change.
export const changePointTask = schemaTask({
  id: "owner-change-point",
  schema: z.object({
    restaurantId: z.number().int().positive(),
    jobId: z.number().int().positive(),
  }),
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async ({ restaurantId, jobId }, { ctx }) => {
    try {
      // The API queues this task inside the Change point transaction. Wait until that
      // transaction commits before reading the governing point or updating its Job.
      let committed = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        const [job] = await db()`select id from job where id = ${jobId} and restaurant_id = ${restaurantId}`;
        if (job) { committed = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!committed) throw new Error(`Change point Job ${jobId} was not committed`);
      const changePoint = await loadNewestChangePoint(restaurantId);
      return await runRejudge(restaurantId, (seconds) => wait.for({ seconds }), {
        jobId,
        triggerRunId: ctx.run.id,
        cause: "owner_answer",
        extractWindow: { since: reviewWindowCutoff(new Date(), changePoint?.date ?? null), maxPerSource: PARAMS.reviewWindowCap },
      });
    } finally {
      await closeDb();
    }
  },
});
