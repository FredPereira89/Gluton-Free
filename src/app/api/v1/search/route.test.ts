import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { routes } from "@/lib/api-contract";
import { searchKnownRestaurants } from "@/web/data";

vi.mock("@/web/data", () => ({ searchKnownRestaurants: vi.fn() }));

const known = { slug: "casa-do-mar", placeId: "known-id", name: "Casa do Mar", address: "Rua A, Lisboa", distanceMeters: null,
  stars: 4.5, reviewCount: 42, category: "Restaurant", priceTier: "€€", status: "open" } as const;

async function search(q: string) {
  const response = await GET(new Request(`https://app.example/api/v1/search?q=${encodeURIComponent(q)}`));
  return { response, body: routes.search.responses[200].parse(await response.json()) };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(searchKnownRestaurants).mockReset().mockResolvedValue([known]);
  vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("Search reads only the database"); });
});

describe("GET /api/v1/search", () => {
  it("lists stored Restaurants matching a name, without the place ID, and never calls a vendor", async () => {
    const { response, body } = await search("casa");
    expect(response.status).toBe(200);
    expect(body.known.map((r) => r.slug)).toEqual(["casa-do-mar"]);
    expect(body.known[0]).not.toHaveProperty("placeId");
    expect(body.candidates).toEqual([]);
    expect(body.recognised).toBeNull();
    expect(body.message).toBeNull();
    expect(searchKnownRestaurants).toHaveBeenCalledWith("casa", [], undefined);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("answers 'No Restaurants found' when nothing is stored under that name", async () => {
    vi.mocked(searchKnownRestaurants).mockResolvedValueOnce([]);
    const { response, body } = await search("zzzz");
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ known: [], candidates: [], recognised: null, message: expect.stringContaining("No Restaurants found") });
  });

  it("returns an empty answer for an empty query without reading the database", async () => {
    const { body } = await search("");
    expect(body).toEqual({ known: [], candidates: [], recognised: null, message: null });
    expect(searchKnownRestaurants).not.toHaveBeenCalled();
  });

  it("rejects a name that is too long", async () => {
    const response = await GET(new Request(`https://app.example/api/v1/search?q=${"a".repeat(121)}`));
    expect(response.status).toBe(400);
    expect(routes.search.responses[400].parse(await response.json()).code).toBe("invalid_request");
  });

  it("recognises a stored Restaurant by Google place ID", async () => {
    const { body } = await search("ChIJexact123");
    expect(searchKnownRestaurants).toHaveBeenCalledWith("", ["ChIJexact123"], undefined);
    expect(body.recognised).toMatchObject({ slug: "casa-do-mar", name: "Casa do Mar" });
    expect(body.known).toEqual([]);
  });

  it("says so when no stored Restaurant has that Google place ID", async () => {
    vi.mocked(searchKnownRestaurants).mockResolvedValueOnce([]);
    const { body } = await search("ChIJexact123");
    expect(body).toMatchObject({ recognised: null, known: [], message: "No Restaurant found for that Google place ID." });
  });

  it("recognises a Google Maps link carrying a place ID", async () => {
    const link = "https://www.google.com/maps/search/?api=1&query=Casa+do+Mar&query_place_id=known-id";
    const { body } = await search(link);
    expect(searchKnownRestaurants).toHaveBeenCalledWith("", ["known-id"], undefined);
    expect(body.recognised).toMatchObject({ slug: "casa-do-mar" });
    expect(body.known).toEqual([]);
  });

  it("looks a Google Maps CID link up by its stored Listing", async () => {
    const link = "https://maps.google.com/?cid=123456789";
    const { body } = await search(link);
    expect(searchKnownRestaurants).toHaveBeenCalledWith("", [], { sourceCode: "google", sourceUrl: link, placeRef: "123456789" });
    expect(body.recognised).toMatchObject({ slug: "casa-do-mar" });
  });

  it("says so when no stored Restaurant has that Google Maps CID", async () => {
    vi.mocked(searchKnownRestaurants).mockResolvedValueOnce([]);
    const { body } = await search("cid:123456789");
    expect(body.message).toBe("No Restaurant found for that Google Maps link.");
  });

  it("looks a Google Maps place link up by its name", async () => {
    const link = "https://www.google.com/maps/place/Casa+do+Mar/@38.72,-9.14,17z";
    const { body } = await search(link);
    expect(searchKnownRestaurants).toHaveBeenCalledWith("", [], expect.objectContaining({ sourceCode: "google", linkedName: "Casa do Mar" }));
    expect(body.recognised).toMatchObject({ slug: "casa-do-mar" });
  });

  it("looks a short Google Maps link up by its stored Listing without following it", async () => {
    const link = "https://maps.app.goo.gl/abc123";
    await search(link);
    expect(searchKnownRestaurants).toHaveBeenCalledWith("", [], { sourceCode: "google", sourceUrl: link, placeRef: "abc123", linkedName: undefined });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["Tripadvisor", "tripadvisor", "https://www.tripadvisor.com/Restaurant_Review-g189158-d123456-Reviews-Casa_Exacta-Lisbon_Lisbon_District.html"],
    ["Tripadvisor hyphenated name", "tripadvisor", "https://www.tripadvisor.com/Restaurant_Review-g189158-d123456-Reviews-Casa-Exacta-Lisbon_Lisbon_District.html"],
    ["TheFork", "thefork", "https://www.thefork.com/restaurant/casa-exacta-r123456"],
    ["TheFork Portugal", "thefork", "https://www.thefork.pt/restaurante/casa-exacta-r123456"],
    ["TheFork older Portugal link", "thefork", "https://www.thefork.pt/restaurante/casa-exacta/123456"],
  ])("recognises a %s URL by its stored Listing", async (_source, sourceCode, link) => {
    const { body } = await search(link);
    expect(searchKnownRestaurants).toHaveBeenCalledWith("", [], expect.objectContaining({ sourceCode, sourceUrl: link }));
    expect(body.recognised).toMatchObject({ slug: "casa-do-mar" });
    expect(body.candidates).toEqual([]);
  });

  it("does not guess when a link matches several stored Restaurants", async () => {
    vi.mocked(searchKnownRestaurants).mockResolvedValueOnce([known, { ...known, slug: "casa-do-mar-2", placeId: "other-id" }]);
    const { body } = await search("https://www.thefork.com/restaurant/casa-exacta-r123456");
    expect(body.recognised).toBeNull();
    expect(body.known.map((r) => r.slug)).toEqual(["casa-do-mar", "casa-do-mar-2"]);
  });

  it("says so when no stored Listing has that link", async () => {
    vi.mocked(searchKnownRestaurants).mockResolvedValueOnce([]);
    const { body } = await search("https://www.thefork.com/restaurant/casa-exacta-r123456");
    expect(body.message).toBe("No Restaurant found for that stored Listing link.");
  });

  it("explains an unrecognised URL without searching the URL as a name", async () => {
    const { body } = await search("https://example.com/restaurant");
    expect(body).toMatchObject({ recognised: null, known: [], candidates: [] });
    expect(body.message).toMatch(/link.*not recognised/i);
    expect(searchKnownRestaurants).not.toHaveBeenCalled();
  });
});
