import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTripadvisorSearch } from "@/ingest/dataforseo";
import {
  estimateLookup, googleMapsUrl, pollTripadvisorSearch, predictNotEnoughEvidence, predictTextReviews,
  proposeGoogleListing, proposeTheForkListings, proposeTripadvisorListings, tripadvisorUrl,
} from "./preview";

vi.mock("@/ingest/dataforseo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ingest/dataforseo")>();
  return { ...actual, getTripadvisorSearch: vi.fn() };
});

beforeEach(() => vi.restoreAllMocks());

describe("proposeGoogleListing", () => {
  it("is always confident and marked for auto-accept, resolved by exact place ID", () => {
    const listing = proposeGoogleListing("Casa do Bacalhau", "ChIJabc123", 42);
    expect(listing.confidence).toBe("confident");
    expect(listing.autoAccept).toBe(true);
    expect(listing.url).toBe(googleMapsUrl("ChIJabc123"));
    expect(listing.evidence.nameSimilarity).toBe(1);
  });
});

describe("proposeTripadvisorListings", () => {
  it("keeps a near-identical name uncertain without distance or phone evidence", () => {
    const [listing] = proposeTripadvisorListings("Casa do Bacalhau", [
      { title: "Casa do Bacalhau", url_path: "/Restaurant_Review-g1-d1-Reviews-Casa_do_Bacalhau.html", reviews_count: 80 },
    ]);
    expect(listing).not.toBeNull();
    expect(listing!.confidence).toBe("uncertain");
    expect(listing!.autoAccept).toBe(false);
    expect(listing!.evidence.distanceMeters).toBeNull();
    expect(listing!.evidence.phoneMatch).toBeNull();
    expect(listing!.url).toBe(tripadvisorUrl("/Restaurant_Review-g1-d1-Reviews-Casa_do_Bacalhau.html"));
  });

  it("marks a loosely similar name as uncertain and not for auto-accept", () => {
    const [listing] = proposeTripadvisorListings("Casa do Bacalhau", [
      { title: "Casa Bacalhau Grill", url_path: "/Restaurant_Review-g1-d2-Reviews.html", reviews_count: 10 },
    ]);
    expect(listing).not.toBeNull();
    expect(listing!.confidence).toBe("uncertain");
    expect(listing!.autoAccept).toBe(false);
  });

  it("returns plausible distinct candidates ordered by name similarity", () => {
    const listings = proposeTripadvisorListings("Casa do Bacalhau", [
      { title: "Casa do Bacalhau PT", url_path: "/a.html", reviews_count: 5 },
      { title: "Casa do Bacalhau", url_path: "/b.html", reviews_count: 80 },
      { title: "Casa do Bacalhau Lisboa", url_path: "/c.html", reviews_count: 10 },
      { title: "Casa do Bacalhau Lisboa", url_path: "/c.html", reviews_count: 10 },
    ]);
    expect(listings.map((listing) => listing.url)).toEqual([
      tripadvisorUrl("/b.html"), tripadvisorUrl("/a.html"), tripadvisorUrl("/c.html"),
    ]);
  });

  it("returns no candidate when nothing plausibly matches", () => {
    const listing = proposeTripadvisorListings("Casa do Bacalhau", [
      { title: "Pizzaria Roma", url_path: "/c.html", reviews_count: 5 },
    ]);
    expect(listing).toEqual([]);
  });

  it("returns no candidates when search found nothing", () => {
    expect(proposeTripadvisorListings("Casa do Bacalhau", [])).toEqual([]);
  });
});

describe("predictNotEnoughEvidence", () => {
  it("predicts Not enough evidence for a Restaurant with few Google reviews", () => {
    expect(predictTextReviews(10)).toBe(5);
    expect(predictNotEnoughEvidence(10)).toBe(true);
  });

  it("predicts enough evidence for a Restaurant with plenty of Google reviews", () => {
    expect(predictNotEnoughEvidence(200)).toBe(false);
  });

  it("treats an unknown review count as Not enough evidence", () => {
    expect(predictNotEnoughEvidence(null)).toBe(true);
  });
});

describe("estimateLookup", () => {
  it("sums predicted text Reviews, cost and minutes across Listings without a cross-source cap", () => {
    const estimate = estimateLookup([{ reviewCount: 200 }, { reviewCount: 200 }]);
    // Each source predicts min(reviewWindowCap=100, 200*0.5=100) = 100 text Reviews; summed across two sources.
    expect(estimate.textReviews).toBe(200);
    expect(estimate.costUsd).toBeGreaterThan(0);
    expect(estimate.minutes).toBeGreaterThanOrEqual(1);
  });

  it("prices the depth a Lookup really fetches, capped at 200, however many Reviews the Listing has", () => {
    const huge = estimateLookup([{ reviewCount: 1859 }]);
    expect(huge.costUsd).toBe(0.02);
    expect(huge.minutes).toBe(10);
    expect(estimateLookup([{ reviewCount: 1_000_000 }])).toEqual(huge);
    expect(huge.textReviews).toBe(100);
  });

  it("estimates nothing for a Restaurant with no Listings", () => {
    expect(estimateLookup([])).toEqual({ textReviews: 0, costUsd: 0, minutes: 1 });
  });
});

