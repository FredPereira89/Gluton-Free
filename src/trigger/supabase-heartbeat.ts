import { schedules } from "@trigger.dev/sdk";
import { closeDb, db } from "@/lib/db";

export const supabaseHeartbeatTask = schedules.task({
  id: "supabase-daily-heartbeat",
  cron: { pattern: "0 4 * * *", timezone: "Europe/Lisbon", environments: ["PRODUCTION"] },
  run: async () => {
    try {
      await db()`select now() as heartbeat_at`;
      return { database: "reachable" };
    } finally {
      await closeDb();
    }
  },
});
