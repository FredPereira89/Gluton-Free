# Third-party review data vendors (ticket #3)

Research date: 2026-09-23. All prices are in USD as published by each vendor on that date. At the volumes here, USD and EUR are close enough to compare against the ~EUR 25/month budget. Nothing was signed up for or paid for; every figure comes from public pricing pages and docs.

Glossary terms follow CONTEXT.md: Restaurant, Source, Review, Verdict, Aspect, Format, Access tag, Evidence.

## TL;DR

- **Primary: DataForSEO Reviews API** for the Google and Tripadvisor Sources.
  - It costs 10-40x less than the alternatives: $0.075 per 1k Reviews on the standard queue and $0.15 per 1k on the priority queue.
  - It can sort by newest, goes up to 4,490 Reviews deep, and returns `original_language`.
  - Pingback/postback webhooks are supported.
  - The priority queue returns in up to about 1 minute, so on-demand use is viable.
  - Drawback: a **$50 minimum first payment**. The balance never expires, so at our volumes it lasts many months.
- **Fallback: Apify.**
  - The official `compass/google-maps-reviews-scraper` actor costs from $0.30 per 1k Reviews.
  - Community Tripadvisor actors cost $0.39-$0.90 per 1k.
  - Apify has a synchronous run endpoint and $5 of free usage each month.
  - It is also the **only place any TheFork scraper exists** (community actors, success rate as low as 66-80%, Portugal coverage unverified).
- **Outscraper** is the best option for zero-cost prototyping: the first 500 Google Reviews and 500 Tripadvisor Reviews each month are free, and it has a real-time mode. At $3-4 per 1k after that, it breaks the budget at full depth.
- **SerpApi: not recommended.**
  - At $25-75/month it is the most expensive per Review (about 1 search per 20 Reviews).
  - Its Legal Shield applies only to plans of $150 and up.
  - It is a defendant in Google LLC v. SerpApi (a DMCA §1201 case, ongoing) and in a Reddit suit.
- **No vendor has a licensed or compliant basis for Review data.** Everything here means the **personal-only** Access tag.
  - Outscraper claims only a "First Amendment" protection for scraping public data.
  - SerpApi's Legal Shield is indemnity insurance, not a licence.
- **Drop all reviewer fields on ingest.** Use each vendor's server-side field selection where it exists. Also drop review permalinks: Google review links embed reviewer identifiers.

## Comparison table

