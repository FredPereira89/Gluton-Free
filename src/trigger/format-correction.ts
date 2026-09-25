import { schemaTask, wait } from "@trigger.dev/sdk";
import { z } from "zod";
import { closeDb } from "@/lib/db";
import { runRejudge } from "@/pipeline/lookup";

// An owner-selected Format changes peer context, so issue a new Verdict without fetching Listings.
export const formatCorrectionTask = schemaTask({
  id: "owner-format-correction",
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
