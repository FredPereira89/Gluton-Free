# Design round 3: the Lisbon decision journey

Goal: someone on a phone, in a hurry, chooses between two or three Restaurants, trusts the Verdict, then books or opens the map. The visual world is **Recorte** (paper cut-outs on a lemon ground), chosen by the owner; it replaces the round-2 "Ementa do Dia" look. The Verdict, Tier pips, shortlist/Compare structure and every business rule are kept. Screenshots are private study material in `.impeccable/review/` (`r5-before-*`, `r5-after-*`) and are not committed.

## Reference board

Only what was fetched on 2026-10-02 is recorded. Nothing below is remembered or inferred.

| Reference | Observed | Why it helps a diner | Use with real data | Reject |
|---|---|---|---|---|
| TheFork (page fetched returned the **Paris** list, not Lisbon) | Cards: name, score with review count, cuisine, average price, photo carousel. Filters: promotions, best rated, cuisine, neighbourhood, price, "ideal for" | One glance gives kind, price and area; neighbourhood and price are first-class filters | Directory filter order: Neighbourhood, Price, Dietary fit, Kind of place, Tier. Meta line stays Kind · Price · Area | Numeric scores, "-20%/-50%" and "Double Yums" badges, photo carousels |
| The Infatuation Lisbon (hub page) | Guide title, one-line summary, author, date. No per-entry rating or tag is shown on the hub | A sentence, not a number, carries the judgement | The Verdict reason line, set in the printed-voice italic, is the hero of each row and of the Report | Author-led editorial framing (our Verdicts come from Reviews, not a critic) |
| MICHELIN Guide Lisbon | **Not reachable**: the restaurants URL returned not-found / empty content | n/a | n/a | Not evaluated. Offer: a screenshot of the list and filter bar |
| Resy | **Not reachable**: fetch failed | n/a | n/a | Not evaluated. Offer: a screenshot |
| Figma Community (owner screenshot) | A row of tag chips above a grid of uniform thumbnails; a Filters / Sort bar; each tile carries a meta line | Chips plus Filters/Sort is a known pattern for narrowing a long list on a phone | Directory chip row (Good or better, €–€€, kinds, diets) then Filters, then Sort by | Dependence on photos; like counts; Free/Paid labels |
| Pinterest "webdesign food" (owner screenshot) | A coloured chip row; a masonry of saturated colour blocks | Saturated colour blocks make a food page feel alive at a glance | Flat colour fields (lemon, tomato, cobalt, olive) with a job each | Photo-led masonry; engagement counts; any discount styling |
| Mobbin, Dribbble, Awwwards, Medium, tāst, DesignRush | **Not re-attempted this round**: login walls or marketing pages; round 2 recorded the same | n/a | n/a | Not evaluated. Offer: screenshots of any you want weighed |

Because only two sources opened (one of them the wrong city) plus two owner screenshots, the board is thin. The patterns adopted come mainly from diagnosing the product itself, not from the references. Send screenshots of MICHELIN, Resy or Mobbin flows to widen it.

## Five barriers and what changed

| # | Barrier | Before | After |
|---|---|---|---|
| 1 | Dense table, no way to compare | Rows 250–300px tall on a phone; no shortlist; two Restaurants meant two tabs | Row carries Verdict, Confidence, reason, meta only (Trend removed from rows). Shortlist of up to 3, a bottom dock, and `/compare` with one card per Restaurant (side by side from 720px) |
| 2 | Mobile search and filters | Banner, masthead, long intro and search consumed the first screen | One-line h1 "Where to eat in Lisbon?", "Have a link?" folded, compact masthead, results begin at the first scroll. Filter sheet groups fold; Neighbourhood first; chips for Good or better, €–€€, Traditional Portuguese, diets |
| 3 | Badge density | Tier, Confidence, Trend, diet icons and booking on every row | Row: Tier, Confidence, reason, meta, shortlist. Booking link hidden on phone rows (it leads the Report). Trend lives on the Report and in Compare |
| 4 | Weak appeal | Strong type, no appetite | Framed illustration on the landing (`lisbon-table.png`), explicit "A Lisbon Restaurant Verdict guide.", three steps, fictional sample kept |
| 5 | Report first screen and trust | Hero held competing links; Evidence not obvious | First phone screen: name, address, Verdict, Confidence, reason, Open in Google Maps, "Read the Evidence" jump. Google and Tripadvisor links stay in Sources. Dietary fit always renders, with an honest unknown message |

Evidence without a dashboard feel: the Evidence sits behind one jump link in the same Ementa vocabulary (dotted rules, ledger figures, disclosures). No chart grid was added.

## Direction decision

