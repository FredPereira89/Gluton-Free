import { schedules, wait } from "@trigger.dev/sdk";
import { closeDb } from "@/lib/db";
import { runMonthlyRefresh } from "@/pipeline/monthly-refresh";

// Keep the monthly schedule, but begin refresh work in November 2026.
const MONTHLY_REFRESH_START = new Date("2026-11-01T00:00:00.000Z");

export const monthlyRefreshTask = schedules.task({
  id: "monthly-restaurant-refresh",
  cron: { pattern: "0 3 1 * *", timezone: "Europe/Lisbon", environments: ["PRODUCTION"] },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async (payload, { ctx }) => {
    if (payload.timestamp < MONTHLY_REFRESH_START) {
      return { skipped: true, startsAt: MONTHLY_REFRESH_START.toISOString() };
    }
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
