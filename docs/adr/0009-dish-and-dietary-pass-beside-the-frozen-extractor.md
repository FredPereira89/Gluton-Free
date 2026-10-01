---
status: accepted
---

# Standout dishes and Dietary fit come from a second pass, not the frozen extractor

The Review extractor was frozen after the Owner signed it off (#30). It flags `food_standout_dish` but does not name the dish, and it has only a negative dietary Theme ("few options for dietary needs"). For the beta we need dish names (Standout dish) and positive praise for vegetarian, vegan and gluten-free options (Dietary fit). We add **one separate LLM pass** over the Reviews that are already analysed, rather than changing and re-freezing the extractor. That would mean a new gold-set comparison, a new sign-off, and re-extracting every Review for fields unrelated to the Tier.

The pass never feeds the Tier: Standout dishes and Dietary fit are display and filter facts only. It runs in the pipeline (Lookups and the monthly refresh) as well as once over the existing Reviews, so new Reviews are covered from then on. It has its own version marker, so it can be re-run without touching extractor output.

## Considered Options

- **Extend the extractor:** a single pass per Review, but it reopens the sign-off and changes `extractor_version` for every stored analysis.
- **Google categories only:** free, but only about 15 Restaurants carry a vegan, vegetarian or gluten-free category, and it gives no dishes at all.
