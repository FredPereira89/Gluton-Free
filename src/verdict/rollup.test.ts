import { describe, expect, it } from "vitest";
import { INPUTS, type Aspect, type Input } from "@/domain/aspects";
import { midRank } from "./peer";
import { applyReviewWindow, rollup, shrunk, type RollupFlag, type RollupReview } from "./rollup";

const NOW = new Date("2026-09-01T00:00:00Z");
const monthsAgo = (m: number) => new Date(NOW.getTime() - m * 30.4375 * 24 * 3600 * 1000);

let nextId = 1;
function review(p: Partial<Omit<RollupReview, "aspects">> & { aspects?: Partial<Record<Aspect, number | null>> | null } = {}): RollupReview {
  const base = { food: null, service: null, ambience: null, value: null, wait: null, consistency: null };
  const hasText = p.hasText ?? p.aspects !== null;
  return {
    id: nextId++,
    source: p.source ?? "google",
    publishedAt: p.publishedAt ?? monthsAgo(1),
    stars: p.stars === undefined ? 5 : p.stars,
    hasText,
    subRatings: p.subRatings ?? null,
    aspects: hasText && p.aspects !== null ? { ...base, ...(p.aspects ?? {}) } : null,
    exceptional: p.exceptional ?? "none",
    themes: p.themes ?? [],
  };
}

function many(n: number, f: (i: number) => RollupReview): RollupReview[] {
  return Array.from({ length: n }, (_, i) => f(i));
}

const great = (i: number, source = i % 2 ? "google" : "tripadvisor") =>
  review({ source, stars: 5, aspects: { food: 2, service: 2, value: 2, wait: 1, consistency: 2, ambience: -1 } });

describe("shrunk", () => {
  it("pulls sparse inputs toward 0 with k = 10", () => {
    expect(shrunk([[1, 2]]).theta).toBeCloseTo(2 / 11);
    expect(shrunk([]).theta).toBe(0);
  });
  it("reports effective n", () => {
    expect(shrunk([[1, 1], [1, 1], [1, 1], [1, 1]]).nEff).toBeCloseTo(4);
    expect(shrunk([[1, 1], [0.25, 1]]).nEff).toBeCloseTo(1.5625 / 1.0625);
  });
});

