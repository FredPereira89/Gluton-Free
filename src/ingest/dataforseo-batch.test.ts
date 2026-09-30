import { afterEach, describe, expect, it, vi } from "vitest";
import { postGoogleReviewTasks } from "./dataforseo";

describe("DataForSEO Google Reviews task batches", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("posts newest-first requests with their normal priority and maps task IDs by place ID", async () => {
    vi.stubEnv("DATAFORSEO_LOGIN", "test-login");
    vi.stubEnv("DATAFORSEO_PASSWORD", "test-password");
    const requestBodies: string[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBodies.push(String(init?.body));
      return new Response(JSON.stringify({
        status_code: 20000,
        status_message: "Ok.",
        cost: 0,
        tasks: [
          { id: "task-b", status_code: 20100, status_message: "Task Created.", cost: 0.001, data: { place_id: "place-b" }, result: null },
          { id: "task-a", status_code: 20100, status_message: "Task Created.", cost: 0.001, data: { place_id: "place-a" }, result: null },
        ],
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postGoogleReviewTasks([
      { placeId: "place-a", depth: 100 },
      { placeId: "place-b", depth: 90 },
    ], 1);

    expect(JSON.parse(requestBodies[0]!)).toMatchObject([
      { place_id: "place-a", depth: 100, sort_by: "newest", priority: 1 },
      { place_id: "place-b", depth: 90, sort_by: "newest", priority: 1 },
    ]);
    expect(result).toEqual({
      posted: [
        { placeId: "place-a", taskId: "task-a", cost: 0.001 },
        { placeId: "place-b", taskId: "task-b", cost: 0.001 },
      ],
      failed: [],
    });
  });

  it("rejects more than 100 tasks without calling the vendor", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(postGoogleReviewTasks(
      Array.from({ length: 101 }, (_, index) => ({ placeId: `place-${index}`, depth: 10 })),
      1,
    )).rejects.toThrow("at most 100");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
