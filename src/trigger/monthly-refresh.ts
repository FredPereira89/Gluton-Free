import { schedules, wait } from "@trigger.dev/sdk";
import { closeDb } from "@/lib/db";
import { MONTHLY_REFRESH_START } from "@/lib/launch-gate";
import { runMonthlyRefresh } from "@/pipeline/monthly-refresh";

// Keep the monthly schedule, but begin refresh work in November 2026 (MONTHLY_REFRESH_START).

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
