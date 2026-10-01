import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { listVerdictFeedbackInbox, saveVerdictFeedback } from "./verdict-feedback";

vi.mock("./db", () => ({ db: vi.fn() }));

const inviteeId = "33333333-3333-4333-8333-333333333333";
const input = { verdictId: 55, judgement: "too_high" as const, eatenHere: true, note: "Service felt rushed." };
const savedRow = {
  restaurant_id: "9",
  current_verdict_id: "55",
  feedback_id: "3",
  verdict_id: "55",
  judgement: "too_high" as const,
  eaten_here: true,
  note: "Service felt rushed.",
  submitted_at: new Date("2026-10-02T10:30:00.000Z"),
};

describe("saveVerdictFeedback", () => {
  const query = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue([savedRow]);
    vi.mocked(db).mockReturnValue(query as unknown as ReturnType<typeof db>);
  });

  it("records the latest feedback on the current Verdict without writing to Verdicts", async () => {
    const result = await saveVerdictFeedback(inviteeId, "o-velho-eurico", input);
    const sql = (query.mock.calls[0]![0] as TemplateStringsArray).join("?");

    expect(result).toEqual({
      found: true,
      currentVerdictId: 55,
      feedback: {
        verdictId: 55,
        judgement: "too_high",
        eatenHere: true,
        note: "Service felt rushed.",
        submittedAt: "2026-10-02T10:30:00.000Z",
      },
    });
    expect(sql).toContain("insert into verdict_feedback");
    expect(sql).toContain("from verdict");
    expect(sql).not.toMatch(/\b(?:insert into|update|delete from) verdict\b/i);
    expect(query.mock.calls[0]!.slice(1)).toContain(55);
  });

  it("refuses to save when the displayed Verdict is no longer current", async () => {
    query.mockResolvedValueOnce([{ ...savedRow, current_verdict_id: "56", feedback_id: null, verdict_id: null, judgement: null, submitted_at: null }]);
    const result = await saveVerdictFeedback(inviteeId, "o-velho-eurico", input);
    expect(result).toEqual({ found: true, currentVerdictId: 56, feedback: null });
  });

  it("groups the Owner inbox by Restaurant and Verdict Tier with judgement counts", async () => {
    query.mockResolvedValueOnce([
      { restaurant_name: "A Tasca", restaurant_slug: "a-tasca", tier: "good", judgement: "too_high", eaten_here: true, note: null, submitted_at: new Date("2026-10-02T10:00:00Z"), email: "one@example.test" },
      { restaurant_name: "A Tasca", restaurant_slug: "a-tasca", tier: "good", judgement: "too_high", eaten_here: null, note: "Felt overvalued", submitted_at: new Date("2026-10-02T09:00:00Z"), email: "two@example.test" },
      { restaurant_name: "A Tasca", restaurant_slug: "a-tasca", tier: "good", judgement: "about_right", eaten_here: null, note: null, submitted_at: new Date("2026-10-02T08:00:00Z"), email: "three@example.test" },
      { restaurant_name: "Bistro", restaurant_slug: "bistro", tier: "good", judgement: "too_low", eaten_here: null, note: null, submitted_at: new Date("2026-10-02T07:00:00Z"), email: "four@example.test" },
    ]);
    const groups = await listVerdictFeedbackInbox();

    expect(groups.map(({ restaurantSlug, tier, total, counts }) => ({ restaurantSlug, tier, total, counts }))).toEqual([
      { restaurantSlug: "a-tasca", tier: "good", total: 3, counts: { too_high: 2, about_right: 1, too_low: 0 } },
      { restaurantSlug: "bistro", tier: "good", total: 1, counts: { too_high: 0, about_right: 0, too_low: 1 } },
    ]);
    expect(groups[0]?.entries[0]?.email).toBe("one@example.test");
  });
});
