# O Velho Eurico extractor sign-off pack — 24 September 2026

**Status: for owner review.** The extraction and privacy checks passed. The expected renovation signal did **not** appear in the defined Review window, so this pack does not recommend freezing the extractor until the owner reviews that gap.

## Scope and run

- Candidate: `claude-haiku-4-5|extract-v2|themes-v1` (Haiku 4.5, schema v2, Theme vocabulary v1).
- ADR 0004 window: each Source's newest 100 text Reviews no older than 24 months. This produced **100 Google** Reviews (15 June–23 September 2026) and **58 Tripadvisor** Reviews (26 September 2024–20 August 2026), **158 total**.
- Re-extracted **158/158** with the candidate. **0 failures (0%)**, below the 2% limit. Existing older-version analyses were replaced for these rows.
- Sign-off job **3** records eight synchronous extraction requests, **45,005 input tokens**, **17,373 output tokens** and **$0.131870** extraction cost. The job also records three 100-text privacy-audit passes costing **$0.064645** in total. No vendor fetch was needed.
- No new Verdict was issued; this is an extractor sign-off run, not a change to the owner-confirmed Change point or the published Verdict.

## Per-Review extraction schema

The model receives a stored, scrubbed text and stars for context. It returns one entry keyed to the internal Review ID. Scores come **from text alone**, not from stars. `null` means the Aspect was not discussed. Names are used for redaction, then discarded; they are not stored as analysis fields.

| Field | Allowed output | O Velho Eurico example |
| --- | --- | --- |
| `i` | Internal Review ID | Google Review 4, 21 Sep 2026 |
| `lang` | Language code | Review 4: `en` |
| `food`, `service`, `ambience`, `value`, `wait`, `consistency` | Integer −2 to +2, or `null` | Review 4: food +2, service +2, ambience +1; value, wait and consistency `null`. Review 11: service −2 and wait −2. |
| `exceptional` | `none`, `food`, `service`, `overall` | Review 4: `overall`; Review 2: `food` |
| `change` | `none`, `new_owner`, `new_chef`, `renovated`, `new_concept`, `moved` | All 158 window Reviews: `none`. This is the open sign-off concern below. |
| `themes` | Up to three codes from the controlled vocabulary below | Review 4: `food_delicious`, `food_fresh`, `service_attentive` |
| `flags` | Zero or more incidents with `type`, `first_hand`, `severity` (`low`/`medium`/`high`) and an evidence span | Review 20: first-hand `scam_overcharge`, low severity; verification pending. |
| `quote` | Verbatim short text, Aspect and positive/negative polarity, or `null` | Review 4: positive food quote selected; its text is omitted from this pack. |
| `names` | Personal-name spans for immediate redaction | No names are persisted on `review_analysis`. |

An out-of-vocabulary `change` is treated as `none` without dropping the rest of the Review extraction. The stored `review_analysis` row contains the six scores, exceptional, change, Theme codes, a redacted quote and its Aspect/polarity, extractor version and analysis time. Flags are stored separately with their group and verification status.

## Theme vocabulary

Counts are the number of the 158 extracted window Reviews tagged with each code. Zero means the code remains available but had no O Velho Eurico example in this window. Review IDs are internal references; no reviewer identity or Review text is reproduced here.

