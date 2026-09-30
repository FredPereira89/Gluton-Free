import { describe, expect, it, vi } from "vitest";
import { FORMATS } from "@/domain/baseline-format";
import type { ExtractInput, Extracted } from "@/analysis/extract";
import type { BaselineCandidate } from "./baseline";
import { BaselineSpendBudget } from "./baseline-budget";
import {
  BASELINE_TARGETS,
  FROZEN_BASELINE_EXTRACTOR_VERSION,
  initialBaselineReviewDepth,
  nextBaselineReviewDepth,
  runBaselineBuild,
  selectBaselineReviewWindow,
} from "./baseline-build";
import type { NormalisedReview } from "@/ingest/normalise";

const now = new Date("2026-09-30T12:00:00.000Z");

function candidate(placeId: string, format: BaselineCandidate["format"], reviewCount = 70): BaselineCandidate {
  return {
    placeId,
    name: `Fictional ${placeId}`,
    url: `https://example.invalid/${placeId}`,
    address: "1 Fictional Street",
    area: "Lisbon",
    latitude: 38.7223,
    longitude: -9.1393,
    rating: 4.5,
    reviewCount,
    categories: [],
    priceLevel: "moderate",
    priceTier: "€€",
    format,
    formatProvenance: "baseline_auto",
    newestReviewAt: new Date("2026-09-20T09:00:00.000Z"),
  };
}

function review(placeId: string, index: number, publishedAt = new Date("2026-09-20T09:00:00.000Z")): NormalisedReview {
  return {
    sourceReviewId: `${placeId}-${index}`,
    stars: 5,
    publishedAt,
    language: "en",
    text: `Fictional review ${index} for ${placeId}`,
    subRatings: null,
    reviewerReviewCount: null,
    localGuide: null,
    reviewerContributions: null,
    photoCount: null,
    visitedOn: null,
    ownerReplied: false,
  };
}

function extracted(input: ExtractInput): Extracted {
  return {
    reviewId: input.id,
    lang: "en",
    aspects: { food: 1, service: null, ambience: null, value: null, wait: null, consistency: null },
    exceptional: "none",
    change: "none",
    flags: [],
    themes: [],
    quote: null,
    names: [],
  };
}

function fakeProviders(options: { emptyFirstWave?: number; misfileFirstTasca?: boolean } = {}) {
  let fetchCount = 0;
  let nextWaveStarts = 0;
  const providers = {
    fetchReviews: vi.fn(async (requests: { candidate: BaselineCandidate; depth: number }[]) => {
      const results = new Map<string, { reviews: NormalisedReview[]; costUsd: number }>();
      for (const { candidate: item, depth } of requests) {
        fetchCount++;
        expect(depth).toBeLessThanOrEqual(100);
        results.set(item.placeId, fetchCount <= (options.emptyFirstWave ?? 0)
          ? { reviews: [], costUsd: 0.001 }
          : { reviews: Array.from({ length: 3 }, (_, index) => review(item.placeId, index)), costUsd: 0.001 });
      }
      return results;
    }),
    extractBatch: vi.fn(async (items: ExtractInput[], spend: BaselineSpendBudget) => {
      const settle = await spend.reserve("llm")(0.05);
      await settle(0.01);
      return { results: new Map(items.map((item) => [item.id, extracted(item)])), costUsd: 0.01 };
    }),
    confirmFormats: vi.fn(async (items: { candidate: BaselineCandidate }[], spend: BaselineSpendBudget) => {
      nextWaveStarts++;
      const settle = await spend.reserve("llm")(0.05);
      await settle(0.01);
      const formats = new Map(items.map(({ candidate: item }) => [item.placeId, item.format]));
      if (options.misfileFirstTasca && nextWaveStarts === 1) {
        const tasca = items.find(({ candidate: item }) => item.format === "tasca");
        if (tasca) formats.set(tasca.candidate.placeId, "casual_contemporary");
      }
      return { formats, costUsd: 0.01 };
    }),
  };
  return { providers };
}

function buildOptions(overrides: Partial<Parameters<typeof runBaselineBuild>[2]> = {}) {
  return {
    extractorVersion: FROZEN_BASELINE_EXTRACTOR_VERSION,
    now,
    random: () => 0.5,
    ...overrides,
  };
}