describe("rollup", () => {
  it("shrinks toward the snapshot Format mean and uses mid-rank standings", () => {
    const groups = INPUTS.map((input) => ({
      city: "Lisbon", level: "format" as const, key: "tasca", input,
      sortedTheta: Array.from({ length: 30 }, (_, i) => i < 15 ? 0 : 1),
      formatMean: 1, k: 10, composite: Array.from({ length: 30 }, (_, i) => i / 30),
      exceptionalPrior: { alpha: 1, beta: 1 }, peerCount: 30,
    }));
    const r = rollup({ now: NOW, city: "Lisbon", format: "tasca", reviews: many(15, () => review({ publishedAt: NOW, stars: 3, aspects: { food: 0 } })), flags: [],
      peerSnapshot: { id: 7, month: "2026-09", publishedAt: "2026-09-01T00:00:00.000Z", groups },
    });
    expect(r.provisional).toBe(true);
    expect(r.inputs.find((s) => s.input === "food")!.theta).toBe(0);
    expect(r.standings?.find((s) => s.input === "food")).toMatchObject({ theta: 0.4, percentile: 50, level: "format", peerCount: 30 });
    expect(r.peerSnapshot?.id).toBe(7);
    const defaultVerdict = rollup({ now: NOW, city: "Lisbon", format: "tasca", reviews: many(15, () => review({ publishedAt: NOW, stars: 3, aspects: { food: 0 } })), flags: [] });
    expect(r.tier).toBe(defaultVerdict.tier);
  });

  it("falls back per input from Format to family to all Lisbon at 30 qualified Peers", () => {
    const groups = [
      ...INPUTS.map((input) => ({ city: "Lisbon", level: "format" as const, key: "tasca", input, peerCount: 29 })),
      { city: "Lisbon", level: "family" as const, key: "traditional_portuguese", input: "food" as Input, peerCount: 30 },
      ...INPUTS.filter((input) => input !== "food").map((input) => ({ city: "Lisbon", level: "city" as const, key: "Lisbon", input, peerCount: 30 })),
    ].map((g) => ({ ...g, sortedTheta: Array(g.peerCount).fill(0), formatMean: 0, k: 10,
      composite: Array(g.peerCount).fill(0), exceptionalPrior: { alpha: 1, beta: 1 } }));
    const r = rollup({ now: NOW, city: "Lisbon", format: "tasca", reviews: many(15, (i) => great(i)), flags: [],
      peerSnapshot: { id: 8, month: "2026-09", publishedAt: "2026-09-01T00:00:00.000Z", groups },
    });
    expect(r.standings?.find((s) => s.input === "food")?.level).toBe("family");
    expect(r.standings?.find((s) => s.input === "service")?.level).toBe("city");
    expect(r.provisional).toBe(true);
    expect(r.standings?.find((s) => s.input === "overall")?.level).toBe("city");
  });

  it("keeps a Restaurant outside the snapshot city provisional", () => {
    const r = rollup({ now: NOW, city: "Porto", format: "tasca", reviews: many(15, (i) => great(i)), flags: [],
      peerSnapshot: { id: 8, month: "2026-09", publishedAt: "2026-09-01T00:00:00.000Z", groups: [] },
    });
    expect(r.provisional).toBe(true);
    expect(r.peerSnapshot).toBeNull();
  });

  it("uses the default prior when the snapshot has no complete Peer group", () => {
    const reviews = many(15, () => review({ aspects: { food: 0 } }));
    const provisional = rollup({ now: NOW, city: "Lisbon", format: "tasca", reviews, flags: [] });
    const incomplete = rollup({ now: NOW, city: "Lisbon", format: "tasca", reviews, flags: [],
      peerSnapshot: { id: 9, month: "2026-09", publishedAt: "2026-09-01T00:00:00.000Z", groups: [{
        city: "Lisbon", level: "format", key: "tasca", input: "food", sortedTheta: Array(30).fill(0),
        formatMean: 2, k: 10, composite: Array(30).fill(0), exceptionalPrior: { alpha: 1, beta: 1 }, peerCount: 30,
      }] },
    });
    expect(incomplete.provisional).toBe(true);
    expect(incomplete.peerSnapshot).toBeNull();
    expect(incomplete.inputs).toEqual(provisional.inputs);
  });

  it("uses a mid-rank for ties", () => {
    expect(midRank([0, 1, 1, 2], 1)).toBe(50);
    expect(midRank([0, 1, 1, 2], 2)).toBe(87.5);
  });

  it("gives Must Go to a consistently excellent Restaurant, ignoring ambience at a tasca", () => {
    const r = rollup({ now: NOW, format: "tasca", reviews: many(200, (i) => great(i)), flags: [] });
    expect(r.state).toBe("verdict");
    expect(r.tier).toBe("must_go");
    expect(r.inputs.find((x) => x.input === "ambience")!.counted).toBe(false);
    expect(r.inputs.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1);
    expect(r.confidence.level).toBe("low");
  });

  it("counts ambience elsewhere, where a poor room caps Must Go at Good", () => {
    const r = rollup({ now: NOW, format: "restaurant", reviews: many(200, (i) => great(i)), flags: [] });
    expect(r.tier).toBe("good");
    expect(r.floorCap).toMatch(/ambience/);
  });

  it("is Avoid when food is net-negative", () => {
    const reviews = many(40, () => review({ stars: 4, aspects: { food: -1, service: 2 } }));
    expect(rollup({ now: NOW, format: "tasca", reviews, flags: [] }).tier).toBe("avoid");
  });

  it("uses a sub-rating at half weight only where the text left the Aspect empty", () => {
    const withSub = review({ aspects: { food: 2 }, subRatings: { food: 1, service: 5 } });
    const r = rollup({ now: NOW, format: "tasca", reviews: [withSub], flags: [] });
    const food = r.inputs.find((x) => x.input === "food")!;
    const service = r.inputs.find((x) => x.input === "service")!;
    expect(food.n).toBe(1);
    expect(food.theta).toBeGreaterThan(0);
    expect(service.sumW).toBeCloseTo(0.5, 1);
  });

  it("feeds rating-only Reviews into Overall only", () => {
    // A text Review anchors the Source's window so the rating-only Reviews have something to share.
    const anchor = review({ aspects: { food: 1 } });
    const ratingOnly = many(10, () => review({ aspects: null, stars: 1, subRatings: { food: 1 } }));
    const r = rollup({ now: NOW, format: "tasca", reviews: [anchor, ...ratingOnly], flags: [] });
    expect(r.inputs.find((x) => x.input === "food")!.n).toBe(1);
    expect(r.inputs.find((x) => x.input === "overall")!.n).toBe(11);
    expect(r.counts.ratingOnly).toBe(10);
  });

  it("reports each Source's window (count and start date) and excludes Reviews outside it", () => {
    const inWindow = review({ source: "google", publishedAt: monthsAgo(2), aspects: { food: 2 } });
    const outsideWindow = review({ source: "google", publishedAt: monthsAgo(30), stars: 1, aspects: { food: -2 } });
    const r = rollup({ now: NOW, format: "tasca", reviews: [inWindow, outsideWindow], flags: [] });
    expect(r.counts.perSource.google!.text).toBe(1);
    expect(r.counts.perSource.google!.windowStart).toBe(monthsAgo(2).toISOString());
    expect(r.inputs.find((x) => x.input === "food")!.n).toBe(1);
  });

  it("halves a Review's weight every 18 months", () => {
    const r = rollup({ now: NOW, format: "tasca", reviews: [review({ publishedAt: monthsAgo(18), aspects: { food: 1 } })], flags: [] });
    expect(r.inputs.find((x) => x.input === "food")!.sumW).toBeCloseTo(0.5);
  });

  it("reports Not enough evidence with the bar missed", () => {
    const r = rollup({ now: NOW, format: "tasca", reviews: many(10, (i) => great(i)), flags: [] });
    expect(r.state).toBe("not_enough_evidence");
    expect(r.tier).toBeNull();
    expect(r.notEnoughEvidence.missed.join()).toMatch(/15 Reviews with text/);
  });

  it("records the text Review have/need bar after the Review window", () => {
    const r = rollup({ now: NOW, format: "tasca", reviews: many(14, (i) => great(i)), flags: [] });
    expect(r.state).toBe("not_enough_evidence");
    expect(r.tier).toBeNull();
    expect(r.notEnoughEvidence.bars).toMatchObject({
      textReviews: { have: 14, need: 15, met: false },
      foodMentions: { have: 14, need: 8, met: true },
    });
  });

  it("records the food mention have/need bar independently of text count", () => {
    const reviews = many(15, (i) => i < 7 ? great(i) : review({ aspects: { service: 1 } }));
    const r = rollup({ now: NOW, format: "tasca", reviews, flags: [] });
    expect(r.state).toBe("not_enough_evidence");
    expect(r.notEnoughEvidence.bars.foodMentions).toEqual({ have: 7, need: 8, met: false });
    expect(r.notEnoughEvidence.bars.textReviews.met).toBe(true);
  });

  it("records the newest Review age bar when all Reviews are stale", () => {
    const r = rollup({ now: NOW, format: "tasca", reviews: many(15, (i) => review({ ...great(i), publishedAt: monthsAgo(19) })), flags: [] });
    expect(r.state).toBe("not_enough_evidence");
    expect(r.notEnoughEvidence.bars.newestReview).toMatchObject({ need: 18, met: false });
    expect(r.notEnoughEvidence.bars.newestReview.have).toBeCloseTo(19);
  });

  it("explains when a confirmed Change point leaves too few Reviews", () => {
    const reviews = [
      ...many(20, (i) => review({ ...great(i), publishedAt: monthsAgo(8) })),
      ...many(9, (i) => review({ ...great(i), publishedAt: monthsAgo(1) })),
    ];
    const withoutChange = rollup({ now: NOW, format: "tasca", reviews, flags: [] });
    const afterChange = rollup({ now: NOW, format: "tasca", reviews, flags: [], changePointAt: monthsAgo(4), changePointDescription: "Reopened after renovation" });
    expect(withoutChange.state).toBe("verdict");
    expect(afterChange.state).toBe("not_enough_evidence");
    expect(afterChange.notEnoughEvidence.bars.textReviews.have).toBe(9);
    expect(afterChange.notEnoughEvidence.reasonLine).toMatch(/^Reopened after renovation on .+; 9 Reviews since$/);
  });

  it("forces Avoid on three confirmed first-hand incidents within 3 months in one group", () => {
    const reviews = many(100, (i) => great(i));
    const flag = (r: RollupReview, m: number): RollupFlag => ({
      reviewId: r.id,
      type: "food_poisoning",
      group: "health",
      firstHand: true,
      verification: "confirmed",
      publishedAt: monthsAgo(m),
    });
    const r = rollup({
      now: NOW,
      format: "tasca",
      reviews,
      flags: [flag(reviews[0]!, 1), flag(reviews[1]!, 2), flag(reviews[2]!, 3)],
    });
    expect(r.tier).toBe("avoid");
    expect(r.redFlags[0]!.incidents12m).toBe(3);
    expect(r.redFlags[0]!.forcesAvoid).toBe(true);
  });

  it("does not force Avoid when only two of three incidents fall within the last 3 months", () => {
    const reviews = many(100, (i) => great(i));
    const flag = (r: RollupReview, m: number): RollupFlag => ({
      reviewId: r.id,
      type: "food_poisoning",
      group: "health",
      firstHand: true,
      verification: "confirmed",
      publishedAt: monthsAgo(m),
    });
    const r = rollup({
      now: NOW,
      format: "tasca",
      reviews,
      flags: [flag(reviews[0]!, 2), flag(reviews[1]!, 5), flag(reviews[2]!, 8)],
    });
    expect(r.tier).toBe("must_go");
    expect(r.redFlags[0]!.incidents12m).toBe(3);
    expect(r.redFlags[0]!.forcesAvoid).toBe(false);
  });

  it("shows a single incident without forcing Avoid, and ignores unconfirmed ones", () => {
    const reviews = many(100, (i) => great(i));
    const base = { type: "scam_overcharge", group: "money", firstHand: true, publishedAt: monthsAgo(1) } as const;
    const r = rollup({
      now: NOW,
      format: "tasca",
      reviews,
      flags: [
        { ...base, reviewId: reviews[0]!.id, verification: "confirmed" },
        { ...base, reviewId: reviews[1]!.id, verification: "rejected" },
        { ...base, reviewId: reviews[2]!.id, verification: "pending" },
      ],
    });
    expect(r.tier).toBe("must_go");
    expect(r.redFlags).toHaveLength(1);
    expect(r.redFlags[0]!.incidents12m).toBe(1);
    expect(r.redFlags[0]!.forcesAvoid).toBe(false);
  });

  it("caps confidence when only one Crowd Source is present", () => {
    const r = rollup({ now: NOW, format: "tasca", reviews: many(60, (i) => great(i, "google")), flags: [] });
    expect(r.confidence.caps.join()).toMatch(/only one Crowd Source/);
  });

  it("is deterministic", () => {
    const reviews = many(80, (i) => review({ source: i % 2 ? "google" : "tripadvisor", stars: 3 + (i % 3), aspects: { food: (i % 5) - 1 } }));
    const a = rollup({ now: NOW, format: "tasca", reviews, flags: [] });
    const b = rollup({ now: NOW, format: "tasca", reviews, flags: [] });
    expect(a).toEqual(b);
  });
});

