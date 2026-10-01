import { describe, expect, it } from "vitest";
import { TREND_PARAMS, trendOf, trendSlope, type TrendPoint } from "./trend";

const NOW = new Date("2026-10-15T00:00:00Z"); // current quarter 2026-Q4; the year runs from 2025-Q4
const QUARTERS = ["2025-Q3", "2025-Q4", "2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"];
const CUT = TREND_PARAMS.slopeCut;

/** One point per quarter from 2025-Q4 on, stepping `perQuarter` Peer-percentile points each quarter. */
function line(perQuarter: number, quarters = QUARTERS.slice(1)): TrendPoint[] {
  return quarters.map((quarter, i) => ({ quarter, compositePercentile: 50 + perQuarter * i, textVolume: 10 }));
}

describe("trendSlope", () => {
  it("is the least-squares slope in percentile points per year", () => {
    expect(trendSlope(line(5), NOW)).toBeCloseTo(20, 6);
    expect(trendSlope(line(-3), NOW)).toBeCloseTo(-12, 6);
  });

  it("leans on the quarters with more text Reviews", () => {
    const series: TrendPoint[] = [
      { quarter: "2025-Q4", compositePercentile: 50, textVolume: 40 },
      { quarter: "2026-Q1", compositePercentile: 50, textVolume: 40 },
      { quarter: "2026-Q2", compositePercentile: 50, textVolume: 40 },
      { quarter: "2026-Q3", compositePercentile: 90, textVolume: 1 },
    ];
    expect(trendSlope(series, NOW)!).toBeLessThan(10);
  });

  it("ignores quarters older than the year and quarters without a standing", () => {
    const series: TrendPoint[] = [
      { quarter: "2025-Q3", compositePercentile: 0, textVolume: 10 },
      { quarter: "2025-Q4", compositePercentile: 50, textVolume: 10 },
      { quarter: "2026-Q1", compositePercentile: null, textVolume: 10 },
      { quarter: "2026-Q2", compositePercentile: 50, textVolume: 10 },
      { quarter: "2026-Q3", compositePercentile: 50, textVolume: 10 },
    ];
    expect(trendSlope(series, NOW)).toBeCloseTo(0, 6);
  });

  it("is null with fewer than three quarters standing in the year", () => {
    expect(trendSlope(line(5, ["2025-Q4", "2026-Q2"]), NOW)).toBeNull();
    expect(trendSlope(line(5, ["2025-Q4", "2026-Q2", "2026-Q3"]), NOW)).not.toBeNull();
  });

  it("is null when the series starts less than a year back", () => {
    expect(trendSlope(line(5, ["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"]), NOW)).toBeNull();
  });
});

describe("trendOf", () => {
  // Percentile points per quarter that give exactly the cut-off slope per year.
  const atCut = CUT / 4;

  it("is Improving at the cut-off, Slipping at its mirror, Steady in between", () => {
    expect(trendOf(line(atCut), "medium", NOW)).toBe("improving");
    expect(trendOf(line(-atCut), "medium", NOW)).toBe("slipping");
    expect(trendOf(line(atCut * 0.9), "high", NOW)).toBe("steady");
    expect(trendOf(line(-atCut * 0.9), "high", NOW)).toBe("steady");
    expect(trendOf(line(0), "high", NOW)).toBe("steady");
  });

  it("is hidden at Low Confidence, however far the standing moved", () => {
    expect(trendOf(line(20), "low", NOW)).toBeNull();
    expect(trendOf(line(20), null, NOW)).toBeNull();
    expect(trendOf(line(20), undefined, NOW)).toBeNull();
  });

  it("is hidden with under 12 months of Reviews", () => {
    expect(trendOf(line(20, ["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"]), "high", NOW)).toBeNull();
  });

  it("is hidden for a provisional series that carries no standing", () => {
    const provisional = QUARTERS.slice(1).map((quarter): TrendPoint => ({ quarter, compositePercentile: null, textVolume: 10 }));
    expect(trendOf(provisional, "medium", NOW)).toBeNull();
    expect(trendOf([], "medium", NOW)).toBeNull();
  });

  it("reads old Verdicts whose series lacks the standing field", () => {
    expect(trendOf(QUARTERS.slice(1).map((quarter) => ({ quarter, textVolume: 10 })), "medium", NOW)).toBeNull();
  });
});
