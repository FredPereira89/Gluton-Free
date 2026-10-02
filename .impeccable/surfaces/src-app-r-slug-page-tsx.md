---
version: 1
slug: "src-app-r-slug-page-tsx"
primary_target: "src/app/r/[slug]/page.tsx"
related_targets: ["src/app/directory.tsx","src/app/globals.css","src/web/atoms.tsx"]
---

# Surface brief: Report + Directory foundation (#121)

Mode: Operate (Report; "How we judged this" is Read). Scope: foundation first. Tokens, Tier badge, Confidence dots, Trend chip, Dietary icons, restaurant card and row, on Report and Directory. Other surfaces follow in later passes.
Anti-goals: cold or clinical; dense data-dashboard feel.
Unresolved: tone of a playful register against a judgement (test in the first screenshot round); 3-real-phone test; Portuguese UI out of scope.

## Direction contract

THESIS: A Restaurant is a lobe on a guide map, and the Verdict is the lobe's size and fill. The one idea: the Tier reads from lobe fill and pip count plus its label, never hue alone. Refuses the category default of a star or score pill on a white card.

OWN-WORLD: Flat unmodulated colour on warm cream (#F5F1E4), ink #2C2E2A. Soft swelling lobes with round corners, pastel tinted cards with circular icon badges, capsule controls, a yellow pill accent, wavy-line dividers. Tier fills run coral, sand, light green, green, yellow, always with ink text. No gradients, no shadows beyond one flat offset. Recognisable with content removed: cream ground, capsule buttons, round pips.

STORY: A diner on a phone sees what the Restaurant is judged, how sure we are and why, then taps one capsule to book or open the map. They believe it because the reasons sit in the first screen.

FIRST VIEWPORT (390px): Name and area top. A large Tier lobe with its 5 round pips and label, Confidence dots beside it. One reason line. Praise and warn chips. Full-width capsule Book button anchored under the reason, at least 44px tall. Legend, facts and history sit below the fold. Desktop: same stack at 720px max, Book capsule on the lobe edge.

FORM: Challenger "Guide Map Lobes" (challenger-zoo-map), chosen by the user on the decision page. Seed key acf7307b. Signature interaction: the Tier lobe swells 4% on row hover and focus; motion is 160ms, off under prefers-reduced-motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
