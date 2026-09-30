import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { closeDb } from "@/lib/db";
import { runTheForkMatch } from "@/pipeline/thefork-match";

// Runs beside the Lookup: a TheFork failure ends only this Job and never the Verdict.
export const theForkMatchTask = schemaTask({
  id: "thefork-match",
  schema: z.object({
    restaurantId: z.number().int().positive(),
    jobId: z.number().int().positive(),
  }),
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async ({ restaurantId, jobId }, { ctx }) => {
    try {
      return await runTheForkMatch(restaurantId, { jobId, triggerRunId: ctx.run.id });
    } finally {
      await closeDb();
    }
  },
});
