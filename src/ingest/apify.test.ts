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
  it("passes the URL to the reviews actor as a plain string", async () => {
    await fetchTheForkListing(nearbyItem.url);
    const start = calls.find((call) => call.method === "POST" && call.path.endsWith("/runs"))!;
    expect(start.path).toBe("/v2/acts/parsebird~thefork-scraper/runs");
    expect(start.body).toMatchObject({ startUrls: [nearbyItem.url], maxRestaurants: 1 });
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