| Aspect | Code — label | Count | Example Review |
| --- | --- | ---: | ---: |
| Food | `food_delicious` — Delicious food | 88 | 2 |
| Food | `food_authentic` — Authentic Portuguese cooking | 13 | 8 |
| Food | `food_fresh` — Fresh ingredients | 5 | 4 |
| Food | `food_generous_portions` — Generous portions | 1 | 4378 |
| Food | `food_standout_dish` — A standout dish | 26 | 10 |
| Food | `food_creative` — Creative twists on tradition | 6 | 17 |
| Food | `food_desserts` — Great desserts | 0 | — |
| Food | `food_drinks` — Good wine and drinks | 5 | 19 |
| Food | `food_bland` — Bland or under-seasoned | 4 | 38 |
| Food | `food_poorly_cooked` — Poorly cooked | 2 | 130 |
| Food | `food_small_portions` — Small portions | 12 | 35 |
| Food | `food_not_fresh` — Not fresh or reheated | 0 | — |
| Food | `food_touristy` — Tourist-grade food | 1 | 141 |
| Food | `food_few_options` — Few options for dietary needs | 1 | 4333 |
| Service | `service_warm` — Warm, friendly staff | 49 | 3 |
| Service | `service_attentive` — Attentive service | 17 | 4 |
| Service | `service_recommendations` — Good recommendations | 3 | 4345 |
| Service | `service_slow` — Slow service | 4 | 101 |
| Service | `service_rude` — Rude or unwelcoming | 10 | 45 |
| Service | `service_rushed` — Rushed | 0 | — |
| Service | `service_inattentive` — Inattentive | 12 | 35 |
| Service | `service_mistakes` — Order or bill mistakes | 0 | — |
| Ambience | `ambience_cosy` — Cosy, homely room | 6 | 78 |
| Ambience | `ambience_lively` — Lively atmosphere | 15 | 3 |
| Ambience | `ambience_setting` — Charming setting | 1 | 114 |
| Ambience | `ambience_noisy` — Noisy | 6 | 38 |
| Ambience | `ambience_cramped` — Cramped | 4 | 38 |
| Ambience | `ambience_touristy` — Full of tourists | 1 | 20 |
| Ambience | `ambience_uncomfortable` — Uncomfortable | 2 | 127 |
| Value | `value_good` — Good value for money | 3 | 4340 |
| Value | `value_overpriced` — Overpriced | 9 | 20 |
| Value | `value_unordered_couvert` — Unordered couvert charged | 0 | — |
| Value | `value_bill_surprise` — Unexpected charges | 0 | — |
| Wait | `wait_quick` — Seated or served quickly | 3 | 15 |
| Wait | `wait_booking_essential` — Hard to get a table | 7 | 52 |
| Wait | `wait_long_queue` — Long wait for a table | 12 | 11 |
| Wait | `wait_slow_kitchen` — Long wait for food | 4 | 35 |
| Consistency | `consistency_reliable` — Reliably good on repeat visits | 2 | 42 |
| Consistency | `consistency_declined` — Not what it used to be | 0 | — |
| Consistency | `consistency_uneven` — Uneven | 0 | — |

## Red flag groups

| Group | Incident types | O Velho Eurico example in the window |
| --- | --- | --- |
| Health | `food_poisoning`, `hygiene`, `other_safety` | Three `other_safety` candidates; Review 80 (Google, 4 Aug 2026) is first-hand, medium severity. All three remain **pending** verification. |
| Money | `scam_overcharge` | Three candidates; Review 20 (Google, 13 Sep 2026) is first-hand, low severity. All three remain **pending** verification. |

The examples are extraction candidates, **not verified incidents**. The current Red flag rule uses the group and verification result, not a model flag on its own.

## Fetched fields per Review

The ingest whitelist stores only the following Review fields. Counts show non-null values within this sign-off window; `owner_replied` is a stored boolean, so its count shows `true` values. Google Review 4 and Tripadvisor Review 4340 are concrete examples.

| Stored field | Google (100) | Tripadvisor (58) | Example / meaning |
| --- | ---: | ---: | --- |
| `source_review_id` | 100 | 58 | Source-native deduplication key; value withheld from this pack. |
| `stars` | 100 | 58 | Review 4: 5; Review 4340: 5. |
| `published_at` | 100 | 58 | Review 4: 21 Sep 2026; Review 4340: 14 Feb 2026. |
| `language` | 100 | 58 | Both examples: `en`. |
| `text` | 100 | 58 | Scrubbed body; no raw text reproduced here. |
| `sub_ratings` | 89 | 17 | Review 4: food 5, service 5, ambience 5; Review 4340: food 5, value 5, service 5, ambience 5. |
| `reviewer_review_count` | 100 | 0 | Review 4: 40. Count only, with no profile or identity. |
| `local_guide` | 100 | 0 | Review 4: `true`. |
| `reviewer_contributions` | 0 | 58 | Review 4340: 9. Count only. |
| `photo_count` | 76 | 0 | Review 4: 71. |
| `visited_on` | 0 | 58 | Tripadvisor's reported visit date; present for Review 4340. |
| `owner_replied` | 7 true | 0 true | Both example Reviews: `false`; only a boolean is kept, never the response text. |

