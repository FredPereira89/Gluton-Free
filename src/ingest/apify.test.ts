import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTheForkListing, searchTheFork } from "./apify";

type Call = { method: string; path: string; search: URLSearchParams; body: unknown };

const nearbyItem = {
  id: "5f0e0a52-uuid", name: "Fictional Copper Spoon", url: "https://www.thefork.com/restaurant/invented-copper-spoon-r90101",
  geolocation: { latitude: 38.7140, longitude: -9.1330 }, reviewCount: 12, rating: 9.2,
};

let calls: Call[];
let runs: { status: string; usageTotalUsd: number }[];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  calls = [];
  runs = [{ status: "SUCCEEDED", usageTotalUsd: 0.25 }];
  process.env.APIFY_TOKEN = "invented-apify-token";
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push({ method: init?.method ?? "GET", path: url.pathname, search: url.searchParams, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (init?.method === "POST" && url.pathname.endsWith("/runs")) return json({ data: { id: "run-1", defaultDatasetId: "ds-1", status: "READY", usageTotalUsd: 0 } });
    if (init?.method === "POST" && url.pathname.endsWith("/abort")) return json({ data: { id: "run-1", status: "ABORTED" } });
    if (url.pathname === "/v2/actor-runs/run-1") {
      const next = runs.length > 1 ? runs.shift()! : runs[0]!;
      return json({ data: { id: "run-1", defaultDatasetId: "ds-1", ...next } });
    }
    if (url.pathname === "/v2/datasets/ds-1/items") return json([nearbyItem]);
    return json({}, 404);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.APIFY_TOKEN;
});

describe("searchTheFork", () => {
  it("searches by coordinates with the search actor and maps items onto the candidate shape", async () => {
    const { items, costUsd } = await searchTheFork({ lat: 38.7634, lng: -9.0964 });
    const start = calls.find((call) => call.method === "POST" && call.path.endsWith("/runs"))!;
    expect(start.path).toBe("/v2/acts/mscraper~thefork-restaurant-scraper/runs");
    expect(start.search.get("maxTotalChargeUsd")).toBe("0.3");
    expect(start.body).toMatchObject({ latitude: 38.7634, longitude: -9.0964, maxResults: 25, maxPages: 1, includeReviews: false, includeExtendedInfo: false });
    expect(items).toEqual([{
      id: "90101", name: "Fictional Copper Spoon", url: nearbyItem.url, latitude: 38.7140, longitude: -9.1330, thefork_review_count: 12,
    }]);
    expect(costUsd).toBe(0.25);
  });

  it("skips items that have no usable restaurant URL", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => json({ data: { id: "run-1", defaultDatasetId: "ds-1", status: "SUCCEEDED", usageTotalUsd: 0.1 } }));
    vi.mocked(fetch).mockImplementationOnce(async () => json([{ ...nearbyItem, url: "https://www.thefork.com/restaurants/lisbon-c1" }, { name: "No url" }]));
    const { items } = await searchTheFork({ lat: 1, lng: 2 });
    expect(items).toEqual([]);
  });
});

