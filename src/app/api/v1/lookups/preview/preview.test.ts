import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTripadvisorSearch } from "@/ingest/dataforseo";
import {
  estimateLookup, googleMapsUrl, pollTripadvisorSearch, predictNotEnoughEvidence, predictTextReviews,
  proposeGoogleListing, proposeTripadvisorListing, tripadvisorUrl,
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

describe("proposeTripadvisorListing", () => {
  it("keeps a near-identical name uncertain without distance or phone evidence", () => {
    const listing = proposeTripadvisorListing("Casa do Bacalhau", [
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
    const listing = proposeTripadvisorListing("Casa do Bacalhau", [
      { title: "Casa Bacalhau Grill", url_path: "/Restaurant_Review-g1-d2-Reviews.html", reviews_count: 10 },
    ]);
    expect(listing).not.toBeNull();
    expect(listing!.confidence).toBe("uncertain");
    expect(listing!.autoAccept).toBe(false);
  });

  it("picks the best of several candidates by name similarity", () => {
    const listing = proposeTripadvisorListing("Casa do Bacalhau", [
      { title: "O Bacalhau da Casa", url_path: "/a.html", reviews_count: 5 },
      { title: "Casa do Bacalhau", url_path: "/b.html", reviews_count: 80 },
    ]);
    expect(listing!.url).toBe(tripadvisorUrl("/b.html"));
  });

  it("returns null when nothing plausibly matches", () => {
    const listing = proposeTripadvisorListing("Casa do Bacalhau", [
      { title: "Pizzaria Roma", url_path: "/c.html", reviews_count: 5 },
    ]);
    expect(listing).toBeNull();
  });

  it("returns null with no candidates", () => {
    expect(proposeTripadvisorListing("Casa do Bacalhau", [])).toBeNull();
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