| Step | Outcome |
|---|---|
| Round 0 and a bolder round 1 | Rejected by the owner: too close to the incumbent. Brief: "a bold, colorful approach that is relatable to food and the name Gluton-Free" |
| Four own worlds, each with a mock | Recorte (paper cut-outs), Conserveira (sardine-tin labels), Pastelaria (pastry-shop awning), Mesa (full-bleed plate). Third-party reference photos were used only to choose a world and are **not shipped** |
| Chosen | **Recorte**, by the owner. Contract: `.impeccable/surfaces/src-app-page-tsx.md` |

Recorte tokens: lemon ground `#FFD23F` (dark: ink-navy `#0E1233`), cream paper `#FFF8E7`, ink `#14110F`, cobalt action `#1F3FBF` (dark: lemon), tomato `#D63A26`, olive `#5E8A1E`. Bagel Fat One for the wordmark, headlines, Restaurant names and Verdicts; Figtree for reading; Courier Prime for ledger figures only. Colour has a job: lemon is the ground, cobalt is the action, tomato marks "eat" and warnings, olive is Good-side. A Tier is always a capsule with pips and its word, never hue alone.

## Key decisions

- Recorte replaces Ementa do Dia; the class names `ementa`, `leader` and `hl-eat` are kept in markup to protect tests and behaviour.
- Phone landing order: headline, illustration, short intro, full-width Sign in, sample card.
- Compare collapses a row that is empty for every Restaurant into one sentence, so it adds decision value, not length.
- A Verdict is never a star or a score. Compare never ranks, orders by Tier or highlights a winner; it lists facts in the order shortlisted.
- Shortlist stores slugs only, in `sessionStorage`, cleared on sign-out. Verdicts are loaded fresh on `/compare`, so a stale Verdict is impossible. `/compare` is invitee-readable (ADR 0008).
- Missing information is stated: "No standout dish in the Reviews yet", "No dietary information in the Reviews yet. Ask the Restaurant before you go."

## Image rights and provenance

| Asset | Source | Rights | Use |
|---|---|---|---|
| `public/lisbon-table.png` (1536×1024, transparent cut-out) | Supplied by the owner on 2026-10-02; creation tool not recorded by the owner | **Owner-confirmed** on 2026-10-02 ("right ok") | Landing only, captioned "Original illustration. It does not show any listed Restaurant." Depicts two grilled sardines on a blue-and-white plate; no real venue |
| `public/logo-mark.png` | Owner-supplied brand mark, kept as is; shown on a fixed cream disc in both themes | Owner's | Header, favicon candidates |

No Restaurant photos are used anywhere. The reference photos shown to the owner when choosing a world are not part of the build.

## Backend-dependent ideas (not built)

| Idea | Needs |
|---|---|
| Filter by occasion (date night, group) | Occasion tags from the extractor |
| Walking time from where I am | Location permission plus geocoded Restaurants |
| Open now | Opening hours source |
| Live availability | Booking partner API |
| Dish-led discovery ("where is the best arroz de tamboril") | Dish index across Reviews |
| Shareable comparison link for a group | Owner decision on invitee sharing; today `/compare` needs sign-in |
| Shortlist that follows the diner across devices | Server-side storage per account |

## Verification (2026-10-02)

| Check | Result |
|---|---|
| `npm run typecheck` | Clean |
| `vitest run src` | 76 files, 739 tests pass (Docker-dependent suites not run: no Docker) |
| Report at 390×844 for Avoid, OK, Good, Must Go, Life Changing, Not enough evidence | Verdict, Confidence, reason and next action inside the first 844px; no horizontal overflow at 390, 768, 1280 |
| Compare at 390 and 1280, one Restaurant, a missing slug | Stacked / side by side; both error states honest; no overflow |
| Filter sheet at 390 | Groups fold; "Show N results" reachable |
| Recorte: Directory, Report (Life Changing, Avoid, Not enough evidence), Compare at 390/768/1280, light and dark | Reviewed in screenshots; no overflow |
| Contrast audit (computed, Directory + Report, light and dark) | 0 failures against 4.5:1 body and 3:1 large |
| Tap targets | Confidence "?", source links and "Show N with Not enough evidence" raised to 44px; row links are stretched across the row |
| `impeccable detect` | 0 non-advisory findings |

## Limitations

- Reference board is thin (see above).
- Dark mode, keyboard-only and screen-reader passes were done for the landing and by markup/tests elsewhere; no assistive-technology run.
- Phone appearance was checked in an emulated 390px viewport, not on a physical device.
- A source labelled "Google" on one Report linked to an Instagram address; this comes from stored source data, not the redesign, and is unchanged.
- Long-name and loading-skeleton states were checked by markup and CSS (`overflow-wrap:anywhere`), not captured.
- The Next dev badge overlaps the dock in dev screenshots; it does not ship.
