import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { routes } from "@/lib/api-contract";
import { AuthError, requireOwner } from "@/lib/auth";
import { recordSearchCost, spendCapStatus } from "@/lib/spend-cap";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireOwner: vi.fn() };
});
vi.mock("@/lib/spend-cap", () => ({ spendCapStatus: vi.fn(), recordSearchCost: vi.fn() }));

function businessInfo(placeId: string, title: string, votesCount: number | null, category = "Restaurant") {
  return { type: "google_business_info", place_id: placeId, title, category, rating: { value: 4.3, votes_count: votesCount } };
}

function mockVendor(google: unknown | null, tripadvisorItems: unknown[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input.toString();
    if (url.includes("/business_data/google/my_business_info/live")) {
      return Response.json({ status_code: 20000, status_message: "Ok", tasks: [{ id: "t-google", status_code: 20000, status_message: "Ok", cost: 0.003, result: [{ items: google ? [google] : [] }] }] });
    }
    if (url.includes("/business_data/tripadvisor/search/task_post")) {
      return Response.json({ status_code: 20000, status_message: "Ok", tasks: [{ id: "t-tripadvisor", status_code: 20100, status_message: "Task Created", cost: 0.02, result: null }] });
    }
    if (url.includes("/business_data/tripadvisor/search/task_get/")) {
      return Response.json({ status_code: 20000, status_message: "Ok", tasks: [{ id: "t-tripadvisor", status_code: 20000, status_message: "Ok", cost: 0, result: [{ items: tripadvisorItems }] }] });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
}

function request(body: unknown) {
  return new Request("http://localhost/api/v1/lookups/preview", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(requireOwner).mockResolvedValue("owner-1");
  vi.mocked(spendCapStatus).mockResolvedValue({ atCap: false, resetAt: "2026-09-26T00:00:00.000Z" });
  vi.mocked(recordSearchCost).mockResolvedValue(undefined);
  process.env.DATAFORSEO_LOGIN = "test";
  process.env.DATAFORSEO_PASSWORD = "test";
});

describe("POST /api/v1/lookups/preview", () => {
  it("rejects a request that fails owner auth", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new AuthError(401, "unauthenticated", "No session"));
    const response = await POST(request({ googlePlaceId: "ChIJabc" }));
    expect(response.status).toBe(401);
  });

  it("respects the spend cap before calling any vendor", async () => {
    vi.mocked(spendCapStatus).mockResolvedValue({ atCap: true, resetAt: "2026-09-26T00:00:00.000Z" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await POST(request({ googlePlaceId: "ChIJabc" }));
    expect(response.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a body with neither or both of googlePlaceId and sourceUrl", async () => {
    expect((await POST(request({}))).status).toBe(400);
    expect((await POST(request({ googlePlaceId: "ChIJabc", sourceUrl: "https://maps.google.com/?q=place_id:ChIJabc" }))).status).toBe(400);
  });

  it("404s when the Google place ID resolves to nothing", async () => {
    mockVendor(null, []);
    const response = await POST(request({ googlePlaceId: "ChIJmissing" }));
    expect(response.status).toBe(404);
  });

  it("keeps a Tripadvisor match uncertain without distance or phone evidence, and predicts enough evidence", async () => {
    mockVendor(businessInfo("ChIJabc", "Casa do Bacalhau", 200), [
      { title: "Casa do Bacalhau", url_path: "/Restaurant_Review-g1-d1-Reviews-Casa_do_Bacalhau.html", reviews_count: 90 },
    ]);
    const response = await POST(request({ googlePlaceId: "ChIJabc" }));
    expect(response.status).toBe(200);
    const body = routes.lookupPreview.responses[200].parse(await response.json());
    expect(body.restaurantName).toBe("Casa do Bacalhau");
    expect(body.listings).toHaveLength(2);
    const google = body.listings.find((l) => l.source === "google")!;
    const tripadvisor = body.listings.find((l) => l.source === "tripadvisor")!;
    expect(google.confidence).toBe("confident");
    expect(google.autoAccept).toBe(true);
    expect(tripadvisor.confidence).toBe("uncertain");
    expect(tripadvisor.autoAccept).toBe(false);
    expect(body.notEnoughEvidenceWarning).toBe(false);
    expect(body.categoryGuess).toBe("Restaurant");
    expect(recordSearchCost).toHaveBeenCalledWith(0.003);
    expect(recordSearchCost).toHaveBeenCalledWith(0.02);
  });

  it("proposes an uncertain, non-auto-accept Tripadvisor match for a loosely similar name", async () => {
    mockVendor(businessInfo("ChIJabc", "Casa do Bacalhau", 200), [
      { title: "Casa Bacalhau Grill", url_path: "/Restaurant_Review-g1-d2-Reviews.html", reviews_count: 20 },
    ]);
    const response = await POST(request({ googlePlaceId: "ChIJabc" }));
    const body = routes.lookupPreview.responses[200].parse(await response.json());
    const tripadvisor = body.listings.find((l) => l.source === "tripadvisor")!;
    expect(tripadvisor.confidence).toBe("uncertain");
    expect(tripadvisor.autoAccept).toBe(false);
    expect(tripadvisor.evidence.distanceMeters).toBeNull();
    expect(tripadvisor.evidence.phoneMatch).toBeNull();
  });

  it("returns only the Google Listing when no Tripadvisor candidate is plausible", async () => {
    mockVendor(businessInfo("ChIJabc", "Casa do Bacalhau", 200), [
      { title: "Pizzaria Roma", url_path: "/z.html", reviews_count: 5 },
    ]);
    const response = await POST(request({ googlePlaceId: "ChIJabc" }));
    const body = routes.lookupPreview.responses[200].parse(await response.json());
    expect(body.listings).toHaveLength(1);
    expect(body.listings[0]!.source).toBe("google");
  });

  it("predicts Not enough evidence from Google's own low review count", async () => {
    mockVendor(businessInfo("ChIJabc", "Casa do Bacalhau", 5), []);
    const response = await POST(request({ googlePlaceId: "ChIJabc" }));
    const body = routes.lookupPreview.responses[200].parse(await response.json());
    expect(body.notEnoughEvidenceWarning).toBe(true);
    expect(body.estimate.textReviews).toBeGreaterThanOrEqual(0);
    expect(body.estimate.costUsd).toBeGreaterThanOrEqual(0);
  });

  it("resolves a place ID pasted as a Google Maps sourceUrl", async () => {
    mockVendor(businessInfo("ChIJabc", "Casa do Bacalhau", 50), []);
    const response = await POST(request({ sourceUrl: "https://www.google.com/maps?q=place_id:ChIJabc" }));
    expect(response.status).toBe(200);
  });

  it("rejects a sourceUrl that only resolves to a name, not a specific place", async () => {
    const response = await POST(request({ sourceUrl: "https://www.thefork.pt/restaurante/casa-do-bacalhau" }));
    expect(response.status).toBe(400);
  });
});