describe("Lisbon baseline Review-window build", () => {
  it("randomly samples target plus 30%, excludes the most-reviewed regular candidate, and keeps every eligible casa de fado", async () => {
    const candidates: BaselineCandidate[] = [];
    for (const format of FORMATS) {
      const count = format === "casa_de_fado" ? 4 : 100;
      for (let index = 0; index < count; index++) {
        const id = `${format}-${String(index).padStart(3, "0")}`;
        candidates.push(candidate(id, format, format === "casa_de_fado" && index === 0 ? 5_000 : 70 + index));
      }
    }
    const { providers } = fakeProviders({ misfileFirstTasca: true });

    const result = await runBaselineBuild(candidates, providers, buildOptions());

    expect(result.initialSampleCounts.tasca).toBe(65);
    expect(result.initialSampleCounts.restaurante_tradicional).toBe(65);
    expect(result.initialSampleCounts.marisqueira_cervejaria).toBe(39);
    expect(result.initialSampleCounts.casa_de_fado).toBe(4);
    expect(providers.fetchReviews.mock.calls.flatMap(([requests]) => requests.map(({ candidate: item }) => item.placeId)).includes("tasca-099")).toBe(false);
    expect(result.countsByFormat.casual_contemporary).toBeGreaterThanOrEqual(65);
    expect(result.candidates.every(({ candidate: item }) => item.formatProvenance === "llm")).toBe(true);
    expect(result.candidates.find(({ candidate: item }) => item.placeId === "casa_de_fado-000")).toBeDefined();
    expect(Object.keys(result.countsByFormat)).toHaveLength(FORMATS.length);
    expect(BASELINE_TARGETS.cafe_pastelaria).toBe(50);
  });

  it("tops up after initial candidates have no usable Reviews", async () => {
    const candidates = Array.from({ length: 130 }, (_, index) => candidate(`tasca-${String(index).padStart(3, "0")}`, "tasca", index === 0 ? 5_000 : 70));
    const { providers } = fakeProviders({ emptyFirstWave: 65 });

    const result = await runBaselineBuild(candidates, providers, buildOptions());

    expect(providers.fetchReviews).toHaveBeenCalledTimes(2);
    expect(providers.fetchReviews.mock.calls.flatMap(([requests]) => requests).map(({ candidate: item }) => item.placeId)).toHaveLength(129);
    expect(result.initialSampleCounts.tasca).toBe(65);
    expect(result.countsByFormat.tasca).toBe(64);
    expect(result.shortByFormat.tasca).toBeUndefined();
    expect(result.skippedWithoutText).toBe(65);
    expect(result.fetchedDepthByPlaceId["tasca-001"]).toBe(70);
  });

  it("uses no more than the newest 100 text Reviews and keeps rating-only rows inside that window", () => {
    const reviews = Array.from({ length: 105 }, (_, index) => review("place", index, new Date(Date.UTC(2026, 8, 29 - index))))
      .concat([{
        ...review("place", 200, new Date("2026-09-10T00:00:00.000Z")),
        sourceReviewId: "rating-only",
        text: null,
      }]);

    const window = selectBaselineReviewWindow(reviews, now);

    expect(window.reviews.filter((item) => item.text !== null)).toHaveLength(100);
    expect(window.reviews.some((item) => item.sourceReviewId === "rating-only")).toBe(true);
    expect(window.start?.toISOString()).toBe(new Date(Date.UTC(2026, 5, 22)).toISOString());
  });

  it("bounds DataForSEO fetch depth to the Review window", () => {
    expect(initialBaselineReviewDepth(25)).toBe(30);
    expect(initialBaselineReviewDepth(88)).toBe(90);
    expect(initialBaselineReviewDepth(5_000)).toBe(100);
    expect(nextBaselineReviewDepth(100)).toBe(200);
    expect(nextBaselineReviewDepth(4_490)).toBeNull();
  });

  it("extends a total-row fetch until it has 100 text Reviews and the rating-only rows in that same window", async () => {
    const allReviews = Array.from({ length: 150 }, (_, index) => ({
      ...review("fado-window", index, new Date(now.getTime() - index * 60_000)),
      text: index % 10 === 0 ? null : `Fictional text review ${index}`,
    }));
    const fetchReviews = vi.fn(async (requests: { candidate: BaselineCandidate; depth: number }[]) => {
      const request = requests[0]!;
      const reviews = allReviews.slice(0, request.depth);
      return new Map([[request.candidate.placeId, {
        reviews,
        costUsd: 0.01,
        reviewCount: 1_000,
        returnedCount: reviews.length,
      }]]);
    });
    const result = await runBaselineBuild([candidate("fado-window", "casa_de_fado", 1_000)], {
      fetchReviews,
      extractBatch: async (items) => ({ results: new Map(items.map((item) => [item.id, extracted(item)])), costUsd: 0 }),
      confirmFormats: async (items) => ({ formats: new Map(items.map(({ candidate: item }) => [item.placeId, item.format])), costUsd: 0 }),
    }, buildOptions());

    expect(fetchReviews.mock.calls.map(([requests]) => requests[0]!.depth)).toEqual([100, 200]);
    expect(result.candidates[0]!.reviewWindow.filter((item) => Boolean(item.text?.trim()))).toHaveLength(100);
    expect(result.candidates[0]!.reviewWindow.filter((item) => !item.text?.trim())).toHaveLength(12);
    expect(result.costsUsd.dataforseo).toBe(0.02);
  });

  it("reports a short window when DataForSEO's maximum depth is reached", async () => {
    const fetchReviews = vi.fn(async (requests: { candidate: BaselineCandidate; depth: number }[]) => {
      const request = requests[0]!;
      return new Map([[request.candidate.placeId, {
        reviews: Array.from({ length: 3 }, (_, index) => review(request.candidate.placeId, index)),
        costUsd: 0,
        reviewCount: 5_000,
        returnedCount: request.depth,
      }]]);
    });
    const result = await runBaselineBuild([candidate("fado-limited", "casa_de_fado", 5_000)], {
      fetchReviews,
      extractBatch: async (items) => ({ results: new Map(items.map((item) => [item.id, extracted(item)])), costUsd: 0 }),
      confirmFormats: async (items) => ({ formats: new Map(items.map(({ candidate: item }) => [item.placeId, item.format])), costUsd: 0 }),
    }, buildOptions());

    expect(fetchReviews.mock.calls.map(([requests]) => requests[0]!.depth)).toEqual([100, 200, 400, 800, 1_600, 3_200, 4_490]);
    expect(result.incompleteReviewWindowPlaceIds).toEqual(["fado-limited"]);
  });

  it("refuses a mismatched extractor before making any vendor calls", async () => {
    const { providers } = fakeProviders();

    await expect(runBaselineBuild(
      [candidate("tasca-1", "tasca")],
      providers,
      buildOptions({ extractorVersion: "claude-haiku-4-5|extract-v4|themes-v1" }),
    )).rejects.toThrow("owner-approved frozen");

    expect(providers.fetchReviews).not.toHaveBeenCalled();
    expect(providers.extractBatch).not.toHaveBeenCalled();
  });

  it("reserves DataForSEO spend before starting a fetch", async () => {
    const { providers } = fakeProviders();
    const spend = new BaselineSpendBudget({ dataforseo: 49.995 });

    await expect(runBaselineBuild(
      [candidate("fado-1", "casa_de_fado", 30)],
      providers,
      buildOptions({ spend }),
    )).rejects.toMatchObject({ name: "BaselineSpendCapError", kind: "dataforseo" });

    expect(providers.fetchReviews).not.toHaveBeenCalled();
  });

  it("reserves Anthropic spend before submitting extraction batches", async () => {
    const { providers } = fakeProviders();
    const spend = new BaselineSpendBudget({ llm: 29.999 });

    await expect(runBaselineBuild(
      [candidate("fado-1", "casa_de_fado", 30)],
      providers,
      buildOptions({ spend }),
    )).rejects.toMatchObject({ name: "BaselineSpendCapError", kind: "llm" });

    expect(providers.fetchReviews).toHaveBeenCalledTimes(1);
    expect(providers.confirmFormats).not.toHaveBeenCalled();
  });
});
