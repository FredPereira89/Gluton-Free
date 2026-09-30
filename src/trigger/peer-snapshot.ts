import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { closeDb } from "@/lib/db";
import { runPeerSnapshotPublish } from "@/pipeline/snapshot-publish";

// Publishes a Peer snapshot and re-judges every Verdict against it. Started by the maintainer
// (scripts/publish-peer-snapshot.ts); there is no API endpoint for it.
export const peerSnapshotTask = schemaTask({
  id: "peer-snapshot-publish",
  schema: z.object({ jobId: z.number().int().positive() }),
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async ({ jobId }, { ctx }) => {
    try {
      return await runPeerSnapshotPublish({ jobId, triggerRunId: ctx.run.id });
    } finally {
      await closeDb();
    }
  },
});
