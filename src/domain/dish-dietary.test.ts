import { describe, expect, it } from "vitest";
import { dietaryFits, standoutDishes, type DietaryReview, type StandoutDishReview } from "./dish-dietary";

describe("standout dishes", () => {
  it("shows a dish only after three independent Reviews name it", () => {
    const reviews: StandoutDishReview[] = [
      { reviewId: 1, dishes: ["Bacalhau à Brás"] },
      { reviewId: 2, dishes: ["Bacalhau à Brás"] },
    ];
    expect(standoutDishes(reviews)).toEqual([]);
    expect(standoutDishes([...reviews, { reviewId: 3, dishes: ["Bacalhau à Brás"] }])).toEqual([
      { name: "Bacalhau à Brás", count: 3 },
    ]);
  });

  it("normalises spelling before counting, counts each Review once, and shows at most three", () => {
    const reviews: StandoutDishReview[] = [
      { reviewId: 1, dishes: ["Bacalhau à Brás", "BACALHAU À BRÁS!"] },
      { reviewId: 2, dishes: ["bacalhau a bras"] },
      { reviewId: 3, dishes: ["Bacalhau-a-Brás"] },
      { reviewId: 4, dishes: ["Arroz de polvo", "Arroz de polvo", "Pastel de nata"] },
      { reviewId: 5, dishes: ["Arroz de polvo", "Pastel de nata"] },
      { reviewId: 6, dishes: ["Arroz de polvo", "Pastel de nata"] },
    ];
    const result = standoutDishes(reviews);
    expect(result).toHaveLength(3);
    expect(result.map((dish) => dish.count).sort()).toEqual([3, 3, 3]);
  });
});

describe("dietary fit", () => {
  it("accepts a matching Source category without review evidence", () => {
    expect(dietaryFits([], ["Vegan restaurant"])).toEqual(["vegetarian", "vegan"]);
    expect(dietaryFits([], ["Gluten-free restaurant"])).toEqual(["gluten_free"]);
  });

  it("requires three praising Reviews and more praise than complaints", () => {
    const reviews: DietaryReview[] = [
      { reviewId: 1, praise: ["vegan"], complaints: ["vegan"] },
      { reviewId: 2, praise: ["vegan"], complaints: ["vegan"] },
      { reviewId: 3, praise: ["vegan"], complaints: ["vegan"] },
    ];
    expect(dietaryFits(reviews)).not.toContain("vegan");
    expect(dietaryFits([...reviews, { reviewId: 4, praise: ["vegan"], complaints: [] }])).toContain("vegan");
  });

  it("shows nothing for thin evidence or where complaints outweigh praise", () => {
    const reviews: DietaryReview[] = [
      { reviewId: 1, praise: ["vegetarian"], complaints: [] },
      { reviewId: 2, praise: ["vegetarian"], complaints: [] },
      { reviewId: 3, praise: ["gluten_free"], complaints: ["gluten_free"] },
      { reviewId: 4, praise: ["gluten_free"], complaints: [] },
      { reviewId: 5, praise: ["gluten_free"], complaints: ["gluten_free"] },
      { reviewId: 6, praise: ["gluten_free"], complaints: ["gluten_free"] },
      { reviewId: 7, praise: [], complaints: ["gluten_free"] },
    ];
    expect(dietaryFits(reviews)).toEqual([]);
  });
});
