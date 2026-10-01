import { schedules } from "@trigger.dev/sdk";
import { closeDb } from "@/lib/db";
import { recordDatabaseSize } from "@/pipeline/database-size";

export const weeklyDatabaseSizeTask = schedules.task({
  id: "weekly-database-size",
  cron: { pattern: "0 3 * * 0", timezone: "Europe/Lisbon", environments: ["PRODUCTION"] },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 2 },
  run: async (payload) => {
    try {
      return await recordDatabaseSize(payload.timestamp);
    } finally {
      await closeDb();
    }
  },
});