The row also has internal `id`, `listing_id` and `fetched_at`. No reviewer name, avatar, profile URL, Review permalink or raw vendor payload has a storage column.

## `change` markers by publication month

| Month | Window text Reviews | `none` | `renovated` | Other change |
| --- | ---: | ---: | ---: | ---: |
| 2024-09 | 1 | 1 | 0 | 0 |
| 2024-10 | 7 | 7 | 0 | 0 |
| 2024-11 | 2 | 2 | 0 | 0 |
| 2024-12 | 1 | 1 | 0 | 0 |
| 2025-01 | 1 | 1 | 0 | 0 |
| 2025-02 | 1 | 1 | 0 | 0 |
| 2025-03 | 2 | 2 | 0 | 0 |
| 2025-04 | 1 | 1 | 0 | 0 |
| 2025-05 | 5 | 5 | 0 | 0 |
| 2025-06 | 3 | 3 | 0 | 0 |
| 2025-07 | 4 | 4 | 0 | 0 |
| 2025-08 | 4 | 4 | 0 | 0 |
| 2025-09 | 6 | 6 | 0 | 0 |
| 2025-10 | 5 | 5 | 0 | 0 |
| 2025-11 | 0 | 0 | 0 | 0 |
| 2025-12 | 2 | 2 | 0 | 0 |
| 2026-01 | 2 | 2 | 0 | 0 |
| 2026-02 | 2 | 2 | 0 | 0 |
| 2026-03 | 3 | 3 | 0 | 0 |
| 2026-04 | 2 | 2 | 0 | 0 |
| 2026-05 | 0 | 0 | 0 | 0 |
| 2026-06 | 14 | 14 | 0 | 0 |
| 2026-07 | 35 | 35 | 0 | 0 |
| 2026-08 | 36 | 36 | 0 | 0 |
| 2026-09 | 19 | 19 | 0 | 0 |
| **Total** | **158** | **158** | **0** | **0** |

**Owner decision needed:** the expected `renovated` cluster around 6 May 2025 is absent. The database has **26 Google text Reviews from May 2025**, beginning on 6 May, but they fall outside Google's newest-100 window (which begins in June 2026). The five May 2025 Tripadvisor Reviews are in the window and all yielded `none`. This does not prove the extractor missed explicit renovation text; it shows the specified window cannot test most of the expected period. A targeted May 2025 diagnostic sample or owner review of the available source material is needed before claiming this signal works. No Change point has been inferred or applied automatically.

## PII audit: 100 random stored texts

The reproducible sample was selected from **all 4,824 stored text Reviews** by sorting on `md5(review.id || 'issue29-2026-09-24')` and taking 100: **60 Google, 40 Tripadvisor**. Haiku 4.5 checked each text for visible personal names and for explicit author self-identification. No raw text or detected name was logged or added to this pack.

| Pass | Possible reviewer names | Other personal names | Result |
| --- | ---: | ---: | --- |
| Initial | 1 | 6 | Seven sampled texts required redaction. |
| Remediation | 1 | 6 | Exact detected spans were replaced with `[name]` in the Review text and any linked analysis quote or flag evidence. |
| Re-audit of the same 100 | **0** | **0** | No visible personal names detected. |

This is a model-assisted spot check of 100 texts, not a proof about every stored text. The reviewer-name finding was corrected before this pack was prepared. Reviewer identity fields are excluded at ingest by the whitelist.

## References

- [Issue #29](https://github.com/FredPereira89/Gluton-Free/issues/29), [ADR 0004](adr/0004-capped-recent-review-window.md), [ADR 0007](adr/0007-change-points-cut-the-review-window.md)
- Extractor schema: `src/analysis/extract.ts`; Theme definitions: `src/domain/themes.ts`; ingest whitelist: `src/ingest/normalise.ts`
- Reproduction: `npx tsx --env-file=.env.local scripts/extract-signoff.ts o-velho-eurico` and `npx tsx --env-file=.env.local scripts/audit-review-pii.ts o-velho-eurico 3`
