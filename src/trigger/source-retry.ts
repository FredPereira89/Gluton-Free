import { schemaTask, wait } from "@trigger.dev/sdk";
import { z } from "zod";
import { closeDb } from "@/lib/db";
import { runSourceRetry } from "@/pipeline/lookup";

// Re-fetch only the failed Listing, then extract its new Reviews and append a Verdict.
export const sourceRetryTask = schemaTask({
  id: "owner-source-retry",
  schema: z.object({
    restaurantId: z.number().int().positive(),
    listingId: z.number().int().positive(),
    questionId: z.number().int().positive(),
    jobId: z.number().int().positive(),
  }),
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async ({ restaurantId, listingId, questionId, jobId }, { ctx }) => {
    try {
      return await runSourceRetry(restaurantId, listingId, questionId, (seconds) => wait.for({ seconds }), {
        jobId,
        triggerRunId: ctx.run.id,
      });
    } finally {
      await closeDb();
    }
  },
});
