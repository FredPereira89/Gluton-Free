import { describe, expect, it, vi } from "vitest";
import type { BaselineBuiltCandidate } from "./baseline-build";
import { BaselineSpendBudget } from "./baseline-budget";
import { runBaselineTripadvisor, type BaselineTripadvisorProviders } from "./baseline-tripadvisor";

const now = new Date("2026-09-30T12:00:00Z");

function restaurant(placeId: string, name: string, address: string): BaselineBuiltCandidate {
  return {
    candidate: { placeId, name, address, area: "Lisbon", latitude: 38.72, longitude: -9.14,
      url: `https://example.invalid/${placeId}`, rating: 4.5, reviewCount: 50, categories: [],
      priceLevel: null, priceTier: null, format: "tasca", formatProvenance: "llm", newestReviewAt: now },
    reviews: [], reviewWindow: [], reviewWindowStart: now, analyses: [],
  };
}

function review(path: string, address: string) {
  return { facts: { title: "Casa Azul", address, placeRef: path, rating: 4.5, reviewCount: 1, priceLevel: null },
    reviews: [{ sourceReviewId: `${path}-1`, stars: 5, publishedAt: now, language: "en", text: "Great food",
      subRatings: null, reviewerReviewCount: null, localGuide: null, reviewerContributions: null,
      photoCount: null, visitedOn: null, ownerReplied: false }], droppedThirdParty: 0 };
}

