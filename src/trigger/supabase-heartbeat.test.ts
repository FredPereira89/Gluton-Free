import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, closeDb } = vi.hoisted(() => ({
  query: vi.fn(),
  closeDb: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: () => query,
  closeDb,
}));

vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: vi.fn((definition) => definition),
  },
}));

import { supabaseHeartbeatTask } from "./supabase-heartbeat";

type HeartbeatDefinition = {
  id: string;
  cron: { pattern: string; timezone: string; environments: string[] };
  run: (payload: { timestamp: Date }) => Promise<unknown>;
};

const heartbeat = supabaseHeartbeatTask as unknown as HeartbeatDefinition;

describe("Supabase heartbeat schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue([{ checked_at: new Date("2026-10-01T03:00:00.000Z") }]);
    closeDb.mockResolvedValue(undefined);
  });

  it("registers a daily production schedule in Lisbon time", () => {
    expect(heartbeat.id).toBe("supabase-daily-heartbeat");
    expect(heartbeat.cron).toEqual({
      pattern: "0 4 * * *",
      timezone: "Europe/Lisbon",
      environments: ["PRODUCTION"],
    });
  });

  it("queries the database and closes the connection", async () => {
    await expect(heartbeat.run({ timestamp: new Date("2026-10-01T03:00:00.000Z") }))
      .resolves.toEqual({ database: "reachable" });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]?.[0]).toMatch(/select\s+now\(\)/i);
    expect(closeDb).toHaveBeenCalledTimes(1);
  });

  it("lets database failures fail the Trigger.dev run", async () => {
    const failure = new Error("database unavailable");
    query.mockRejectedValueOnce(failure);

    await expect(heartbeat.run({ timestamp: new Date("2026-10-01T03:00:00.000Z") }))
      .rejects.toBe(failure);
    expect(closeDb).toHaveBeenCalledTimes(1);
  });
});