describe("fetchTheForkListing", () => {
  const rows = [
    { review_id: 7, rating_value: 10, meal_date: "2026-08-01", review_body: "Superb.", reviewer_first_name: "Invented Name" },
    { review_id: 8, rating_value: 6, meal_date: "2026-07-01", review_body: null },
  ];

  beforeEach(() => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      calls.push({ method: init?.method ?? "GET", path: url.pathname, search: url.searchParams, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (init?.method === "POST" && url.pathname.endsWith("/runs")) {
        const id = url.pathname.includes("clearpath") ? "run-rows" : "run-profile";
        return json({ data: { id, defaultDatasetId: `ds-${id}`, status: "SUCCEEDED", usageTotalUsd: id === "run-rows" ? 0.3 : 0.01 } });
      }
      if (url.pathname === "/v2/datasets/ds-run-rows/items") return json(rows);
      if (url.pathname === "/v2/datasets/ds-run-profile/items") return json([{ id: 90101, name: "Fictional Copper Spoon", reviews: [{ id: "stale" }] }]);
      return json({}, 404);
    });
  });

  it("takes the profile from one actor and the whole Review history from another, without reviewer fields", async () => {
    const { item, costUsd } = await fetchTheForkListing(nearbyItem.url);
    const starts = calls.filter((call) => call.method === "POST" && call.path.endsWith("/runs"));
    expect(starts.map((call) => call.path).sort()).toEqual([
      "/v2/acts/clearpath~thefork-restaurant-reviews/runs", "/v2/acts/parsebird~thefork-scraper/runs",
    ]);
    expect(starts.find((call) => call.path.includes("parsebird"))!.body).toMatchObject({ startUrls: [nearbyItem.url], maxRestaurants: 1, maxReviews: 0 });
    expect(starts.find((call) => call.path.includes("clearpath"))!.body).toEqual({
      restaurantUrl: nearbyItem.url, reviewLanguage: "all", sortBy: "newest", maxReviews: 100,
    });
    expect(item).toEqual({
      id: 90101, name: "Fictional Copper Spoon",
      reviews: [
        { id: 7, rating_value: 10, meal_date: "2026-08-01", review_body: "Superb." },
        { id: 8, rating_value: 6, meal_date: "2026-07-01", review_body: null },
      ],
    });
    expect(costUsd).toBeCloseTo(0.31, 6);
  });

  it("reports what both runs cost when one of them fails", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (init?.method === "POST" && url.pathname.includes("clearpath")) return json({ data: { id: "run-rows", defaultDatasetId: "ds-run-rows", status: "FAILED", usageTotalUsd: 0.02 } });
      return original(input, init);
    });
    await expect(fetchTheForkListing(nearbyItem.url)).rejects.toMatchObject({ costUsd: expect.closeTo(0.03, 6) });
  });
});

describe("the cost of a finished run", () => {
  // Apify reports SUCCEEDED with only the start fee; the per-result charges land a moment later.
  function lagging(reread: Record<string, unknown>) {
    let reads = 0;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (init?.method === "POST" && url.pathname.endsWith("/runs")) return json({ data: { id: "run-1", defaultDatasetId: "ds-1", status: "READY", usageTotalUsd: 0 } });
      if (url.pathname === "/v2/actor-runs/run-1") {
        reads += 1;
        return json({ data: { id: "run-1", defaultDatasetId: "ds-1", status: "SUCCEEDED", ...(reads === 1 ? { usageTotalUsd: 0.0001 } : reread) } });
      }
      return json([nearbyItem]);
    });
  }

  it("reads the run again once the dataset is out, and reports the settled total", async () => {
    lagging({ usageTotalUsd: 0.2501 });
    expect((await searchTheFork({ lat: 1, lng: 2 })).costUsd).toBe(0.2501);
  });

  it("falls back to the counted events at their list price when the total still lags", async () => {
    lagging({
      usageTotalUsd: 0.0001, chargedEventCounts: { "apify-actor-start": 1, "apify-default-dataset-item": 25 },
      pricingInfo: { pricingPerEvent: { actorChargeEvents: { "apify-actor-start": { eventPriceUsd: 0.0001 }, "apify-default-dataset-item": { eventPriceUsd: 0.01 } } } },
    });
    expect((await searchTheFork({ lat: 1, lng: 2 })).costUsd).toBeCloseTo(0.2501, 6);
  });
});

describe("a run that does not finish in time", () => {
  it("aborts it and reports what Apify finally charged", async () => {
    runs = [{ status: "RUNNING", usageTotalUsd: 0.02 }];
    // After the abort the final status carries the real total.
    const order: string[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      order.push(`${init?.method ?? "GET"} ${url.pathname}`);
      if (init?.method === "POST" && url.pathname.endsWith("/runs")) return json({ data: { id: "run-1", defaultDatasetId: "ds-1", status: "READY", usageTotalUsd: 0 } });
      if (init?.method === "POST" && url.pathname.endsWith("/abort")) return json({ data: { id: "run-1", status: "ABORTING" } });
      const aborted = order.some((entry) => entry.endsWith("/abort"));
      return json({ data: { id: "run-1", status: aborted ? "ABORTED" : "RUNNING", usageTotalUsd: aborted ? 0.048 : 0.02 } });
    });
    await expect(searchTheFork({ lat: 1, lng: 2 })).rejects.toMatchObject({ costUsd: 0.048 });
    expect(order.filter((entry) => entry.endsWith("/abort"))).toHaveLength(1);
  }, 30_000);
});
