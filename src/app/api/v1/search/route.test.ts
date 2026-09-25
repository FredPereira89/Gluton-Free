import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { routes } from "@/lib/api-contract";
import { searchKnownRestaurants } from "@/web/data";
import { recordSearchCost, spendCapStatus } from "@/lib/spend-cap";

vi.mock("@/web/data", () => ({ searchKnownRestaurants: vi.fn() }));
vi.mock("@/lib/spend-cap", () => ({ spendCapStatus: vi.fn(), recordSearchCost: vi.fn() }));

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
  vi.mocked(spendCapStatus).mockResolvedValue({ atCap: false, resetAt: "2026-09-26T00:00:00.000Z" });
  vi.mocked(recordSearchCost).mockResolvedValue(undefined);
  process.env.DATAFORSEO_LOGIN = "test";
  process.env.DATAFORSEO_PASSWORD = "test";
});

describe("GET /api/v1/search", () => {
  it("recognises a Google place ID without searching its text as a name", async () => {
    vi.mocked(searchKnownRestaurants).mockResolvedValueOnce([]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      status_code: 20000, tasks: [{ status_code: 20000, cost: 0.004, result: [{ items: [
        { ...item("ChIJexact123", "Casa Exacta"), type: "google_business_info" },
      ] }] }],
    }));
    const response = await GET(new Request("https://app.example/api/v1/search?q=ChIJexact123"));
    const body = routes.search.responses[200].parse(await response.json());
    expect(response.status).toBe(200);
    expect(body.recognised).toMatchObject({ placeId: "ChIJexact123", name: "Casa Exacta" });
    expect(body.candidates).toEqual([]);
    expect(recordSearchCost).toHaveBeenCalledWith(0.004);
  });
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
    expect(routes.search.responses[200].parse(await empty.json())).toEqual({ known: [], candidates: [], recognised: null, message: null });
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

  it("warns when coordinates are clearly outside Lisbon and the vendor omits city", async () => {
    vi.mocked(searchKnownRestaurants).mockResolvedValueOnce([]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(vendor([
      { ...item("far-id", "Far Away"), address_info: null, latitude: 41.15, longitude: -8.61 },
    ]));
    const response = await GET(new Request("https://app.example/api/v1/search?q=far"));
    const body = routes.search.responses[200].parse(await response.json());
    expect(body.candidates[0]?.warnings).toContain("outside_lisbon");
  });

  it("records the vendor's Maps-search cost when under the daily spend cap", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      status_code: 20000, status_message: "Ok",
      tasks: [{ status_code: 20000, status_message: "Ok", cost: 0.002, result: [{ items: [] }] }],
    }));
    const response = await GET(new Request("https://app.example/api/v1/search?q=casa"));
    expect(response.status).toBe(200);
    expect(spendCapStatus).toHaveBeenCalledTimes(1);
    expect(recordSearchCost).toHaveBeenCalledWith(0.002);
  });

  it("returns 429 spend_cap_reached with the reset time once the daily cap is hit, without calling the vendor", async () => {
    vi.mocked(spendCapStatus).mockResolvedValue({ atCap: true, resetAt: "2026-09-26T00:00:00.000Z" });
    const fetch = vi.spyOn(globalThis, "fetch");
    const response = await GET(new Request("https://app.example/api/v1/search?q=casa"));
    expect(response.status).toBe(429);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    const body = routes.search.responses[429].parse(await response.json());
    expect(body.code).toBe("spend_cap_reached");
    expect(body.resetAt).toBe("2026-09-26T00:00:00.000Z");
    expect(fetch).not.toHaveBeenCalled();
    expect(recordSearchCost).not.toHaveBeenCalled();
  });

  it("recognises a Google Maps link carrying a place ID", async () => {
    vi.mocked(searchKnownRestaurants).mockResolvedValueOnce([known]);
    vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("Vendor should not be called"); });
    const link = "https://www.google.com/maps/search/?api=1&query=Casa+do+Mar&query_place_id=known-id";
    const response = await GET(new Request(`https://app.example/api/v1/search?q=${encodeURIComponent(link)}`));
    const body = routes.search.responses[200].parse(await response.json());
    expect(body.recognised).toMatchObject({ slug: "casa-do-mar", name: "Casa do Mar" });
    expect(body.known).toEqual([]);
    expect(body.candidates).toEqual([]);
  });

  it("follows a short Google Maps link and recognises the resulting Restaurant", async () => {
    vi.mocked(searchKnownRestaurants).mockResolvedValueOnce([]);
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://www.google.com/maps/place/Casa+Exacta/?q=place_id%3AChIJexact123" } }))
      .mockResolvedValueOnce(Response.json({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [
        { ...item("ChIJexact123", "Casa Exacta"), type: "google_business_info" },
      ] }] }] }));
    const response = await GET(new Request("https://app.example/api/v1/search?q=https%3A%2F%2Fmaps.app.goo.gl%2Fabc123"));
    const body = routes.search.responses[200].parse(await response.json());
    expect(body.recognised).toMatchObject({ placeId: "ChIJexact123", name: "Casa Exacta" });
  });

  it("recognises a Google Maps CID link", async () => {
    vi.mocked(searchKnownRestaurants).mockResolvedValueOnce([]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [
        { ...item("ChIJfromCid123", "Casa Exacta"), type: "google_business_info" },
      ] }] }],
    }));
    const link = "https://maps.google.com/?cid=123456789";
    const response = await GET(new Request(`https://app.example/api/v1/search?q=${encodeURIComponent(link)}`));
    const body = routes.search.responses[200].parse(await response.json());
    expect(body.recognised).toMatchObject({ placeId: "ChIJfromCid123", name: "Casa Exacta" });
  });

  it("recognises a Google Maps place link without an embedded ID", async () => {
    vi.mocked(searchKnownRestaurants).mockResolvedValueOnce([]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(vendor([item("matched-id", "Casa Exacta")]));
    const link = "https://www.google.com/maps/place/Casa+Exacta/@38.72,-9.14,17z";
    const response = await GET(new Request(`https://app.example/api/v1/search?q=${encodeURIComponent(link)}`));
    const body = routes.search.responses[200].parse(await response.json());
    expect(body.recognised).toMatchObject({ placeId: "matched-id", name: "Casa Exacta" });
  });

  it.each([
    ["Tripadvisor", "https://www.tripadvisor.com/Restaurant_Review-g189158-d123456-Reviews-Casa_Exacta-Lisbon_Lisbon_District.html"],
    ["Tripadvisor hyphenated name", "https://www.tripadvisor.com/Restaurant_Review-g189158-d123456-Reviews-Casa-Exacta-Lisbon_Lisbon_District.html"],
    ["TheFork", "https://www.thefork.com/restaurant/casa-exacta-r123456"],
    ["TheFork Portugal", "https://www.thefork.pt/restaurante/casa-exacta-r123456"],
    ["TheFork older Portugal link", "https://www.thefork.pt/restaurante/casa-exacta/123456"],
  ])("recognises a %s URL by its Restaurant name", async (_source, link) => {
    vi.mocked(searchKnownRestaurants).mockResolvedValueOnce([]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(vendor([item("matched-id", "Casa Exacta")]));
    const response = await GET(new Request(`https://app.example/api/v1/search?q=${encodeURIComponent(link)}`));
    const body = routes.search.responses[200].parse(await response.json());
    expect(body.recognised).toMatchObject({ placeId: "matched-id", name: "Casa Exacta" });
    expect(body.candidates).toEqual([]);
  });

  it("explains an unrecognised URL without searching the URL as a name", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("Vendor should not be called"); });
    const response = await GET(new Request("https://app.example/api/v1/search?q=https%3A%2F%2Fexample.com%2Frestaurant"));
    const body = routes.search.responses[200].parse(await response.json());
    expect(body).toMatchObject({ recognised: null, known: [], candidates: [] });
    expect(body.message).toMatch(/link.*not recognised/i);
  });

  it("does not guess when a linked name matches several Restaurants", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(vendor([item("a", "Casa Exacta"), item("b", "Casa Exacta")]));
    const link = "https://www.thefork.com/restaurant/casa-exacta-r123456";
    const response = await GET(new Request(`https://app.example/api/v1/search?q=${encodeURIComponent(link)}`));
    const body = routes.search.responses[200].parse(await response.json());
    expect(body.recognised).toBeNull();
    expect(body.message).toMatch(/several restaurants/i);
  });

  it("does not follow a short link to an unrelated host", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://example.com/private" } }));
    const response = await GET(new Request("https://app.example/api/v1/search?q=https%3A%2F%2Fmaps.app.goo.gl%2Funsafe"));
    const body = routes.search.responses[200].parse(await response.json());
    expect(body.message).toMatch(/link.*not recognised/i);
  });

  it("hides a permanently closed Restaurant resolved by Google place ID", async () => {
    vi.mocked(searchKnownRestaurants).mockResolvedValueOnce([]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [
        { ...item("ChIJclosed123", "Casa Closed"), type: "google_business_info",
          work_time: { work_hours: { current_status: "closed_forever" } }, work_hours: undefined },
      ] }] }],
    }));
    const response = await GET(new Request("https://app.example/api/v1/search?q=ChIJclosed123"));
    const body = routes.search.responses[200].parse(await response.json());
    expect(body.recognised).toBeNull();
    expect(body.candidates).toEqual([]);
  });
});
