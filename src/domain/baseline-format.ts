import { FORMATS, type PriceTier } from "./restaurant-facts";

export type BaselineFormat = (typeof FORMATS)[number];

const standaloneFoodCategories = new Set([
  "animal_cafe", "art_cafe", "bagel_shop", "bakery", "bar_and_grill", "barbecue", "barbecue_spots", "bistro", "brewpub",
  "brazilian_pastelaria", "bubble_tea_shop", "bubble_tea_store", "cafe", "cafeteria", "cake_shop", "chinese_food",
  "chinese_pastry", "chinese_tea_house", "chocolate_cafe", "chocolate_shop", "coffee_shop", "coffee_stand",
  "cat_cafe", "childrens_cafe", "comic_cafe", "confectionery", "cosplay_cafe", "creperie", "cupcake_shop", "deli", "dessert_buffet",
  "dessert_shop", "diner", "dog_cafe", "donut_shop", "doughnut_shop", "fast_food_container", "fast_food_pizza",
  "food_court", "food_stand", "frozen_yogurt_shop", "gastropub", "hong_kong_style_cafe",
  "ice_cream_and_drink_shop", "ice_cream_shop", "japanese_confectionery_shop", "japanese_delicatessen", "japanese_food", "japanese_steakhouse",
  "juice_shop", "marisqueira", "mordern_izakaya_restaurants", "noodle_shop", "oyster_bar",
  "mung_bean_pancake", "pancake_house", "pastelaria", "pastry_shop", "patisserie", "pizzeria", "pizzas", "restaurant_brasserie",
  "restaurant_or_cafe", "rice_cake_shop", "sandwich_shop", "snack_bar", "soba_noodle_shop", "steak_house", "steakhouse",
  "steamed_bun_shop", "tapas_bar", "tapas_restaurant", "tasca", "tea_house", "tea_room", "tempura_bowl_restaurants", "traditional_teahouse",
  "seafood", "seafood_donburi", "udon_noodle_shop", "vegetarian_cafe_and_deli", "western_confectionery_shops", "western_food", "indian_food", "pizzatakeaway",
]);

export function normalizeBaselineLabel(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** The DataForSEO registry has no food flag: accept restaurant families plus known standalone food-service categories. */
export function isFoodCategoryId(value: string): boolean {
  const id = normalizeBaselineLabel(value);
  if (/(^|_)(delivery|deliveries|cloud_kitchen|virtual_kitchen)(_|$)/.test(id) || id === "meal_delivery") return false;
  return id === "restaurant" || id.endsWith("_restaurant") || standaloneFoodCategories.has(id);
}

function includesCategory(categories: string[], pattern: RegExp): boolean {
  return categories.some((category) => pattern.test(normalizeBaselineLabel(category)));
}

/** Deterministic seed Format for the Lisbon baseline; owner corrections can replace it later. */
export function baselineFormat(categories: string[], priceTier: PriceTier | null): BaselineFormat {
  if (includesCategory(categories, /(^|_)(fado|fado_house)(_|$)/)) return "casa_de_fado";
  if (includesCategory(categories, /(seafood|marisqueira|oyster_bar|shellfish)/)) return "marisqueira_cervejaria";
  if (includesCategory(categories, /(churrasqueira|churrascaria|barbecue|barbeque|bar_and_grill|grill|steak_house|steakhouse)/)) return "churrasqueira";

  const portuguese = includesCategory(categories, /(^|_)(portuguese|regional)_restaurant$|(^|_)(tasca|tapas_bar|tapas_restaurant)(_|$)/);
  if (portuguese) return priceTier === "€" || priceTier === "€€" ? "tasca" : "restaurante_tradicional";

  if (includesCategory(categories, /(fine_dining|haute_cuisine)/)
    || (priceTier === "€€€€" && includesCategory(categories, /restaurant$/))) return "fine_dining";
  if (includesCategory(categories, /(brunch|breakfast_restaurant|pancake)/)) return "brunch_all_day_cafe";
  if (includesCategory(categories, /(cafe|cafeteria|coffee_shop|coffee_stand|bakery|bagel_shop|bubble_tea|chocolate|confectionery|creperie|cupcake_shop|dessert|donut_shop|doughnut_shop|frozen_yogurt_shop|ice_cream|juice_shop|pastelaria|pastry|patisserie|tea_house|tea_room|teahouse)/)) return "cafe_pastelaria";
  if (includesCategory(categories, /(food_court|food_stand|snack_bar|fast_food|hamburger|burger|meal_takeaway|street_food|noodle_shop|steamed_bun_shop|pizzas?|pizzatakeaway)/)) return "snack_street";
  if (includesCategory(categories, /^(chinese_food|indian_food|western_food)$/)) return "international_casual";
  if (includesCategory(categories, /.+_restaurants?$|^pizzeria$/)) return "international_casual";
  return "casual_contemporary";
}

export { FORMATS };
