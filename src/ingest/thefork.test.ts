import { describe, expect, it } from "vitest";
import { normaliseTheFork } from "./normalise";

const item = {
  id: "invented-thefork-1",
  name: "Fictional Tasca",
  street: "1 Imaginary Lane",
  locality: "Lisbon",
  thefork_rating: 9.2,
  thefork_review_count: 3,
  avg_price: 32,
  reviews: [
    { id: "r1", rating_value: 10, meal_date: "2026-08-01T17:00:00.000Z", review_body: "Superb grilled fish.", reviewer_name: "Invented Reviewer Name", likes: 2 },
    { id: "r2", rating_value: 7, meal_date: "2026-07-01T17:00:00.000Z", review_body: "Fine, slow service.", reviewer_name: "Another Invented Name", likes: 0 },
    { id: "r3", rating_value: 1, meal_date: "2026-06-01T17:00:00.000Z", review_body: null, likes: 0 },
    { id: "r4", rating_value: 8, meal_date: "not a date", review_body: "Undated.", likes: 0 },
  ],
};

describe("normaliseTheFork", () => {
  it("maps TheFork's 0-10 review ratings onto the 1-5 scale", () => {
    const { reviews } = normaliseTheFork(item);
    expect(reviews.map((review) => [review.sourceReviewId, review.stars])).toEqual([["r1", 5], ["r2", 4], ["r3", 1]]);
  });

  it("normalises the Listing rating to 1-5 and turns the average price into the price level", () => {
    const { facts } = normaliseTheFork(item);
    expect(facts).toMatchObject({ title: "Fictional Tasca", placeRef: "invented-thefork-1", rating: 4.6, reviewCount: 3, priceLevel: "32" });
  });

  it("keeps a Review's text, meal date as visit and publish date, and never a reviewer identity", () => {
    const { reviews } = normaliseTheFork(item);
    expect(reviews[0]).toMatchObject({
      text: "Superb grilled fish.", visitedOn: "2026-08-01", ownerReplied: false,
      reviewerReviewCount: null, localGuide: null, reviewerContributions: null,
    });
    expect(reviews[0]!.publishedAt.toISOString()).toBe("2026-08-01T17:00:00.000Z");
    expect(reviews[2]!.text).toBeNull();
    expect(JSON.stringify(normaliseTheFork(item))).not.toContain("Invented Reviewer Name");
    expect(JSON.stringify(normaliseTheFork(item))).not.toContain("Another Invented Name");
  });

  it("stores only the 100 newest Reviews even if the actor returns more", () => {
    const many = Array.from({ length: 130 }, (_, index) => ({
      id: `m${index}`, rating_value: 8, review_body: "ok",
      meal_date: new Date(Date.UTC(2026, 0, 1) + index * 86400_000).toISOString(),
    }));
    const { reviews } = normaliseTheFork({ id: "x", name: "Many", reviews: many });
    expect(reviews).toHaveLength(100);
    expect(reviews[0]!.sourceReviewId).toBe("m129");
    expect(reviews.at(-1)!.sourceReviewId).toBe("m30");
  });

  it("leaves the rating and price empty when TheFork gives none", () => {
    const { facts, reviews } = normaliseTheFork({ id: "x", name: "Bare", reviews: [] });
    expect(facts).toMatchObject({ rating: null, reviewCount: null, priceLevel: null });
    expect(reviews).toEqual([]);
  });
});
