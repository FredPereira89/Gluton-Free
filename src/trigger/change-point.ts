import { schemaTask, wait } from "@trigger.dev/sdk";
import { z } from "zod";
import { closeDb } from "@/lib/db";
import { runRejudge } from "@/pipeline/lookup";

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
      return await runRejudge(restaurantId, (seconds) => wait.for({ seconds }), {
        jobId,
        triggerRunId: ctx.run.id,
        cause: "owner_answer",
      });
    } finally {
      await closeDb();
    }
  },
});
