# Lisbon baseline candidate sweep

Run a billable candidate sweep on Trigger.dev without writing candidate Restaurants:

```powershell
npx tsx --env-file=.env.local scripts/baseline-lisbon.ts --dry-run
```

The default `--dry-run` creates a pollable baseline Job, but writes no candidate Restaurants or Listings. DataForSEO still charges for Business Listings searches and Google Reviews freshness checks. Trigger.dev runs and checkpoints the long sweep; the command polls its Job and prints the report when it finishes. Add `--persist` to insert eligible Restaurants and Google Listings after the sweep. Existing Google place IDs are skipped. The sweep does not fetch or analyse the full Review history.

## Candidate rules

- Search DataForSEO's restaurant category families and standalone food-service categories in a 15 km circle around Lisbon, excluding generic bars and explicitly delivery-only categories. Requests use batches of at most ten categories and pages of at most 1,000 Listings.
- Keep only Listings whose coordinates fall inside the checked-in Câmara Municipal de Lisboa municipality polygon, whose current Google status is `open`, and whose Google review count is at least 25.
- Fetch the ten newest Google Reviews and keep a Listing only when one has a timestamp in the last 12 calendar months.
- Assign one Format from Google categories and price tier with provenance `baseline_auto`. Google price tier is retained with Source provenance.

`countsByFormat` contains every Format, including zero counts. `costsUsd` separates costs reported by the completed search and recency requests from the estimated cost of fetching the full Google Review set for kept candidates. The estimate follows the existing review-depth policy and excludes LLM costs.

## Format preassignment

The deterministic mapping follows the fixed Lisbon Format taxonomy in issue #6: fado, seafood, and grill categories map to their matching Format; Portuguese restaurants map to Tasca at € / €€ and Restaurante tradicional otherwise; fine-dining categories map to Fine dining, with `very_expensive` also used for generic restaurant listings; brunch, café / bakery, and quick-service categories map to their corresponding Quick & café Formats; other cuisine-specific restaurants map to International casual; remaining Restaurant categories map to Casual contemporary. Owner corrections remain available after the baseline.

## Data sources

- [DataForSEO Business Listings Search](https://docs.dataforseo.com/v3/business_data-business_listings-search-live/) and [Google Reviews pricing](https://dataforseo.com/pricing/business-data/google-reviews-api).
- [DataForSEO Business Listings category registry](https://docs.dataforseo.com/v3/business_data-business_listing-categories/) supplies the current category names; its response has no food/non-food flag.
- Lisboa municipality boundary: [Câmara Municipal de Lisboa ArcGIS layer](https://services.arcgis.com/1dSrzEWVQn5kHHyK/arcgis/rest/services/Limite_Cartografia/FeatureServer/1), returned as WGS84 GeoJSON. The open data portal identifies the council-boundary dataset as CC0.