describe("consistency spread (derived, not extracted — issue #32)", () => {
  it("ranks a tight spread of stance below a wide one", () => {
    const tight = many(40, () => review({ stars: 4 }));
    const wide = many(40, (i) => review({ stars: i % 2 ? 1 : 5 }));
    const tightR = rollup({ now: NOW, format: "tasca", reviews: tight, flags: [] });
    const wideR = rollup({ now: NOW, format: "tasca", reviews: wide, flags: [] });
    expect(tightR.consistencySpread.sd).toBeCloseTo(0, 5);
    expect(wideR.consistencySpread.sd!).toBeGreaterThan(1.5);
  });

  it("shrinks the spread toward the median below about 20 Reviews, so one outlier can't swing it", () => {
    // Two Reviews agree (stance 0) and one is a lone outlier (stance +2). The plain recency-weighted
    // SD around the mean would be about 0.94; shrinkage toward the median-anchored spread (which is
    // 0, since the median Review agrees with most of them) should pull the reported spread well below that.
    const few = rollup({ now: NOW, format: "tasca", reviews: [review({ stars: 3 }), review({ stars: 3 }), review({ stars: 5 })], flags: [] });
    expect(few.consistencySpread.sd!).toBeLessThan(0.4);

    // A genuinely wide spread at n = 30 (past the ~20 threshold) should sit much closer to the
    // unshrunk SD than to zero — shrinkage should have faded by now.
    const many30 = rollup({
      now: NOW,
      format: "tasca",
      reviews: many(30, (i) => review({ stars: (i % 5) + 1 })),
      flags: [],
    });
    expect(many30.consistencySpread.sd!).toBeGreaterThan(0.7);
  });

  it("derives stance from the mean of a Review's Aspects when unrated, excluding the extracted consistency Aspect itself", () => {
    // Both Reviews agree once `consistency` is left out of the average (food 2, service 2 -> stance 2);
    // including it would disagree (2, 2, -2 vs 2, 2, 2 -> stance 0.67 vs 2) and produce a spread.
    const a = review({ stars: null, aspects: { food: 2, service: 2, consistency: -2 } });
    const b = review({ stars: null, aspects: { food: 2, service: 2, consistency: 2 } });
    const r = rollup({ now: NOW, format: "tasca", reviews: [a, b], flags: [] });
    expect(r.consistencySpread.n).toBe(2);
    expect(r.consistencySpread.sd).toBeCloseTo(0, 5);
  });

  it("no longer feeds the composite as an input", () => {
    const r = rollup({ now: NOW, format: "tasca", reviews: many(200, (i) => great(i)), flags: [] });
    expect(r.inputs.map((x): string => x.input)).not.toContain("consistency");
  });
});

