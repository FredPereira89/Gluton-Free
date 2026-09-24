import { describe, expect, it } from "vitest";
import { diffExtraction, GOLD_SET_MAX, selectGoldSample, summarizeAgreement, type GoldBaseline, type GoldCandidate } from "./gold-set";

const baseline: GoldBaseline = {
  lang: "en",
  aspects: { food: 1, service: null, ambience: null, value: null, wait: null, consistency: null },
  exceptional: "none",
  change: "none",
  flags: [],
  themes: ["food_generous_portions"],
  quote: { text: "great food", aspect: "food", polarity: 1 },
};

describe("selectGoldSample", () => {
  it("draws from every source/language group instead of exhausting one first", () => {
    const candidates: GoldCandidate[] = [
      ...Array.from({ length: 10 }, (_, i) => ({ reviewId: i, source: "google", language: "en", text: `google en ${i}` })),
      ...Array.from({ length: 10 }, (_, i) => ({ reviewId: 100 + i, source: "tripadvisor", language: "pt", text: `tripadvisor pt ${i}` })),
    ];

    const sample = selectGoldSample(candidates, 4);

    expect(sample).toHaveLength(4);
    expect(sample.filter((c) => c.source === "google")).toHaveLength(2);
    expect(sample.filter((c) => c.source === "tripadvisor")).toHaveLength(2);
  });

  it("never exceeds the requested max even with a larger pool", () => {
    const candidates: GoldCandidate[] = Array.from({ length: 500 }, (_, i) => ({
      reviewId: i,
      source: "google",
      language: "en",
      text: `review ${i}`,
    }));

    expect(selectGoldSample(candidates, GOLD_SET_MAX)).toHaveLength(GOLD_SET_MAX);
  });

  it("returns fewer than max when the pool is smaller", () => {
    const candidates: GoldCandidate[] = Array.from({ length: 3 }, (_, i) => ({
      reviewId: i,
      source: "google",
      language: "en",
      text: `review ${i}`,
    }));

    expect(selectGoldSample(candidates, 200)).toHaveLength(3);
  });

  it("drops any candidate scrubText would still change, as a contact-info safety net (names are already redacted upstream by the time a Review has an analysis)", () => {
    const candidates: GoldCandidate[] = [
      { reviewId: 1, source: "google", language: "en", text: "Lovely dinner, staff were attentive." },
      { reviewId: 2, source: "google", language: "en", text: "Call me at 912 345 678 for details." },
      { reviewId: 3, source: "google", language: "en", text: "Email owner@example.com for a reservation." },
    ];

    const sample = selectGoldSample(candidates, 200);

    expect(sample.map((c) => c.reviewId)).toEqual([1]);
  });
});

describe("diffExtraction", () => {
  it("reports no diffs when candidate matches baseline", () => {
    const result = diffExtraction(1, baseline, structuredClone(baseline));
    expect(result.diffs).toEqual([]);
  });

  it("reports an aspect diff when a score changes", () => {
    const candidate = structuredClone(baseline);
    candidate.aspects.food = -1;
    const result = diffExtraction(1, baseline, candidate);
    expect(result.diffs).toEqual([{ field: "food", baseline: 1, candidate: -1 }]);
  });

  it("treats themes as an order-insensitive set", () => {
    const b: GoldBaseline = { ...baseline, themes: ["food_generous_portions", "value_good"] };
    const c: GoldBaseline = { ...baseline, themes: ["value_good", "food_generous_portions"] };
    expect(diffExtraction(1, b, c).diffs).toEqual([]);
  });

  it("reports a themes diff when the set differs", () => {
    const b: GoldBaseline = { ...baseline, themes: ["food_generous_portions", "value_good"] };
    const c: GoldBaseline = { ...baseline, themes: ["food_generous_portions", "service_warm"] };
    const result = diffExtraction(1, b, c);
    expect(result.diffs).toEqual([{ field: "themes", baseline: ["food_generous_portions", "value_good"], candidate: ["food_generous_portions", "service_warm"] }]);
  });

  it("ignores flag evidence text when type, severity and firstHand agree", () => {
    const b: GoldBaseline = { ...baseline, flags: [{ type: "hygiene", firstHand: true, severity: "low", evidence: "one" }] };
    const c: GoldBaseline = { ...baseline, flags: [{ type: "hygiene", firstHand: true, severity: "low", evidence: "two" }] };
    expect(diffExtraction(1, b, c).diffs).toEqual([]);
  });

  it("reports a flags diff when severity changes, even if the type set matches", () => {
    const b: GoldBaseline = { ...baseline, flags: [{ type: "hygiene", firstHand: true, severity: "low", evidence: "one" }] };
    const c: GoldBaseline = { ...baseline, flags: [{ type: "hygiene", firstHand: true, severity: "high", evidence: "two" }] };
    const result = diffExtraction(1, b, c);
    expect(result.diffs).toEqual([{ field: "flags", baseline: ["hygiene:low:true"], candidate: ["hygiene:high:true"] }]);
  });

  it("reports a quote diff when presence changes", () => {
    const b: GoldBaseline = { ...baseline, quote: { text: "x", aspect: "food", polarity: 1 } };
    const c: GoldBaseline = { ...baseline, quote: null };
    const result = diffExtraction(1, b, c);
    expect(result.diffs).toEqual([{ field: "quote", baseline: { aspect: "food", polarity: 1 }, candidate: null }]);
  });

  it("ignores quote text differences when aspect and polarity agree", () => {
    const b: GoldBaseline = { ...baseline, quote: { text: "the food was great", aspect: "food", polarity: 1 } };
    const c: GoldBaseline = { ...baseline, quote: { text: "great food overall", aspect: "food", polarity: 1 } };
    expect(diffExtraction(1, b, c).diffs).toEqual([]);
  });
});

describe("summarizeAgreement", () => {
  it("counts agreement per field across many Reviews", () => {
    const diffs = [
      diffExtraction(1, baseline, { ...baseline, exceptional: "food" }),
      diffExtraction(2, baseline, baseline),
      diffExtraction(3, baseline, { ...baseline, exceptional: "service" }),
    ];

    const summary = summarizeAgreement(["exceptional", "change"], diffs, 3);

    expect(summary).toEqual([
      { field: "exceptional", agree: 1, total: 3 },
      { field: "change", agree: 3, total: 3 },
    ]);
  });
});
