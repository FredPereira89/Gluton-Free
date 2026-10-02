---
version: 1
slug: "src-app-r-slug-page-tsx"
primary_target: "src/app/r/[slug]/page.tsx"
related_targets: ["src/app/page.tsx","src/app/directory.tsx","src/app/directory-controls.tsx","src/app/globals.css","src/web/atoms.tsx"]
---

# Surface brief: Landing + Directory + Report journey, second round (#121, PR #134)

Mode: Persuade (landing), Operate (Directory, Report; "How we judged this" is Read). Scope: the whole path a phone diner walks, landing, find, narrow and compare, read the Verdict, book or open the map. Replaces the round-1 "Guide Map Lobes" look; retains the original G-and-dot logo in two blue tones while keeping Verdict semantics, Tier pips and every business rule.
Anti-goals: delivery-app discount styling, stock-photo cards, dashboard feel, fabricated social proof, any image that implies it shows a listed Restaurant.
Unresolved: Portuguese UI out of scope; a one-line reason or standout dish per Directory row needs a DirectoryItem contract change (proposed separately); 3-real-phone test.

## Direction contract

THESIS: The guide is an ementa, the paper menu of a Lisbon tasca. A Restaurant is a line: name, dotted leader, Verdict. The one idea is the leader line that carries the eye from a name to its call, so a diner compares three tables by reading down one edge. Refuses the category default of a photo card with a star score.

OWN-WORLD: Table-paper white (#FBFBF8) printed in one colour of blue ink (#1C3D9B), with tomato (#D9402B) only for the rubber stamp and red flags, and menu green (#1F6F43) for Good. Double-rule frames, dotted leaders, one hand-stamped "Not a real Verdict" disc on the fictional example. Bricolage Grotesque for names and Verdicts, Schibsted Grotesk for reading, Courier Prime only for the ledger details (price, counts, dates). No gradients, no photographs, no drop shadow beyond one soft paper lift. Recognisable with content removed: blue double rule on paper, dotted leaders, round pips.

STORY: A diner on a phone, hungry, choosing among two or three tables in a hurry. They read the landing and know within seconds this is a Lisbon Restaurant Verdict guide. They narrow with one tap, compare by reading down the leader edge, open one table and see Verdict, Confidence, the main reason and one action. They believe it because the reason is a sentence, not a number, and Evidence is one tap away.

FIRST VIEWPORT (390px): Landing: wordmark and Sign in, then "Know where to eat in Lisbon." in heavy blue type, one sentence naming a Lisbon Restaurant Verdict guide judged against its own kind, a double-rule card with the fictional Casa Imaginária ledger line, Good pips, Medium Confidence, the "Not a real Verdict" stamp, and the full-width "Sign in with your invite" button. Directory: search, one row of filter chips, then ementa lines. Report: name, Verdict capsule with Confidence, the main reason, a full-width Book or Open-in-Maps button, all above 700px.

FORM: Model pick "Ementa do Dia" (position 2 of 3 on the decision page), chosen by the user. Seed key 268cf2c0. Signature interaction: each ementa line's leader draws from the name to the Verdict on hover and focus (200ms, ease-out, off under prefers-reduced-motion); the Directory keeps its state in the URL.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