describe("applyReviewWindow", () => {
  const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000);

  it("caps a Source at its 100 newest text Reviews", () => {
    const reviews = many(150, (i) => review({ publishedAt: hoursAgo(i), aspects: { food: 1 } }));
    const windowed = applyReviewWindow(reviews, NOW, null);
    expect(windowed).toHaveLength(100);
    expect(windowed.map((r) => r.id).sort((a, b) => a - b)).toEqual(reviews.slice(0, 100).map((r) => r.id).sort((a, b) => a - b));
  });

  it("drops text Reviews older than 24 months", () => {
    const kept = review({ publishedAt: monthsAgo(23), aspects: { food: 1 } });
    const dropped = review({ publishedAt: monthsAgo(25), aspects: { food: 1 } });
    const windowed = applyReviewWindow([kept, dropped], NOW, null);
    expect(windowed.map((r) => r.id)).toEqual([kept.id]);
  });

  it("cuts the window at a Change point newer than the 24-month limit", () => {
    const kept = review({ publishedAt: monthsAgo(3), aspects: { food: 1 } });
    const dropped = review({ publishedAt: monthsAgo(9), aspects: { food: 1 } });
    const windowed = applyReviewWindow([kept, dropped], NOW, monthsAgo(6));
    expect(windowed.map((r) => r.id)).toEqual([kept.id]);
  });

  it("shares the text window with rating-only Reviews, dropping ones dated before it", () => {
    const anchor = review({ publishedAt: monthsAgo(2), aspects: { food: 1 } });
    const starInWindow = review({ publishedAt: monthsAgo(1), aspects: null, stars: 4 });
    const starBeforeWindow = review({ publishedAt: monthsAgo(5), aspects: null, stars: 2 });
    const windowed = applyReviewWindow([anchor, starInWindow, starBeforeWindow], NOW, null);
    expect(windowed.map((r) => r.id).sort((a, b) => a - b)).toEqual([anchor.id, starInWindow.id].sort((a, b) => a - b));
  });

  it("windows each Source independently", () => {
    const google = many(150, (i) => review({ source: "google", publishedAt: hoursAgo(i), aspects: { food: 1 } }));
    const tripadvisor = many(5, (i) => review({ source: "tripadvisor", publishedAt: hoursAgo(i), aspects: { food: 1 } }));
    const windowed = applyReviewWindow([...google, ...tripadvisor], NOW, null);
    expect(windowed.filter((r) => r.source === "google")).toHaveLength(100);
    expect(windowed.filter((r) => r.source === "tripadvisor")).toHaveLength(5);
  });

  it("drops a Source with no text Reviews in range entirely, even its rating-only Reviews", () => {
    const reviews = many(5, () => review({ aspects: null, stars: 3 }));
    expect(applyReviewWindow(reviews, NOW, null)).toEqual([]);
  });
});

