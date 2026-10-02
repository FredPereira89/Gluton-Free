import { describe, expect, it } from "vitest";
import { drawVerdictSample, monthlyRefreshEvidence, type GateJob } from "./launch-gate";

const since = new Date("2026-11-01T00:00:00Z");
const job = (over: Partial<GateJob>): GateJob => ({
  id: 1, kind: "refresh", status: "succeeded", triggerRunId: "run_a",
  createdAt: new Date("2026-11-01T02:00:00Z"), snapshotId: null, ...over,
});

describe("drawVerdictSample", () => {
  const pool = Array.from({ length: 100 }, (_, i) => ({ restaurantId: i + 1 }));

  it("draws n distinct Restaurants and repeats for the same seed", () => {
    const a = drawVerdictSample(pool, 20, "gate-8");
    expect(a).toHaveLength(20);
    expect(new Set(a.map((r) => r.restaurantId)).size).toBe(20);
    expect(drawVerdictSample(pool, 20, "gate-8")).toEqual(a);
  });

  it("draws a different sample for a different seed", () => {
    expect(drawVerdictSample(pool, 20, "gate-8")).not.toEqual(drawVerdictSample(pool, 20, "other"));
  });

  it("returns every candidate when fewer than n exist, and leaves the pool untouched", () => {
    const small = pool.slice(0, 5);
    expect(drawVerdictSample(small, 20, "s")).toHaveLength(5);
    expect(small).toEqual(pool.slice(0, 5));
  });
});

describe("monthlyRefreshEvidence", () => {
  it("passes when one scheduled run refreshed Restaurants and published a snapshot", () => {
    const result = monthlyRefreshEvidence([
      job({ id: 1 }), job({ id: 2 }),
      job({ id: 3, kind: "snapshot", snapshotId: 9 }),
    ], since);
    expect(result.passed).toBe(true);
    expect(result.runs).toEqual([{ triggerRunId: "run_a", refreshed: 2, snapshotId: 9 }]);
  });

  it("fails with no jobs, saying the refresh has not run", () => {
    const result = monthlyRefreshEvidence([], since);
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/no monthly refresh/i);
  });

  it("ignores jobs from before the refresh start date", () => {
    const early = new Date("2026-10-15T00:00:00Z");
    const result = monthlyRefreshEvidence([
      job({ createdAt: early }), job({ id: 3, kind: "snapshot", snapshotId: 9, createdAt: early }),
    ], since);
    expect(result.passed).toBe(false);
  });

  it("does not count a snapshot published by hand, with no refresh jobs in its run", () => {
    const result = monthlyRefreshEvidence([job({ id: 3, kind: "snapshot", snapshotId: 9 })], since);
    expect(result.passed).toBe(false);
  });

  it("does not count a run where any refresh failed", () => {
    const result = monthlyRefreshEvidence([
      job({ id: 1 }), job({ id: 2, status: "failed" }),
      job({ id: 3, kind: "snapshot", snapshotId: 9 }),
    ], since);
    expect(result.passed).toBe(false);
  });

  it("does not count a run whose snapshot job did not succeed or has no snapshot id", () => {
    expect(monthlyRefreshEvidence([job({ id: 1 }), job({ id: 3, kind: "snapshot", status: "failed", snapshotId: 9 })], since).passed).toBe(false);
    expect(monthlyRefreshEvidence([job({ id: 1 }), job({ id: 3, kind: "snapshot", snapshotId: null })], since).passed).toBe(false);
  });

  it("ignores jobs with no Trigger.dev run id", () => {
    const result = monthlyRefreshEvidence([
      job({ id: 1, triggerRunId: null }), job({ id: 3, kind: "snapshot", snapshotId: 9, triggerRunId: null }),
    ], since);
    expect(result.passed).toBe(false);
  });
});