| | DataForSEO | Apify (actors) | Outscraper | SerpApi |
|---|---|---|---|---|
| Sources | Google, Tripadvisor, Trustpilot (+ app stores). No TheFork | Google (official compass actor), Tripadvisor (community), **TheFork (community only)** | Google, Tripadvisor, Yelp, Booking + ~20 more. No TheFork | Google Maps, Tripadvisor (launched 2026). No TheFork |
| Full history, sort by newest | Yes: `sort_by=newest`, `depth` up to 4,490 | Google: Newest, unlimited. TheFork: `sortBy` newest, `maxReviews` 0 = all | Google: `sort=newest`, `reviewsLimit=0` = all, `cutoff`. Tripadvisor: `limit`, `cutoff` (newest) | Google: `sort_by=newestFirst`, paginated 20/page (8 on page 1). Tripadvisor: `most_recent`, 20/page |
| Content fields | text, original text, original_language, rating, timestamp, owner_answer (+ original), images, review_highlights | text, textTranslated, originalLanguage, stars, publishedAtDate, owner response, reviewDetailedRating, reviewContext, reviewOrigin | text, rating, timestamp, likes, owner_answer (+ timestamp). Tripadvisor: title, text, rating, date, owner_response | Google: snippet, rating, iso_date, details, likes, response. Tripadvisor: title, snippet, rating, **additional_ratings** (Value/Service/...), language, trip_info, response |
| Latency | Async only. Standard queue up to 45 min; **priority queue up to ~1 min** | Sync endpoint `run-sync-get-dataset-items`; seconds to minutes | Async by default (results usually in 1-3 min) or `async=false`; docs say usable as "real-time API" | Synchronous, seconds per page, but many sequential calls for deep history |
| Price | $0.075/1k (standard), $0.15/1k (priority), billed per 10 Reviews | compass Google from $0.30/1k (discounted tier); Tripadvisor $0.39-0.90/1k; TheFork $2.99-3.99/1k | Google: 500 free/mo, then $3/1k (to 100k). Tripadvisor: 500 free/mo, then $4/1k (to 50k) | Free 250 searches/mo; $25/1k searches; $75/5k; $150/15k (~20 Reviews per search) |
| Free tier / minimum | $1 trial credit + sandbox; **$50 minimum payment**, no expiry | $5 usage/month free; Starter $29/mo; unused credit expires | 500 Google + 500 Tripadvisor Reviews/month free | 250 searches/month free |
| (a) 50 Restaurants/mo, full depth (~50k Google + 25k TA) | **~$6 standard / ~$11 priority** | ~$25-50 (actor choice) | ~$246 | $75 (Developer) |
| (a') same, capped at newest 200 Google + 100 TA | ~$1-2 | ~$5-10 (fits the free $5 plus a little) | ~$46 | $25 (Starter, ~1,000 searches) |
| (b) Lisbon baseline, 300 x (100 Google + 50 TA) = 45k | **~$3.40 standard** | ~$15-32 | ~$146 | $75 (one month of Developer) |
| Ergonomics | task_post / tasks_ready / task_get, postback + pingback, 100 tasks per POST, results kept 30 days, sandbox | Mature JS/Python clients, webhooks, datasets, schedules; quality varies by actor | REST, webhooks, 1,000 queries per batch, `fields` filter, Python + Node SDKs, results kept 4 h | Simple JSON GET, client libraries, only successful searches billed |
| Reliability notes | Large B2B SEO data vendor | compass: 99.7-99.8% runs succeeded; clearpath TheFork reviews: 66-80% | Refund within 3 days if a tool fails; a place with 0 Reviews still bills as 1 | Litigation risk (Google, Reddit) |
| Legal posture | No licence claim | No licence claim; the actor author carries the risk | "First Amendment" claim; no licence | Legal Shield up to $2M, **only on $150+ plans**; does not cover data use |
| Access tag | personal-only | personal-only | personal-only | personal-only |

Assumptions behind the cost rows:
- A popular Lisbon Restaurant has on the order of 1,000 Google Reviews and 500 Tripadvisor Reviews. Per-place counts vary widely (tens to several thousand), so treat the estimates as order-of-magnitude.
- Apify ranges use "from $0.30/1k" as the floor for compass Google; the Free-plan per-event price was not published in a retrievable form. Tripadvisor uses the cheapest ($0.39/1k) to the most mature ($0.90/1k) actor.

## Recommendation

1. **Primary: DataForSEO**, for both Google and Tripadvisor.
   - Use the priority queue (`priority=2`) with a `pingback_url` for on-demand Restaurants. The user waits up to about a minute.
   - Use the standard queue for the baseline and for refreshes.
   - Even at full depth, 50 Restaurants a month costs about $6-11. The $50 minimum top-up would last roughly 4-8 months at that rate, and indefinitely at a capped depth.
2. **Fallback: Apify.**
   - Covers Google through the official compass actor and Tripadvisor through a community actor.
   - Apify is also the **only** candidate for TheFork (`clearpath/thefork-restaurant-reviews`, $2.99/1k). Verify that it works on `thefork.pt` before relying on it.
   - The $5 of free usage each month covers capped-depth usage without a subscription.
3. **Prototype for free first with Outscraper** (500 + 500 free Reviews each month, no deposit) if the owner does not want to prepay $50 before validating the pipeline. Do not use it at full depth.
4. **Avoid SerpApi**: cost per Review, litigation, and the Legal Shield is out of budget.
5. **Adopt a depth cap regardless of vendor.** "Full depth" should mean the newest N Reviews (suggest N = 300-500 per Source), plus a `cutoff`/`start` date filter for incremental refreshes. This keeps even the fallbacks inside budget, and the oldest Reviews are weak Evidence for a current Verdict anyway.

## Reviewer PII to drop on ingest

Constraint: no reviewer is ever identified. That means no names, avatars, profile URLs or reviewer IDs, not even hashed.

| Vendor | Drop | Keep |
|---|---|---|
| DataForSEO (Google) | `profile_name`, `profile_url`, `profile_image_url`, `reviews_count`, `photos_count`, `local_guide`, `review_url` | `review_id`, `review_text`, `original_review_text`, `original_language`, `rating`, `timestamp`, `owner_answer`, `original_owner_answer`, `owner_timestamp`, `review_highlights` |
| Outscraper (Google) | `author_title`, `author_id`, `author_link`, `author_image`, `author_reviews_count`, `author_ratings_count`, `review_link` (embeds reviewer ID) | `review_id`, `review_text`, `review_rating`, `review_timestamp`/`review_datetime_utc`, `review_likes`, `owner_answer`, `owner_answer_timestamp` |
| Outscraper (Tripadvisor) | `author_title`, `review_link` | `review_rating`, `review_title`, `review_text`, `review_date`, `owner_response` (text only; drop `owner_title` if it names staff) |
| SerpApi (Google) | entire `user` object (`name`, `link`, `contributor_id`, `thumbnail`, `local_guide`, `reviews`, `photos`), `link` | `review_id`, `rating`, `iso_date`, `snippet`/`extracted_snippet`, `details`, `likes`, `response` text |
| SerpApi (Tripadvisor) | entire `author` object (`author_id`, `username`, `display_name`, `link`, `avatar`, `contributions`, `hometown`), `response.author`, `link` | `review_id`, `title`, `snippet`, `rating`, `additional_ratings`, `date`, `language`, `original_language`, `trip_info`, `response` text |
| Apify compass (Google) | `name`, `reviewerId`, `reviewerUrl`, `reviewerPhotoUrl`, `reviewerNumberOfReviews`, `isLocalGuide`, `reviewUrl` | `reviewId`, `text`, `textTranslated`, `originalLanguage`, `stars`, `publishedAtDate`, `responseFromOwnerText/Date`, `reviewDetailedRating`, `reviewContext`, `reviewOrigin` |
| Apify clearpath (TheFork) | reviewer first name, last name, username, avatar URL, reviewer review count | rating (1-10 scale), text, meal date, creation date, occasion, restaurant reply, food/service/ambience sub-scores |

Rules:
- **Reviewer credibility fields** are indirect identifiers. These are review counts, photo counts, Local Guide status, contributions and hometown. Drop them.
  - If a credibility signal is ever wanted, compute a coarse bucket (e.g. "experienced reviewer": yes/no) at ingest time and store only the bucket, never the count or any ID.
- **Review permalinks**: drop them. Google review URLs encode reviewer identifiers.
  - Keep only the vendor's opaque per-Review ID, for dedupe. It identifies the Review, not the reviewer.
- **Owner response author**: Tripadvisor response objects can name the staff member and carry their avatar. Drop them too.
- **Filter server-side where possible**, so PII never touches our storage or logs:
  - Outscraper: `fields` parameter.
  - Apify: dataset `fields`/`omit` on export, or disable reviewer info (maxcopell has `scrapeReviewerInfo: false`).
  - SerpApi and DataForSEO have no documented exclusion, so strip PII in the ingest adapter before persisting. Never log raw responses.

## Per-vendor detail

### DataForSEO

- Pricing:
  - Google Reviews and Tripadvisor Reviews both cost $0.00075 per 10 Reviews on the standard queue (up to 45 min) and $0.0015 per 10 on the priority queue (up to ~1 min). That is $0.075 and $0.15 per 1k.
  - Billing is per batch of 10 Reviews (a depth of 11 bills as 20).
  - Maximum depth is 4,490. Reviews are served async-only. Source: https://dataforseo.com/apis/reviews-api
- Account:
  - $50 minimum payment; the balance does not expire.
  - $1 free trial credit plus a sandbox. Source: https://dataforseo.com/faq
- Google task_post parameters:
  - `keyword`, `cid` or `place_id`; `location_*`, `language_*`; `depth`; `sort_by` (newest, highest_rating, lowest_rating, relevant); `priority` 1/2; `postback_url`, `pingback_url`.
  - Up to 100 tasks per POST and 2,000 calls/min. Source: https://docs.dataforseo.com/v3/business_data/google/reviews/task_post/
- Returned fields (task_get):
  - Content: `review_text`, `original_review_text`, `original_language`, `review_id`, `rating`, `timestamp`, `time_ago`, `owner_answer`, `original_owner_answer`, `owner_timestamp`, `images`, `review_highlights`, `review_url`.
  - Reviewer: `profile_name`, `profile_url`, `profile_image_url`, `reviews_count`, `photos_count`, `local_guide`.
  - Source: https://docs.dataforseo.com/v3/business_data/google/reviews/task_get/
- Tripadvisor has a parallel endpoint family with the same pricing: https://docs.dataforseo.com/v3/business_data/tripadvisor/reviews/task_post/
- Coverage: Google, Google Extended Reviews, Trustpilot, Tripadvisor, and app stores. No TheFork. Source: https://dataforseo.com/apis/reviews-api

### Apify

- Platform pricing (https://apify.com/pricing):
  - Free: $0 with $5/month usage.
  - Starter: $29/month ($26 billed annually), Bronze Store discount.
  - Scale: $199, Silver. Business: $999, Gold.
  - Unused usage credit does not roll over.
- `compass/google-maps-reviews-scraper` (https://apify.com/compass/google-maps-reviews-scraper):
  - Built by Compass (Apify). About 52.7k users; 99.7% of runs succeeded.
  - Pay-per-event pricing "from $0.30 / 1,000 scraped reviews", with Store discounts by plan.
  - Sorts by newest.
  - Has a "Reviews origin" option. The **default "All reviews" includes third-party reviews such as Tripadvisor**; set it to "Google" for Google-native Reviews only.
  - Output includes reviewer name, ID, URL, photo, review count and Local Guide status. All of these must be dropped.
- Tripadvisor actors:
  - `maxcopell/tripadvisor-reviews`: from $0.90/1k, 100% runs succeeded, 9.2k users, `scrapeReviewerInfo` toggle, `lastReviewDate` cutoff, `disableMachineTranslations`. https://apify.com/maxcopell/tripadvisor-reviews
  - Cheaper community options include themineworks ($0.39/1k + $0.02 per run start), theagents ($0.50/1k) and cirkit ($3.50/1k). Quality is unvetted.
- TheFork actors, the only TheFork option found anywhere:
  - `clearpath/thefork-restaurant-reviews`: $2.99/1k Reviews. Inputs: `sortBy` newest, `reviewsSince`, `maxReviews` (0 = unlimited). Returns a 1-10 rating, meal date, occasion, restaurant reply, and restaurant-level food/service/ambience sub-scores. Reported success rate 66-80%. https://apify.com/clearpath/thefork-restaurant-reviews
  - `clearpath/thefork-scraper`: $5.99 per 1k restaurants (first 100 Reviews included), then $3.99/1k Reviews. Success rate 89.6-99.7%. The docs list FR/DE/IT/ES/UK, and **Portugal is not listed**. https://apify.com/clearpath/thefork-scraper
  - `stealth_mode/thefork-reviews-scraper`: sort `MEAL_DATE-DESC`; 9 users.
- Latency: `POST /v2/acts/{actor}/run-sync-get-dataset-items` returns items synchronously, within the platform's sync timeout. https://docs.apify.com/api/v2

### Outscraper

- Pricing (https://outscraper.com/pricing/, https://outscraper.com/google-maps-reviews-scraper/, https://outscraper.com/tripadvisor-reviews-scraper/):
  - Google Maps Reviews: first 500 free every 30 days, $3/1k from 501 to 100k, $1/1k above 100k.
  - Tripadvisor Reviews: first 500 free, $4/1k from 501 to 50k, $2/1k above 50k.
  - Refund within 3 days if a tool fails to return data.
- Google endpoint `GET https://api.outscraper.com/google-maps-reviews` (https://docs.outscraper.com/endpoints/google-maps-reviews/):
  - Parameters: `query` (place_id, google_id or CID; up to 1,000 per request), `reviewsLimit` (default 100; 0 = unlimited), `sort` (most_relevant/newest/highest_rating/lowest_rating), `cutoff`/`start` (these force newest), `lastPaginationId`, `ignoreEmpty`, `language`, `fields`, `async` (default true), `webhook`.
  - "Optimized for fast responses and can be used as a real-time API"; use `reviewsLimit=10` for maximum speed.
  - A place with no Reviews still bills as one Review.
- Tripadvisor endpoint (https://docs.outscraper.com/endpoints/tripadvisor-reviews/):
  - Parameters: `query` (URL), `limit`, `cutoff`, `language`, `fields`, `async`, `webhook`.
  - Fields: `review_link`, `review_date`, `author_title`, `review_rating`, `review_title`, `review_text`, `review_media`, `owner_title`, `owner_response`.
- Async results are fetched from `GET /requests/{id}` (status Pending/Success/Failure) and kept for 4 hours.
- SDKs: Python `outscraper` 6.0.4 (2026-06-11) and a Node SDK.
- Coverage: the Reviews & Comments category lists about 25 endpoints, including Google, Tripadvisor, Yelp and Booking. No TheFork.
- Legal: its FAQ says scraping public data is "protected by the First Amendment". This is a US-centric claim, not a licence, and does not address the EU GDPR or database rights.

### SerpApi

- Pricing (https://serpapi.com/pricing):
  - Free: 250 searches/month. Starter: $25 for 1k. Developer: $75 for 5k. Production: $150 for 15k. Big Data: $275 for 30k.
  - Only successful searches are billed.
- Google Maps Reviews API (https://serpapi.com/google-maps-reviews-api):
  - `sort_by`: qualityScore, newestFirst, ratingHigh, ratingLow.
  - `num` 1-20, but the first page is fixed at 8. Paginate with `next_page_token`.
  - The `user` object carries name, link, contributor_id, thumbnail, local_guide, reviews and photos.
- Tripadvisor Reviews API (https://serpapi.com/tripadvisor-reviews-api), launched 2026:
  - `sort`: most_recent / detailed_review. `limit` up to 20; `offset`.
  - Filters: `language`, `original_language`, `translate`, `rating`, `month`, `type_of_visit`.
  - Returns `additional_ratings` (sub-ratings such as Value and Service, which map to Aspects).
  - The `author` object is PII, and so is `response.author`.
- Legal Shield (https://serpapi.com/legal):
  - Up to $2M coverage for lawful collection.
  - It excludes the Free, Starter and Developer plans, and does not cover how customers use the data.
- Litigation: Google LLC v. SerpApi LLC, 4:25-cv-10826-YGR (N.D. Cal.), a DMCA §1201 anti-circumvention case (SearchGuard). https://www.courtlistener.com/docket/72059948/google-llc-v-serpapi-llc/
  - Filed 2025-12-19.
  - Motion to dismiss granted on 2026-07-20: claims over non-copyrighted results were dismissed without leave to amend, and the rest with leave.
  - Google filed an amended complaint on 2026-08-10.
  - SerpApi filed a renewed motion to dismiss on 2026-08-24; the hearing is set for 2026-09-29.
  - SerpApi is also being sued by Reddit under the DMCA.
  - These are continuity risks for anyone depending on SerpApi.

### Not evaluated in depth

- Bright Data (Google Maps / Tripadvisor scrapers and datasets): enterprise-oriented, with per-record pricing and commitment tiers. Its prices were not verified in this pass. Given DataForSEO's $0.075-0.15 per 1k, it is unlikely to be cheaper.
- Generic scraping APIs (ScrapingBee, Zyte, ScraperAPI) do not return parsed Reviews, so we would have to build and maintain our own parsers. That is out of scope for a EUR 25/month personal app.

## Legal posture summary

- No vendor offers licensed access to Google, Tripadvisor or TheFork Review content. All of them scrape public pages.
- The claims offered are:
  - Outscraper: a "First Amendment" defence.
  - SerpApi: an indemnity shield on high-tier plans.
  - DataForSEO and Apify: no special claim.
- None of this changes the Access tag. **Every vendor-sourced Review is personal-only.**
- EU note: Lisbon Reviews are EU personal data at collection time, because the vendor response includes reviewer names. Dropping reviewer fields on ingest (and never logging raw payloads) is the minimisation step that matters for us.

## Surprises relevant to other tickets

1. **TheFork has no mainstream vendor.**
   - Only community Apify actors exist. Their success rates are as low as 66-80%, and the more reliable actor does not list Portugal.
   - The Source access matrix should treat TheFork as "fragile / unverified for PT".
2. **Google now mixes third-party reviews into a Google listing's "All reviews"** (per the compass actor docs).
   - Without filtering by Review origin, Tripadvisor Reviews could be double-counted as Google Reviews.
   - This matters for dedupe and Source attribution in the Evidence model.
3. **Google review permalinks embed reviewer identifiers.**
   - Links must never be stored or shown as Evidence. Link to the Restaurant's Source page instead.
   - Tripadvisor owner responses also carry staff identity.
4. **Depth needs a policy.** At $3-4 per 1k, full depth breaks the budget on every vendor except DataForSEO. Define "full depth" as the newest N Reviews per Source plus date-cutoff refreshes.
5. **Structured Aspect signals come for free** from some Sources:
   - Tripadvisor sub-ratings (`additional_ratings`, e.g. Value, Service).
   - TheFork food/service/ambience scores.
   - Google `reviewDetailedRating` / `details` (food/service/atmosphere).
   - The LLM analysis pipeline could use these as calibration Evidence for Aspects.
6. **Language is provided.** DataForSEO and Apify return the original language and the original text alongside Google's translation. Store the original and ignore machine translations.
7. **Money decisions for the owner:**
   - DataForSEO requires a one-off $50 prepay.
   - Apify's free $5/month or Outscraper's free 500 + 500 Reviews/month allow a zero-cost prototype first.
