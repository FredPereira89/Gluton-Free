import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BaselineCandidate } from "./baseline";

const dataforseo = vi.hoisted(() => ({ postGoogleReviewTasks: vi.fn(), getReviewTask: vi.fn() }));
vi.mock("@/ingest/dataforseo", () => dataforseo);

import { fetchBaselineGoogleReviewWindows } from "./baseline";

function candidate(placeId: string): BaselineCandidate {
  return {
    placeId,
    name: `Fictional ${placeId}`,
    url: `https://example.invalid/${placeId}`,
    address: null,
    area: null,
    latitude: 38.72,
    longitude: -9.14,
    rating: 4.5,
    reviewCount: 100,
    categories: [],
    priceLevel: null,
    priceTier: null,
    format: "tasca",
    formatProvenance: "baseline_auto",
    newestReviewAt: new Date("2026-09-20T09:00:00.000Z"),
  };
}

describe("baseline Review vendor requests", () => {
  beforeEach(() => {
    dataforseo.postGoogleReviewTasks.mockReset();
    dataforseo.getReviewTask.mockReset();
  });

  it("posts newest-first depths together on DataForSEO's normal queue and collects every result", async () => {
    dataforseo.postGoogleReviewTasks.mockResolvedValue({
      posted: [
        { placeId: "place-a", taskId: "task-a", cost: 0.001 },
        { placeId: "place-b", taskId: "task-b", cost: 0.001 },
      ],
      failed: [],
    });
    dataforseo.getReviewTask.mockImplementation(async (_source: string, taskId: string) => ({
      result: {
        title: "Fictional Restaurant",
        place_id: taskId === "task-a" ? "place-a" : "place-b",
        reviews_count: 400,
        items: [{
          review_id: `review-${taskId}`,
          timestamp: "2026-09-20 09:00:00 +00:00",
          rating: { value: 5 },
          original_review_text: "Fictional fresh Review text",
        }],
      },
      cost: 0,
    }));

    const requests = [
      { candidate: candidate("place-a"), depth: 100 },
      { candidate: candidate("place-b"), depth: 90 },
    ];
    const result = await fetchBaselineGoogleReviewWindows(requests, async () => {});

    expect(dataforseo.postGoogleReviewTasks).toHaveBeenCalledWith([
      { placeId: "place-a", depth: 100 },
      { placeId: "place-b", depth: 90 },
    ], 1);
    expect(dataforseo.getReviewTask).toHaveBeenCalledTimes(2);
    expect(result.get("place-a")?.reviews).toMatchObject([{ sourceReviewId: "review-task-a", text: "Fictional fresh Review text", stars: 5 }]);
    expect(result.get("place-b")?.costUsd).toBe(0.001);
  });

  it("splits larger sample waves into 100-task POSTs before polling", async () => {
    dataforseo.postGoogleReviewTasks.mockImplementation(async (items: { placeId: string; depth: number }[]) => ({
      posted: items.map(({ placeId }) => ({ placeId, taskId: placeId, cost: 0.001 })),
      failed: [],
    }));
    dataforseo.getReviewTask.mockImplementation(async (_source: string, taskId: string) => ({
      result: {
        title: "Fictional Restaurant",
        place_id: taskId,
        reviews_count: 400,
        items: [{
          review_id: `${taskId}-review`,
          timestamp: "2026-09-20 09:00:00 +00:00",
          rating: { value: 5 },
          original_review_text: "Fictional fresh Review text",
        }],
      },
      cost: 0,
    }));
    const requests = Array.from({ length: 101 }, (_, index) => ({ candidate: candidate(`place-${index}`), depth: 10 }));

    const result = await fetchBaselineGoogleReviewWindows(requests, async () => {});

    expect(dataforseo.postGoogleReviewTasks).toHaveBeenCalledTimes(2);
    expect(dataforseo.postGoogleReviewTasks.mock.calls[0]![0]).toHaveLength(100);
    expect(dataforseo.postGoogleReviewTasks.mock.calls[1]![0]).toHaveLength(1);
    expect(dataforseo.postGoogleReviewTasks).toHaveBeenNthCalledWith(1, expect.any(Array), 1);
    expect(result.size).toBe(101);
  });
});
