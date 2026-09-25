import { describe, expect, it } from "vitest";
import { choosePriceTier } from "./restaurant-facts";

describe("Price tier Source order", () => {
  it("uses the first Source with a price and falls back to Reviews", () => {
    const listings = [
      { source: "tripadvisor", priceLevel: "$$$$" },
      { source: "google", priceLevel: "moderate" },
      { source: "thefork", priceLevel: "25 € average" },
    ];
    expect(choosePriceTier(listings, "€")).toEqual({ tier: "€€", provenance: "source" });
    expect(choosePriceTier(listings.slice(0, 2), "€")).toEqual({ tier: "€€", provenance: "source" });
    expect(choosePriceTier(listings.slice(0, 1), "€")).toEqual({ tier: "€€€€", provenance: "source" });
    expect(choosePriceTier([], "€")).toEqual({ tier: "€", provenance: "llm" });
    expect(choosePriceTier([], null)).toBeNull();
    expect(choosePriceTier([{ source: "thefork", priceLevel: "14 €" }], null)?.tier).toBe("€");
    expect(choosePriceTier([{ source: "thefork", priceLevel: "30 €" }], null)?.tier).toBe("€€€");
    expect(choosePriceTier([{ source: "thefork", priceLevel: "61 €" }], null)?.tier).toBe("€€€€");
  });
});
