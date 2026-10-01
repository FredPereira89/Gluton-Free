import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "@/app/api/v1/restaurants/[slug]/verdict-feedback/route";
import { requireCallerApi } from "@/lib/problem";
import { getVerdictFeedback, saveVerdictFeedback } from "@/lib/verdict-feedback";

vi.mock("@/lib/problem", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/problem")>(),
  requireCallerApi: vi.fn(),
}));
vi.mock("@/lib/verdict-feedback", () => ({ getVerdictFeedback: vi.fn(), saveVerdictFeedback: vi.fn() }));

const invitee = { userId: "33333333-3333-4333-8333-333333333333", role: "invitee" as const };
const owner = { userId: "11111111-1111-4111-8111-111111111111", role: "owner" as const };
const params = Promise.resolve({ slug: "o-velho-eurico" });
const feedback = {
  verdictId: 55,
  judgement: "too_high" as const,
  eatenHere: true,
  note: "Service felt rushed.",
  submittedAt: "2026-10-02T10:30:00.000Z",
};
const body = { verdictId: 55, judgement: "too_high", eatenHere: true, note: "Service felt rushed." };

function getRequest() {
  return new Request("https://app.example/api/v1/restaurants/o-velho-eurico/verdict-feedback");
}

function putRequest(payload: unknown = body) {
  return new Request("https://app.example/api/v1/restaurants/o-velho-eurico/verdict-feedback", {
    method: "PUT",
    headers: { origin: "https://app.example", "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

describe("restaurant verdict feedback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCallerApi).mockResolvedValue(invitee);
    vi.mocked(getVerdictFeedback).mockResolvedValue({ found: true, feedback });
    vi.mocked(saveVerdictFeedback).mockResolvedValue({ found: true, currentVerdictId: 55, feedback });
  });

  it("lets an Invitee read only their own feedback", async () => {
    const response = await GET(getRequest(), { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ feedback });
    expect(getVerdictFeedback).toHaveBeenCalledWith(invitee.userId, "o-velho-eurico");
  });

  it("lets an Invitee submit and replace one feedback record", async () => {
    const response = await PUT(putRequest(), { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ feedback });
    expect(saveVerdictFeedback).toHaveBeenCalledWith(invitee.userId, "o-velho-eurico", body);
  });

  it("does not accept Owner feedback submissions", async () => {
    vi.mocked(requireCallerApi).mockResolvedValueOnce(owner);
    const response = await PUT(putRequest(), { params });
    expect(response.status).toBe(403);
    expect(saveVerdictFeedback).not.toHaveBeenCalled();
  });

  it("rejects feedback for a Verdict that has since changed", async () => {
    vi.mocked(saveVerdictFeedback).mockResolvedValueOnce({ found: true, currentVerdictId: 56, feedback: null });
    const response = await PUT(putRequest(), { params });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "verdict_changed" });
  });
});
