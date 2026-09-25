import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { routes } from "@/lib/api-contract";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({ db: vi.fn() }));

const query = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db).mockReturnValue(query as unknown as ReturnType<typeof db>);
});

function get() {
  return GET(new Request("http://localhost/api/v1/activity"));
}

describe("GET /api/v1/activity", () => {
  it("groups a running job, an unseen Verdict and an open Owner question", async () => {
    query
      .mockResolvedValueOnce([{ slug: "running-one", name: "Running One", kind: "lookup", status: "running", step: "Fetching Reviews" }])
      .mockResolvedValueOnce([{ slug: "ready-one", name: "Ready One", verdict_id: "7", tier: "good", provisional: false }])
      .mockResolvedValueOnce([{ slug: "asking-one", name: "Asking One", count: 2 }]);

    const response = await get();
    expect(response.status).toBe(200);
    expect(routes.activity.responses[200].parse(await response.json())).toEqual({
      running: [{ slug: "running-one", name: "Running One", jobKind: "lookup", status: "running", step: "Fetching Reviews" }],
      ready: [{ slug: "ready-one", name: "Ready One", verdictId: 7, tier: "good", provisional: false }],
      questions: [{ slug: "asking-one", name: "Asking One", count: 2 }],
    });
  });

  it("keeps the ready query keyed on the Restaurant's seen_verdict_id, not the job table", async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await get();
    const [readyTemplate] = query.mock.calls[1] as unknown as [TemplateStringsArray];
    expect(readyTemplate.join(" ")).toMatch(/v\.id is distinct from r\.seen_verdict_id/);
  });

  it("hides Owner questions still gated behind the initial lookup, mirroring the Restaurant page", async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await get();
    const [questionsTemplate] = query.mock.calls[2] as unknown as [TemplateStringsArray];
    expect(questionsTemplate.join(" ")).toMatch(/j\.kind = 'lookup'/);
  });

  it("returns empty groups when nothing is running, ready or asked", async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const response = await get();
    expect(routes.activity.responses[200].parse(await response.json())).toEqual({ running: [], ready: [], questions: [] });
  });
});
