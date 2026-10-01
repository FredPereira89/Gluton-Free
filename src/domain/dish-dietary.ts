export const DIETS = ["vegetarian", "vegan", "gluten_free"] as const;
export type Diet = typeof DIETS[number];

export type StandoutDishReview = { reviewId: number; dishes: readonly string[] };
export type DietaryReview = { reviewId: number; praise: readonly Diet[]; complaints: readonly Diet[] };
export type StandoutDish = { name: string; count: number };

const MIN_STANDOUT_REVIEWS = 3;
const MIN_DIETARY_PRAISE_REVIEWS = 3;
const MAX_STANDOUT_DISHES = 3;

function normaliseLabel(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Counts distinct Review IDs after accent, case and punctuation normalisation. */
export function standoutDishes(reviews: readonly StandoutDishReview[]): StandoutDish[] {
  const groups = new Map<string, { reviewIds: Set<number>; variants: Map<string, Set<number>> }>();

  for (const review of reviews) {
    const seen = new Set<string>();
    for (const rawName of review.dishes) {
      const name = rawName.trim();
      const key = normaliseLabel(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const group = groups.get(key) ?? { reviewIds: new Set<number>(), variants: new Map<string, Set<number>>() };
      group.reviewIds.add(review.reviewId);
      const variantIds = group.variants.get(name) ?? new Set<number>();
      variantIds.add(review.reviewId);
      group.variants.set(name, variantIds);
      groups.set(key, group);
    }
  }

  return [...groups.values()]
    .filter((group) => group.reviewIds.size >= MIN_STANDOUT_REVIEWS)
    .map((group) => {
      const name = [...group.variants.entries()].sort((a, b) =>
        b[1].size - a[1].size || a[0].localeCompare(b[0], "pt", { sensitivity: "base" }) || a[0].localeCompare(b[0]),
      )[0]![0];
      return { name, count: group.reviewIds.size };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt", { sensitivity: "base" }) || a.name.localeCompare(b.name))
    .slice(0, MAX_STANDOUT_DISHES);
}

function categoryDiets(categories: readonly string[]): Set<Diet> {
  const proved = new Set<Diet>();
  for (const category of categories) {
    const value = normaliseLabel(category);
    if (/\bvegan\b/.test(value)) {
      proved.add("vegan");
      proved.add("vegetarian");
    } else if (/\bvegetarian\b/.test(value)) {
      proved.add("vegetarian");
    }
    if (/\bgluten\s*free\b/.test(value)) proved.add("gluten_free");
  }
  return proved;
}

/** A Source category is direct proof; otherwise three distinct praising Reviews must outnumber complaints. */
export function dietaryFits(reviews: readonly DietaryReview[], categories: readonly string[] = []): Diet[] {
  const proved = categoryDiets(categories);
  return DIETS.filter((diet) => {
    if (proved.has(diet)) return true;
    const praisedBy = new Set(reviews.filter((review) => review.praise.includes(diet)).map((review) => review.reviewId));
    const criticisedBy = new Set(reviews.filter((review) => review.complaints.includes(diet)).map((review) => review.reviewId));
    return praisedBy.size >= MIN_DIETARY_PRAISE_REVIEWS && praisedBy.size > criticisedBy.size;
  });
}
