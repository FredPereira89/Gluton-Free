# Design round 2: reference board and diagnosis (#121, PR #134)

Reference screenshots are private study material and are not committed. Only what was viewed is listed; Resy and Pinterest are marked as such.

## Reference board

| Reference | Pattern worth learning | Why it helps a diner | Maps to real Gluton-Free data | Reject |
|---|---|---|---|---|
| MICHELIN Lisbon | One-line meta under the name (cuisine, price, area); occasion and diet filters up front | A diner compares by reading meta, not by opening pages | Format label, Price tier, Neighbourhood, Dietary fit | Photography (no rights); distinction icons that read as a score |
| The Infatuation Lisbon | Bold type, a one-paragraph verdict, "perfect for" tags | The reason is a sentence a hurried reader trusts | Hero reason (`heroReason`), Standout dish | Map-first layout (no coordinates in the Directory contract) |
| TheFork | Search-first entry, one clear booking action per row | Choosing and acting happen in the same place | Search, Booking link, Open in Google Maps fallback | Numeric ratings, discount badges, urgency copy |
| Mobbin: Honest Greens | Full-bleed hero, one CTA, appetite from type and colour | The first screen says what this is and what to do | Landing: "Know where to eat in Lisbon." plus Sign in with your invite | Food photography; app-store framing |
| Resy Discover (press page only, not viewed live) | Curated collections as an entry point | Narrowing by intent, not by taxonomy | Quick chips: Good or better, Vegetarian, Vegan, Gluten-free | Editorial collections the guide cannot back with Evidence |
| Dribbble food web apps | Colour and composition only | Appetite from a confident single colour | Blue ink on paper plus Tier colours | Delivery-app green saturation, dashboards, stock imagery |
| Pinterest | Not reachable (login wall) | — | — | Not evaluated |

## The five barriers

| # | Barrier (round 1) | Evidence in the product | Fix shipped |
|---|---|---|---|
| 1 | Dense six-column desktop table | Wrapped meta, oversized Book buttons, eye must jump between cells | Ementa lines: name, dotted leader, Verdict; meta and Confidence under the name; Book as a quiet link |
| 2 | Mobile search and filters | Tall checkbox sheet was the only way to narrow | One row of quick chips (pressed state with a check), "All filters (n)" opens the sheet, "Clear all filters" |
| 3 | Badge density | Tier, Confidence, Trend, diet and legend pills in every row and hero | Only the Tier is a pill; Confidence, Trend and diet become plain labelled text; legend collapsed |
| 4 | Weak appeal and identity | Pastel cream and green; text-only landing; no "Lisbon Restaurant Verdict guide" line | Ementa do Dia: paper, one blue ink, double rules, stamped fictional example, display type |
| 5 | Evidence feels like a dashboard | Ten-column Sources table; θ and percentile strips | Per-Source cards with labelled pairs; "How we judged this" stays a closed reading section |

## Data gaps (separate proposals, not built)

| Gap | Why it matters | Proposal |
|---|---|---|
| No one-line reason or Standout dish on a Directory row | The strongest trust signal (a sentence) is only visible after opening the Restaurant | Add an optional `reason` and `standoutDish` to `DirectoryItem`, filled from the existing hero reason, then regenerate the OpenAPI contract |
| No compare or shortlist | Choosing among 2 or 3 is done by memory | A URL-held shortlist (`?pick=a,b,c`) with a side-by-side view; needs a design decision first |
| UI is English only | Many diners read Portuguese | Out of scope for this round |