describe("baseline Tripadvisor pipeline", () => {
  it("attaches and fetches a confident sampled match; records uncertain matches without fetching their windows", async () => {
    const sampled = [restaurant("sampled", "Casa Azul", "Rua Azul 7, Lisboa"),
      restaurant("uncertain", "Casa Azul", "Rua Verde 9, Lisboa")];
    const search = vi.fn(async () => ({ items: [{ title: "Casa Azul", url_path: "Restaurant_Review-g1-d1.html", reviews_count: 1 }], costUsd: 0.001 }));
    const fetch = vi.fn(async (path: string, depth: number) => ({
      normalised: review(path, "Rua Azul 7, Lisboa"), returnedCount: 1, costUsd: depth === 10 ? 0.00075 : 0.0015,
    }));
    const providers: BaselineTripadvisorProviders = { search, fetch };

    const result = await runBaselineTripadvisor(sampled, providers, { now, spend: new BaselineSpendBudget() });

    expect(search).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2); // one address probe for each sampled Restaurant; no extra uncertain window
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ googlePlaceId: "sampled", placeRef: "Restaurant_Review-g1-d1.html" });
    expect(result.matches[0]!.window.map((item) => item.sourceReviewId)).toEqual(["Restaurant_Review-g1-d1.html-1"]);
    expect(result.skipped).toEqual([{ googlePlaceId: "uncertain", reason: "uncertain", candidates: [
      { placeRef: "Restaurant_Review-g1-d1.html", nameSimilarity: 1, addressMatch: false, phoneMatch: null, distanceMeters: null },
    ] }]);
  });

  it("searches only the built sample and skips a shared Tripadvisor path", async () => {
    const providers: BaselineTripadvisorProviders = {
      search: vi.fn(async () => ({ items: [{ title: "Casa Azul", url_path: "shared", reviews_count: 1 }], costUsd: 0 })),
      fetch: vi.fn(async (path) => ({ normalised: review(path, "Rua Azul 7, Lisboa"), returnedCount: 1, costUsd: 0 })),
    };
    const result = await runBaselineTripadvisor([
      restaurant("one", "Casa Azul", "Rua Azul 7, Lisboa"), restaurant("two", "Casa Azul", "Rua Azul 7, Lisboa"),
    ], providers, { now, spend: new BaselineSpendBudget() });
    expect(result.matches).toEqual([]);
    expect(result.skipped.map((item) => item.reason)).toEqual(["shared_listing", "shared_listing"]);
  });

  it("accepts phone or nearby near-identical names when those signals are available", async () => {
    const providers: BaselineTripadvisorProviders = {
      search: vi.fn(async (name) => ({ items: [{ title: name, url_path: name, reviews_count: 1,
        ...(name === "Phone Place" ? { phone: "+351 210 123 456" } : { latitude: 38.7202, longitude: -9.14 }) }], costUsd: 0 })),
      fetch: vi.fn(async (path) => ({ normalised: review(path, "Different street 99, Lisboa"), returnedCount: 1, costUsd: 0 })),
    };
    const byPhone = restaurant("phone", "Phone Place", "Rua Azul 7, Lisboa");
    byPhone.candidate.phone = "210123456";
    const result = await runBaselineTripadvisor([byPhone, restaurant("nearby", "Nearby Place", "Rua Verde 9, Lisboa")],
      providers, { now, spend: new BaselineSpendBudget() });
    expect(result.matches.map((match) => match.googlePlaceId)).toEqual(["phone", "nearby"]);
    expect(result.matches[0]!.evidence.phoneMatch).toBe(true);
    expect(result.matches[1]!.evidence.distanceMeters).toBeLessThan(100);
  });

  it("expands an accepted Listing to its recent Review window", async () => {
    const fetch = vi.fn(async (path: string, depth: number) => {
      const normalised = review(path, "Rua Azul 7, Lisboa");
      normalised.facts.reviewCount = 30;
      if (depth > 10) normalised.reviews = Array.from({ length: 20 }, (_, index) => ({
        ...normalised.reviews[0]!, sourceReviewId: `${path}-${index + 1}`,
      }));
      return { normalised, returnedCount: normalised.reviews.length, costUsd: 0 };
    });
    const result = await runBaselineTripadvisor([restaurant("sampled", "Casa Azul", "Rua Azul 7, Lisboa")], {
      search: async () => ({ items: [{ title: "Casa Azul", url_path: "path", reviews_count: 30 }], costUsd: 0 }),
      fetch,
    }, { now, spend: new BaselineSpendBudget() });
    expect(fetch.mock.calls.map(([, depth]) => depth)).toEqual([10, 30]);
    expect(result.matches[0]!.window).toHaveLength(20);
  });

  it("keeps a same-phone match even when the Listing name changed", async () => {
    const sampled = restaurant("renamed", "Fábrica do Prego", "Rua Azul 7, Lisboa");
    sampled.candidate.phone = "+351 210 123 456";
    const result = await runBaselineTripadvisor([sampled], {
      search: async () => ({ items: [{ title: "Café Estrela", url_path: "renamed-path", phone: "210123456", reviews_count: 1 }], costUsd: 0 }),
      fetch: async (path) => ({ normalised: review(path, "Different street 99, Lisboa"), returnedCount: 1, costUsd: 0 }),
    }, { now, spend: new BaselineSpendBudget() });
    expect(result.matches.map((match) => match.googlePlaceId)).toEqual(["renamed"]);
  });

  it("records a failed matched window and continues with other sampled Restaurants", async () => {
    const fetch = vi.fn(async (path: string, depth: number) => {
      if (path === "broken" && depth > 10) throw new Error("Vendor failed");
      const normalised = review(path, path === "broken" ? "Rua Azul 7, Lisboa" : "Rua Verde 9, Lisboa");
      normalised.facts.reviewCount = path === "broken" ? 30 : 1;
      return { normalised, returnedCount: 1, costUsd: 0 };
    });
    const result = await runBaselineTripadvisor([
      restaurant("one", "Casa Azul", "Rua Azul 7, Lisboa"),
      restaurant("two", "Casa Verde", "Rua Verde 9, Lisboa"),
    ], {
      search: async (name) => ({ items: [{ title: name, url_path: name === "Casa Azul" ? "broken" : "good", reviews_count: 1 }], costUsd: 0 }),
      fetch,
    }, { now, spend: new BaselineSpendBudget() });
    expect(result.matches.map((match) => match.googlePlaceId)).toEqual(["two"]);
    expect(result.skipped).toContainEqual({ googlePlaceId: "one", reason: "review_failed", candidates: [
      { placeRef: "broken", nameSimilarity: 1, addressMatch: true, phoneMatch: null, distanceMeters: null },
    ] });
  });

  it("reserves Tripadvisor search spend before posting a paid task", async () => {
    const search = vi.fn(async () => ({ items: [], costUsd: 0 }));
    await expect(runBaselineTripadvisor([restaurant("sampled", "Casa Azul", "Rua Azul 7, Lisboa")], {
      search, fetch: vi.fn(),
    }, { now, spend: new BaselineSpendBudget({ dataforseo: 49.999 }) })).rejects.toThrow("spend ceiling");
    expect(search).not.toHaveBeenCalled();
  });
});
