import { describe, expect, it } from "vitest";
import type { Tier } from "@/domain/aspects";
import { stabilizeTier, type StabilityVerdict } from "./stability";

const now = new Date("2026-10-01T12:00:00.000Z");

function verdict(tier: Tier, composite: number, food = 50, service = 50): StabilityVerdict {
  const tierFloors = tier === "good" ? [{ input: "food" as const, percentile: 40 }, { input: "service" as const, percentile: 25 }]
    : tier === "must_go" ? [{ input: "food" as const, percentile: 75 }, { input: "service" as const, percentile: 50 }]
      : [];
  return {
    tier, provisional: false, floorCap: null, tierFloors, ceilingNote: null,
    compositeStanding: { percentile: composite },
    standings: [
      { input: "food", percentile: food },
      { input: "service", percentile: service },
    ],
    redFlags: [],
  };
}

describe("Tier stability between automatic re-judges", () => {
  it("holds a one-point crossing and moves at two points beyond the Good boundary", () => {
    const previous = verdict("ok", 44);
    const held = stabilizeTier(verdict("good", 46), previous, "automatic", now);
    expect(held.tier).toBe("ok");
    const moved = stabilizeTier(verdict("good", 47), held, "automatic", now);
    expect(moved.tier).toBe("good");
    expect(moved.tierChange).toEqual({ from: "ok", at: now.toISOString() });
    expect(moved.tierChangedNow).toBe(true);
    expect(held.tierChangedNow).toBe(false);
  });

  it("also holds a one-point downward crossing and moves at two points", () => {
    const previous = verdict("good", 45);
    expect(stabilizeTier(verdict("ok", 44), previous, "automatic", now).tier).toBe("good");
    expect(stabilizeTier(verdict("ok", 43), previous, "automatic", now).tier).toBe("ok");
  });

  it("moves when a floor is clearly failed even while the composite stays put", () => {
    const previous = verdict("good", 60, 40);
    const held = stabilizeTier(verdict("ok", 60, 39), previous, "automatic", now);
    expect(held.tier).toBe("good");
    expect(stabilizeTier(verdict("ok", 60, 38), held, "automatic", now).tier).toBe("ok");
  });

  it("moves when a floor is clearly passed after a held re-judge", () => {
    const previous = verdict("ok", 60, 39);
    previous.floorCap = "Good floor not met: food below P40";
    const held = stabilizeTier(verdict("good", 60, 41), previous, "automatic", now);
    expect(held.tier).toBe("ok");
    expect(held.floorCap).toBeNull();
    expect(held.tierHeld).toBe(true);
    expect(stabilizeTier(verdict("good", 60, 42), held, "automatic", now).tier).toBe("good");
  });

  it("applies a forcing Red flag immediately", () => {
    const previous = verdict("good", 60);
    const current = verdict("avoid", 60);
    current.redFlags = [{ forcesAvoid: true }];
    expect(stabilizeTier(current, previous, "automatic", now).tier).toBe("avoid");
  });

  it("applies an owner answer immediately and retains the last transition through held re-judges", () => {
    const previous = verdict("ok", 44);
    const ownerResult = stabilizeTier(verdict("good", 45), previous, "owner_answer", now);
    expect(ownerResult.tier).toBe("good");
    const later = stabilizeTier(verdict("ok", 44), ownerResult, "automatic", new Date("2026-11-01T12:00:00.000Z"));
    expect(later.tier).toBe("good");
    expect(later.tierChange).toEqual({ from: "ok", at: now.toISOString() });
    // The move happened at `ownerResult`'s re-judge, not this later held one: only the former is fresh.
    expect(ownerResult.tierChangedNow).toBe(true);
    expect(later.tierChangedNow).toBe(false);
  });
});
