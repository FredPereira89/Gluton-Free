# Lisbon baseline candidate sweep

Run the Lisbon baseline build on Trigger.dev without writing Restaurants, Listings, Reviews or analyses:

```powershell
npx tsx --env-file=.env.local scripts/baseline-lisbon.ts --dry-run
```

The default `--dry-run` creates a pollable baseline Job and writes no Restaurant data. It still makes billable DataForSEO and Anthropic calls. Trigger.dev runs and checkpoints the long job; the command polls it and prints the final report. Add `--persist` to store the confirmed sample, its fetched Review windows and their analyses. Existing Google place IDs are reused; auto-assigned Formats are updated when Reviews correct a misfile.

The job refuses to start paid work unless `EXTRACTOR_VERSION` matches the owner-approved version in `docs/extractor-freeze-2026-09-30.md`: `claude-haiku-4-5|extract-v4|themes-v1`.

## Sampling and extraction

- Randomly sample within each auto-assigned Format: 33 candidates for each 25-Restaurant target and 20 for each 15-Restaurant target (halved on 2026-09-30 for the concept test). The most-reviewed candidate in each regular Format is excluded. Every eligible casa de fado is included.
- Fetch sampled Google Reviews newest first on normal priority, in batches of at most 100 Restaurants per POST. Expand depth only when rating-only rows leave fewer than 100 text Reviews in the active 24-month window; stop when the window is full or the source is exhausted. Keep every rating-only Review inside that window. DataForSEO caps depth at 4,490; `incompleteReviewWindowPlaceIds` flags windows still short at that limit.
- Extract selected Review text with Anthropic's Batch API. The frozen extractor reads the entire selected Review window. A second Batch API request confirms each sampled Restaurant's Format using its newest 20 Review texts.
- Move misfiled Restaurants into the confirmed Format. Randomly top up short Formats from the remaining candidates until the target is reached or that candidate pool is exhausted.
- Search Tripadvisor for **only** the sampled Restaurants that survived Google Review extraction. Probe plausible pages on the standard Reviews queue for their address. Automatically attach a unique match when the phone agrees, or a near-identical name agrees with a location within 100 m or the same numbered street address. Fetch its newest 100 text Reviews within 24 months, keeping rating-only rows in that window, then run the frozen Batch extractor. No owner answer is needed. Shared or uncertain pages are skipped and recorded with their evidence in the Job report.
- The build reserves cost before each paid request and stops at $25 DataForSEO or $15 Anthropic spend. Business Listings reservations include the July 2026 20% rate increase.

DataForSEO's [Tripadvisor Search result](https://docs.dataforseo.com/v3/business_data-tripadvisor-search-task_get/) currently provides neither phone nor coordinates. Its [Reviews result](https://docs.dataforseo.com/v3/business_data-tripadvisor-reviews-task_get/) provides the street address. Thus the live baseline can confirm a match from a unique, numbered street-address agreement plus a near-identical name; otherwise it records and skips it. If the search adapter later supplies phone or coordinates, the same matcher uses those signals too.

## Candidate rules

- Search DataForSEO's restaurant category families and standalone food-service categories in a 15 km circle around Lisbon, excluding generic bars and explicitly delivery-only categories. Requests use batches of at most ten categories and pages of at most 1,000 Listings.
- Keep only Listings whose coordinates fall inside the checked-in Câmara Municipal de Lisboa municipality polygon, whose current Google status is `open`, and whose Google review count is at least 25.
- Fetch the ten newest Google Reviews and keep a Listing only when one has a timestamp in the last 12 calendar months.
- Assign one Format from Google categories and price tier with provenance `baseline_auto`. Google price tier is retained with Source provenance.

`countsByFormat` contains every confirmed Format, including zero counts. `shortByFormat` reports targets that could not be filled. `costsUsd` reports actual DataForSEO and Anthropic spend for the job.

## Format preassignment

The deterministic mapping follows the fixed Lisbon Format taxonomy in issue #6: fado, seafood, and grill categories map to their matching Format; Portuguese restaurants map to Tasca at € / €€ and Restaurante tradicional otherwise; fine-dining categories map to Fine dining, with `very_expensive` also used for generic restaurant listings; brunch, café / bakery, and quick-service categories map to their corresponding Quick & café Formats; other cuisine-specific restaurants map to International casual; remaining Restaurant categories map to Casual contemporary. Owner corrections remain available after the baseline.

## Data sources

- [DataForSEO Business Listings Search](https://docs.dataforseo.com/v3/business_data-business_listings-search-live/), [Google Reviews pricing](https://dataforseo.com/pricing/business-data/google-reviews-api), and [July 2026 pricing update](https://dataforseo.com/update/pricing-update-in-dataforseo-apis).
- [DataForSEO Business Listings category registry](https://docs.dataforseo.com/v3/business_data-business_listing-categories/) supplies the current category names; its response has no food/non-food flag.
- Lisboa municipality boundary: [Câmara Municipal de Lisboa ArcGIS layer](https://services.arcgis.com/1dSrzEWVQn5kHHyK/arcgis/rest/services/Limite_Cartografia/FeatureServer/1), returned as WGS84 GeoJSON. The open data portal identifies the council-boundary dataset as CC0.
