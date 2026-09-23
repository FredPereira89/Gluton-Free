import type { Aspect } from "./aspects";

// Controlled Theme vocabulary. Versioned with the extractor: a change here means re-extraction.
export const THEME_VOCAB_VERSION = "themes-v1";

type ThemeDef = { aspect: Aspect; polarity: 1 | -1; label: string; hint: string };

export const THEMES = {
  food_delicious: { aspect: "food", polarity: 1, label: "Delicious food", hint: "food praised as tasty, excellent, the best" },
  food_authentic: { aspect: "food", polarity: 1, label: "Authentic Portuguese cooking", hint: "traditional, home-style, like grandma's" },
  food_fresh: { aspect: "food", polarity: 1, label: "Fresh ingredients", hint: "fresh fish, seasonal produce" },
  food_generous_portions: { aspect: "food", polarity: 1, label: "Generous portions", hint: "large, filling portions" },
  food_standout_dish: { aspect: "food", polarity: 1, label: "A standout dish", hint: "one named dish singled out as memorable" },
  food_creative: { aspect: "food", polarity: 1, label: "Creative twists on tradition", hint: "modernised or inventive takes" },
  food_desserts: { aspect: "food", polarity: 1, label: "Great desserts", hint: "desserts praised" },
  food_drinks: { aspect: "food", polarity: 1, label: "Good wine and drinks", hint: "house wine, wine list, drinks praised" },
  food_bland: { aspect: "food", polarity: -1, label: "Bland or under-seasoned", hint: "tasteless, lacking salt or flavour" },
  food_poorly_cooked: { aspect: "food", polarity: -1, label: "Poorly cooked", hint: "overcooked, undercooked, dry, burnt, greasy" },
  food_small_portions: { aspect: "food", polarity: -1, label: "Small portions", hint: "portions too small for the price" },
  food_not_fresh: { aspect: "food", polarity: -1, label: "Not fresh or reheated", hint: "frozen, reheated, stale" },
  food_touristy: { aspect: "food", polarity: -1, label: "Tourist-grade food", hint: "food dumbed down for tourists" },
  food_few_options: { aspect: "food", polarity: -1, label: "Few options for dietary needs", hint: "little for vegetarians, allergies" },
  service_warm: { aspect: "service", polarity: 1, label: "Warm, friendly staff", hint: "welcoming, kind, charming" },
  service_attentive: { aspect: "service", polarity: 1, label: "Attentive service", hint: "attentive, efficient, professional" },
  service_recommendations: { aspect: "service", polarity: 1, label: "Good recommendations", hint: "staff explained dishes, suggested well" },
  service_slow: { aspect: "service", polarity: -1, label: "Slow service", hint: "long gaps between courses or for the bill" },
  service_rude: { aspect: "service", polarity: -1, label: "Rude or unwelcoming", hint: "rude, arrogant, dismissive" },
  service_rushed: { aspect: "service", polarity: -1, label: "Rushed", hint: "pushed to order or leave quickly" },
  service_inattentive: { aspect: "service", polarity: -1, label: "Inattentive", hint: "ignored, hard to get attention" },
  service_mistakes: { aspect: "service", polarity: -1, label: "Order or bill mistakes", hint: "wrong dishes, wrong bill" },
  ambience_cosy: { aspect: "ambience", polarity: 1, label: "Cosy, homely room", hint: "cosy, intimate, charming room" },
  ambience_lively: { aspect: "ambience", polarity: 1, label: "Lively atmosphere", hint: "buzzing, fun, great vibe" },
  ambience_setting: { aspect: "ambience", polarity: 1, label: "Charming setting", hint: "lovely street, terrace, view, decor" },
  ambience_noisy: { aspect: "ambience", polarity: -1, label: "Noisy", hint: "too loud to talk" },
  ambience_cramped: { aspect: "ambience", polarity: -1, label: "Cramped", hint: "tight tables, little space" },
  ambience_touristy: { aspect: "ambience", polarity: -1, label: "Full of tourists", hint: "only tourists, no locals" },
  ambience_uncomfortable: { aspect: "ambience", polarity: -1, label: "Uncomfortable", hint: "hot, cold, uncomfortable seats" },
  value_good: { aspect: "value", polarity: 1, label: "Good value for money", hint: "fair or cheap for the quality" },
  value_overpriced: { aspect: "value", polarity: -1, label: "Overpriced", hint: "too expensive for what it is" },
  value_unordered_couvert: { aspect: "value", polarity: -1, label: "Unordered couvert charged", hint: "bread, olives, starters charged without being ordered" },
  value_bill_surprise: { aspect: "value", polarity: -1, label: "Unexpected charges", hint: "surprise items or prices on the bill" },
  wait_quick: { aspect: "wait", polarity: 1, label: "Seated or served quickly", hint: "no wait, quick food" },
  wait_booking_essential: { aspect: "wait", polarity: -1, label: "Hard to get a table", hint: "must book far ahead, turned away" },
  wait_long_queue: { aspect: "wait", polarity: -1, label: "Long wait for a table", hint: "queue or long wait without a booking" },
  wait_slow_kitchen: { aspect: "wait", polarity: -1, label: "Long wait for food", hint: "food took very long to arrive" },
  consistency_reliable: { aspect: "consistency", polarity: 1, label: "Reliably good on repeat visits", hint: "always good, came back several times" },
  consistency_declined: { aspect: "consistency", polarity: -1, label: "Not what it used to be", hint: "worse than before, went downhill" },
  consistency_uneven: { aspect: "consistency", polarity: -1, label: "Uneven", hint: "some dishes or visits great, others poor" },
} as const satisfies Record<string, ThemeDef>;

export type ThemeCode = keyof typeof THEMES;
export const THEME_CODES = Object.keys(THEMES) as [ThemeCode, ...ThemeCode[]];
