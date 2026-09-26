import { describe, expect, it } from "vitest";
import { proposeChangePoint, type ChangeReview } from "./change-point-proposal";

const review = (day: string, change: ChangeReview["change"] = "none"): ChangeReview => ({ publishedAt: new Date(`${day}T12:00:00Z`), change });

describe("Change point signals", () => {
  it("proposes a reopening after an eight-week gap that dwarfs normal Review spacing", () => {
    const reviews = [review("2025-01-01"), review("2025-01-08"), review("2025-01-15"),
      review("2025-04-01"), review("2025-04-08"), review("2025-04-15")];
    expect(proposeChangePoint(reviews)).toMatchObject({ reason: "gap", kind: "reopened", date: "2025-04-01" });
  });

  it("proposes the earliest mention month and renovation kind for three mentions in six months", () => {
    const reviews = [review("2025-05-13", "renovated"), review("2025-06-01", "renovated"),
      review("2025-07-01", "renovated"), review("2025-09-12", "new_owner")];
    expect(proposeChangePoint(reviews)).toEqual({ reason: "mentions", kind: "renovated", date: "2025-05-01", mentionCount: 4 });
  });

  it("ignores a stars-only shift while allowing an old qualifying gap", () => {
    const reviews = [review("2013-01-01")];
    for (let time = Date.parse("2013-04-01"); time <= Date.parse("2025-05-15"); time += 7 * 86_400_000) {
      reviews.push({ publishedAt: new Date(time), change: "none" });
    }
    expect(proposeChangePoint(reviews.slice(-8))).toBeNull();
    expect(proposeChangePoint(reviews)).toMatchObject({ reason: "gap", date: "2013-04-01" });
  });
});
