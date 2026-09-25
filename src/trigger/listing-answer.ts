import { schemaTask, wait } from "@trigger.dev/sdk";
import { z } from "zod";
import { closeDb } from "@/lib/db";
import { runListingFetch, runRejudge } from "@/pipeline/lookup";

// An owner's Accept answer: fetch the newly-chosen Listing, then re-judge without the stability
// hold. Two Jobs (listing_fetch, rejudge) so progress is visible per ADR-0005's "never wait" design.
export const listingAnswerTask = schemaTask({
  id: "owner-listing-answer",
  schema: z.object({
    restaurantId: z.number().int().positive(),
    listingId: z.number().int().positive(),
    fetchJobId: z.number().int().positive(),
  }),
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async ({ restaurantId, listingId, fetchJobId }, { ctx }) => {
    try {
      const sleep = (seconds: number) => wait.for({ seconds });
      const fetched = await runListingFetch(restaurantId, listingId, sleep, { jobId: fetchJobId, triggerRunId: ctx.run.id });
      const rejudged = await runRejudge(restaurantId, sleep, { cause: "owner_answer", triggerRunId: ctx.run.id });
      return { fetched, rejudged };
    } finally {
      await closeDb();
    }
  },
});
