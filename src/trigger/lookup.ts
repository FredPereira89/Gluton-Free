import { schemaTask, wait } from "@trigger.dev/sdk";
import { z } from "zod";
import { closeDb } from "@/lib/db";
import { runLookup } from "@/pipeline/lookup";

// One Restaurant lookup. Waits on DataForSEO and the Message Batch are checkpointed, so the
// hours a batch may take cost no compute.
export const lookupTask = schemaTask({
  id: "restaurant-lookup",
  schema: z.object({
    restaurantId: z.number().int().positive(),
    from: z.enum(["ingest", "extract", "judge"]).optional(),
  }),
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async ({ restaurantId, from }, { ctx }) => {
    try {
      return await runLookup(restaurantId, (seconds) => wait.for({ seconds }), { from, triggerRunId: ctx.run.id });
    } finally {
      await closeDb();
    }
  },
});
