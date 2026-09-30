import { describe, expect, it } from "vitest";
import { midRank } from "./peer";

describe("midRank", () => {
  it("ranks a value tied with stored Peer θ at the middle of the tie, despite the snapshot's 5-place rounding", () => {
    const stored = [-0.5, 0.12346, 0.12346, 0.12346, 0.9];
    // 0.123459 and 0.123461 are the same Restaurant θ before and after rounding to 5 places.
    expect(midRank(stored, 0.123459)).toBe(50);
    expect(midRank(stored, 0.123461)).toBe(50);
  });

  it("still separates θ that differ by more than the rounding", () => {
    expect(midRank([0.1, 0.2, 0.3], 0.25)).toBeCloseTo(200 / 3, 10);
  });
});
