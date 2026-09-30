import { describe, expect, it, vi } from "vitest";
import { FORMATS, baselineFormat, isFoodCategoryId } from "@/domain/baseline-format";
import type { BusinessListing } from "@/ingest/dataforseo-business-listings";
import { insideLisboaMunicipality } from "./lisboa-boundary";
import { runBaselineSweep, type BaselineProviders } from "./baseline";

const now = new Date("2026-09-30T12:00:00.000Z");
const recent = new Date("2026-09-20T09:00:00.000Z");

function listing(overrides: Partial<BusinessListing> = {}): BusinessListing {
  return {
    type: "business_listing",
    place_id: "fictional-lisbon-restaurant",
    title: "Casa Imaginária",
    address: "1 Fictional Street, Lisbon",
    address_info: { borough: "Mouraria", city: "Lisbon" },
    latitude: 38.7223,
    longitude: -9.1393,
    category: "Portuguese restaurant",
    category_ids: ["portuguese_restaurant", "restaurant"],
    additional_categories: [],
    rating: { value: 4.6, votes_count: 50 },
    price_level: "moderate",
    work_time: { work_hours: { current_status: "open" } },
    ...overrides,
  };
}

describe("Lisbon baseline candidate sweep", () => {
  it("drops listings outside Lisboa, closed listings, thin listings, and listings without a recent Review", async () => {
    const candidates = [
      listing(),
      listing({ place_id: "outside", title: "Outside", latitude: 38.81 }),
      listing({ place_id: "closed", title: "Closed", work_time: { work_hours: { current_status: "closed_forever" } } }),
      listing({ place_id: "thin", title: "Thin", rating: { value: 4.8, votes_count: 24 } }),
      listing({ place_id: "stale", title: "Stale" }),
    ];
    const onVendorCost = vi.fn(async (_costUsd: number) => undefined);
    const onProgress = vi.fn(async (_step: string) => undefined);
    const recentReviews = vi.fn(async (placeIds: string[], _sleep?: (seconds: number) => Promise<void>, trackCost?: (costUsd: number) => void | Promise<void>) => {
      await trackCost?.(0.003);
      return {
        newestByPlaceId: new Map<string, Date | null>([["fictional-lisbon-restaurant", recent], ["stale", new Date("2025-09-29T11:59:59.000Z")]]),
        costUsd: 0.003,
      };
    });
    const providers: BaselineProviders = {
      searchListings: async (trackCost) => {
        await trackCost?.(0.04);
        return { items: candidates, costUsd: 0.04 };
      },
      recentReviews,
    };

    const report = await runBaselineSweep(providers, now, { onVendorCost, onProgress });

    expect(recentReviews).toHaveBeenCalledWith(["fictional-lisbon-restaurant", "stale"], undefined, onVendorCost);
    expect(onVendorCost.mock.calls.map(([cost]) => cost)).toEqual([0.04, 0.003]);
    expect(onProgress.mock.calls.map(([step]) => step)).toEqual([
      "Searching Google Business Listings", "Checking recent Google Reviews", "Classifying baseline candidates",
    ]);
    expect(report.candidates.map((candidate) => candidate.placeId)).toEqual(["fictional-lisbon-restaurant"]);
    expect(report.candidates[0]).toMatchObject({ format: "tasca", formatProvenance: "baseline_auto", priceTier: "€€" });
    expect(FORMATS).toContain(report.candidates[0]!.format);
    expect(report.dropped).toEqual({
      not_food_category: 0,
      missing_listing_data: 0,
      outside_boundary: 1,
      not_open: 1,
      fewer_than_25_reviews: 1,
      no_recent_google_review: 1,
    });
    expect(report.countsByFormat.tasca).toBe(1);
    expect(Object.keys(report.countsByFormat)).toHaveLength(FORMATS.length);
    expect(report.costs).toEqual({
      businessListingsBilledUsd: 0.04,
      recencyChecksBilledUsd: 0.003,
      estimatedFullGoogleReviewsUsd: 0.0105,
      estimatedTotalVendorUsd: 0.0535,
    });
  });

  it("uses the checked-in municipality boundary and excludes non-food categories", async () => {
    expect(insideLisboaMunicipality({ lat: 38.7223, lng: -9.1393 })).toBe(true);
    expect(insideLisboaMunicipality({ lat: 38.81, lng: -9.1393 })).toBe(false);
    expect(isFoodCategoryId("Portuguese restaurant")).toBe(true);
    expect(isFoodCategoryId("made_up_regional_restaurant")).toBe(true);
    expect(isFoodCategoryId("food_court")).toBe(true);
    expect(isFoodCategoryId("bubble_tea_shop")).toBe(true);
    expect(isFoodCategoryId("marisqueira")).toBe(true);
    expect(isFoodCategoryId("barbecue_spots")).toBe(true);
    expect(isFoodCategoryId("chinese_food")).toBe(true);
    expect(isFoodCategoryId("seafood_donburi")).toBe(true);
    expect(isFoodCategoryId("delivery_chinese_restaurant")).toBe(false);
    expect(isFoodCategoryId("bar")).toBe(false);
    expect(isFoodCategoryId("grocery_store")).toBe(false);
    expect(isFoodCategoryId("bus_stop")).toBe(false);

    const report = await runBaselineSweep({
      searchListings: async () => ({ items: [listing({ category: "Bus stop", category_ids: ["bus_stop"] })], costUsd: 0 }),
      recentReviews: async () => { throw new Error("No freshness request should be needed"); },
    }, now);
    expect(report.candidates).toEqual([]);
    expect(report.dropped.not_food_category).toBe(1);
  });

  it("preassigns every kept candidate to a Format using category and Google price metadata", () => {
    expect(baselineFormat(["portuguese_restaurant"], "€")).toBe("tasca");
    expect(baselineFormat(["portuguese_restaurant"], "€€€")).toBe("restaurante_tradicional");
    expect(baselineFormat(["bar_and_grill"], null)).toBe("churrasqueira");
    expect(baselineFormat(["steak_house"], null)).toBe("churrasqueira");
    expect(baselineFormat(["chinese_food"], null)).toBe("international_casual");
    expect(baselineFormat(["seafood_donburi"], null)).toBe("marisqueira_cervejaria");
    expect(baselineFormat(["fine_dining_restaurant"], "€€€€")).toBe("fine_dining");
    expect(baselineFormat(["coffee_shop"], "€€")).toBe("cafe_pastelaria");
    expect(baselineFormat(["italian_restaurant", "restaurant"], "€€")).toBe("international_casual");
  });
});
