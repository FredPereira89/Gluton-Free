import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { routes } from "@/lib/api-contract";
import { searchKnownRestaurants } from "@/web/data";

vi.mock("@/web/data", () => ({ searchKnownRestaurants: vi.fn() }));

const known = { slug: "casa-do-mar", placeId: "known-id", name: "Casa do Mar", address: "Rua A, Lisboa", distanceMeters: 100,
  stars: 4.5, reviewCount: 42, category: "Restaurant", priceTier: "€€", status: "open" } as const;

function vendor(items: unknown[]) {
  return Response.json({ status_code: 20000, status_message: "Ok", tasks: [{ status_code: 20000,
    status_message: "Ok", result: [{ items }] }] });
}

function item(placeId: string, title: string, city = "Lisbon", category = "Restaurant", status = "open") {
  return { type: "maps_search", place_id: placeId, title, address: `Rua B, ${city}`,
    address_info: { city }, latitude: 38.723, longitude: -9.14, category,
    rating: { value: 4.2, votes_count: 12 }, price_level: "moderate",
    work_hours: { current_status: status } };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(searchKnownRestaurants).mockResolvedValue([known]);
  process.env.DATAFORSEO_LOGIN = "test";
  process.env.DATAFORSEO_PASSWORD = "test";
});

describe("GET /api/v1/search", () => {
  it("puts known Restaurants first and never offers them as new candidates", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(vendor([
      item("known-id", "Casa do Mar"), item("new-id", "Casa Nova"), item("closed-id", "Gone", "Lisbon", "Restaurant", "closed_forever"),
    ]));
    const response = await GET(new Request("https://app.example/api/v1/search?q=casa&near=38.72,-9.14"));
    const body = routes.search.responses[200].parse(await response.json());
    expect(body.known.map((r) => r.slug)).toEqual(["casa-do-mar"]);
    expect(body.candidates.map((r) => r.placeId)).toEqual(["new-id"]);
    expect(body.candidates[0]).toMatchObject({ stars: 4.2, reviewCount: 12, priceTier: "€€" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))[0]).toMatchObject({
      keyword: "casa", location_coordinate: "38.72,-9.14,17z", language_code: "pt",
    });
  });

  it("warns about shared names, outside Lisbon, and bars or cafés", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(vendor([
      item("one", "Mimo"), item("two", "Mimo"), item("three", "Fora", "Oeiras"), item("four", "Café Sol", "Lisbon", "Cafe"),
    ]));
    const response = await GET(new Request("https://app.example/api/v1/search?q=mimo"));
    const body = routes.search.responses[200].parse(await response.json());
    expect(body.candidates.map((r) => r.warnings)).toEqual([
      ["same_name"], ["same_name"], ["outside_lisbon"], ["maybe_not_restaurant"],
    ]);
  });

  it("does not call the vendor for an empty query and rejects invalid coordinates", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const empty = await GET(new Request("https://app.example/api/v1/search?q="));
    expect(routes.search.responses[200].parse(await empty.json())).toEqual({ known: [], candidates: [] });
    expect(fetch).not.toHaveBeenCalled();
    const invalid = await GET(new Request("https://app.example/api/v1/search?q=casa&near=100,0"));
    expect(invalid.status).toBe(400);
    expect(routes.search.responses[400].parse(await invalid.json()).code).toBe("invalid_request");
  });

  it("recognises a looked-up Restaurant by Google ID even when its saved name differs", async () => {
    vi.mocked(searchKnownRestaurants).mockResolvedValueOnce([{ ...known, name: "Saved name" }]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(vendor([item("known-id", "Google name")]));
    const response = await GET(new Request("https://app.example/api/v1/search?q=google"));
    const body = routes.search.responses[200].parse(await response.json());
    expect(body.known[0]?.name).toBe("Saved name");
    expect(body.candidates).toEqual([]);
    expect(searchKnownRestaurants).toHaveBeenCalledWith("google", ["known-id"]);
  });
});
