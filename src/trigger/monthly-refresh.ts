import { schedules, wait } from "@trigger.dev/sdk";
import { closeDb } from "@/lib/db";
import { runMonthlyRefresh } from "@/pipeline/monthly-refresh";

// Refreshes Listings on the first morning of each month, then publishes a new Peer snapshot.
export const monthlyRefreshTask = schedules.task({
  id: "monthly-restaurant-refresh",
  cron: { pattern: "0 3 1 * *", timezone: "Europe/Lisbon", environments: ["PRODUCTION"] },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async (payload, { ctx }) => {
    try {
      return await runMonthlyRefresh((seconds) => wait.for({ seconds }), {
        triggerRunId: ctx.run.id,
        now: payload.timestamp,
      });
    } finally {
      await closeDb();
    }
  },
});