describe("quarterly Source history", () => {
  it("keeps full-history Review volume and draws stars only from five or more ratings in a quarter", () => {
    const reviews = [
      ...many(5, () => review({ source: "google", publishedAt: new Date("2023-01-15T00:00:00Z"), stars: 4, aspects: null })),
      ...many(4, () => review({ source: "google", publishedAt: new Date("2023-07-15T00:00:00Z"), stars: 2 })),
      review({ source: "google", publishedAt: new Date("2023-07-15T00:00:00Z"), stars: null }),
      review({ source: "tripadvisor", publishedAt: new Date("2023-01-15T00:00:00Z"), stars: 5 }),
      review({ source: "tripadvisor", publishedAt: new Date("2023-07-15T00:00:00Z"), stars: null }),
      review({ source: "google", publishedAt: NOW, stars: 5, aspects: null }),
    ];
    const result = rollup({ now: NOW, format: "tasca", reviews, flags: [] });
    expect(result.counts.reviews).toBe(0); // no qualifying text Review in the recent window
    const google = result.sourceHistory.find((s) => s.source === "google")!.quarters;
    expect(google).toHaveLength(15);
    expect(google[0]).toEqual({ quarter: "2023-Q1", stars: 4, ratings: 5, volume: 5 });
    expect(google[1]).toEqual({ quarter: "2023-Q2", stars: null, ratings: 0, volume: 0 });
    expect(google[2]).toEqual({ quarter: "2023-Q3", stars: null, ratings: 4, volume: 5 });
    expect(google[8]).toEqual({ quarter: "2025-Q1", stars: null, ratings: 0, volume: 0 });
    expect(google.at(-1)).toEqual({ quarter: "2026-Q3", stars: null, ratings: 1, volume: 1 });
    expect(result.sourceHistory.find((s) => s.source === "tripadvisor")?.quarters[2]).toEqual({ quarter: "2023-Q3", stars: null, ratings: 0, volume: 1 });
  });
});