describe("pollTripadvisorSearch", () => {
  it("returns the items as soon as the task is ready", async () => {
    vi.mocked(getTripadvisorSearch).mockResolvedValueOnce({ items: [{ title: "Casa do Bacalhau" }], cost: 0.02 });
    const result = await pollTripadvisorSearch("task-1", { sleep: vi.fn().mockResolvedValue(undefined) });
    expect(result.items).toEqual([{ title: "Casa do Bacalhau" }]);
    expect(result.cost).toBe(0.02);
    expect(getTripadvisorSearch).toHaveBeenCalledTimes(1);
  });

  it("retries while the task is not ready, then returns once it is", async () => {
    vi.mocked(getTripadvisorSearch).mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({ items: [], cost: 0.02 });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await pollTripadvisorSearch("task-1", { attempts: 4, sleep });
    expect(result.cost).toBe(0.02);
    expect(getTripadvisorSearch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up after the bounded number of attempts, returning no items", async () => {
    vi.mocked(getTripadvisorSearch).mockResolvedValue(null);
    const result = await pollTripadvisorSearch("task-1", { attempts: 3, sleep: vi.fn().mockResolvedValue(undefined) });
    expect(result).toEqual({ items: [], cost: 0 });
    expect(getTripadvisorSearch).toHaveBeenCalledTimes(3);
  });
});

describe("proposeTheForkListings", () => {
  const restaurant = { name: "Casa do Bacalhau", lat: 38.7139, lng: -9.1334 };
  const nearby = { id: 101, name: "Casa do Bacalhau", url: "https://www.thefork.com/restaurant/casa-do-bacalhau-r101", latitude: 38.7141, longitude: -9.1334, thefork_review_count: 60 };

  it("reports distance and name similarity, and auto-accepts the one near-identical name within 100 m", () => {
    const [listing] = proposeTheForkListings(restaurant, [nearby]);
    expect(listing).toMatchObject({
      source: "thefork", placeRef: "101", url: nearby.url, name: "Casa do Bacalhau",
      confidence: "confident", autoAccept: true, reviewCount: 60,
    });
    expect(listing!.evidence.phoneMatch).toBeNull();
    expect(listing!.evidence.nameSimilarity).toBe(1);
    expect(listing!.evidence.distanceMeters).toBeGreaterThan(15);
    expect(listing!.evidence.distanceMeters).toBeLessThan(30);
  });

  it("asks instead when the name is identical but the place is 100-300 m away", () => {
    const [listing] = proposeTheForkListings(restaurant, [{ ...nearby, latitude: 38.7159 }]);
    expect(listing!.evidence.distanceMeters).toBeGreaterThan(100);
    expect(listing).toMatchObject({ confidence: "uncertain", autoAccept: false });
  });

  it("asks instead when the name is only similar, even right next door", () => {
    const [listing] = proposeTheForkListings(restaurant, [{ ...nearby, name: "Casa Bacalhau Grill" }]);
    expect(listing).toMatchObject({ confidence: "uncertain", autoAccept: false });
  });

  it("asks instead when two near-identical neighbours qualify, and when the distance is unknown", () => {
    const twin = { ...nearby, id: 102, url: "https://www.thefork.com/restaurant/casa-do-bacalhau-r102", latitude: 38.7142 };
    expect(proposeTheForkListings(restaurant, [nearby, twin]).map((listing) => listing.autoAccept)).toEqual([false, false]);
    expect(proposeTheForkListings({ ...restaurant, lat: null, lng: null }, [nearby])[0]).toMatchObject({ autoAccept: false });
  });

  it("drops candidates that are far away or have an unrelated name, and ranks the rest by name", () => {
    const far = { ...nearby, id: 102, latitude: 38.75, longitude: -9.2 };
    const other = { ...nearby, id: 103, name: "Sushi Palace" };
    const looser = { ...nearby, id: 104, name: "Casa Bacalhau Grill", url: "https://www.thefork.com/restaurant/x-r104" };
    const listings = proposeTheForkListings(restaurant, [looser, far, other, nearby]);
    expect(listings.map((listing) => listing.placeRef)).toEqual(["101", "104"]);
  });

  it("keeps a plausible name when the restaurant has no coordinates, with distance unknown", () => {
    const [listing] = proposeTheForkListings({ ...restaurant, lat: null, lng: null }, [nearby]);
    expect(listing!.evidence.distanceMeters).toBeNull();
  });

  it("skips items without an id, name or URL and de-duplicates by id", () => {
    expect(proposeTheForkListings(restaurant, [{ ...nearby, url: null }, { ...nearby, id: null }, nearby, nearby])).toHaveLength(1);
  });
});
