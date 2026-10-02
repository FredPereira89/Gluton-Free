---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/globals.css","src/app/layout.tsx","src/app/directory.tsx","src/app/r/[slug]/page.tsx"]
---

# Surface brief: Landing + Directory + Compare + Report journey, third round (decision journey, Recorte world)

Mode: Persuade (landing), Operate (Directory, Compare, Report; "How we judged this" is Read). Scope: the whole path a phone diner walks, landing, find, narrow and compare, read the Verdict, book or open the map. Replaces the round-2 "Ementa do Dia" look at the owner's request ("a bold, colorful approach that is relatable to food and the name Gluton-Free"); keeps `public/logo-mark.png`, `public/lisbon-table.png`, Verdict semantics, Tier pips, the shortlist and Compare structure, and every business rule.
Anti-goals: delivery-app discount styling, stock-photo cards, dashboard feel, fabricated social proof, any image that implies it shows a listed Restaurant, stars or numeric scores as a Verdict.
Unresolved: Portuguese UI out of scope; a one-line reason or standout dish per Directory row needs a DirectoryItem contract change (proposed separately); 3-real-phone test (owner cannot test on a physical phone).

## Direction contract

THESIS: The guide is a paper cut-out, Matisse's scissors in a Lisbon kitchen. Flat saturated colour fields and food shapes (lemon, tomato, olive, cobalt) cut from paper, set on a lemon ground, with cream paper cards carrying the facts. The one idea is joyful colour that does a job: lemon is the ground, cobalt is the action, tomato marks "eat" and warnings, olive is Good-side. Refuses the category default of a white photo card with a star score, and refuses the sober paper-menu look it replaces.

OWN-WORLD: Lemon ground (#FFD23F), cream paper (#FFF8E7), ink (#14110F), cobalt action (#1F3FBF), tomato (#D63A26), olive (#5E8A1E). Bagel Fat One (chunky rounded display) for the wordmark, headlines, Restaurant names and Verdicts; Figtree for reading; Courier Prime only for ledger figures (price, counts, dates). Organic blob radii on the hero illustration and the word "eat", round cut-paper discs bleeding off corners, pill buttons, cream cards with a soft lift and large radii, dotted leaders between name and Verdict. Dark mode flips to a deep cobalt-ink night with a lemon action. Recognisable with content removed: a lemon page, a tomato blob and cobalt disc at the edges, cream rounded cards, a chunky face.

STORY: A diner on a phone, hungry, choosing among two or three tables in a hurry. The landing says within seconds that this is a Lisbon Restaurant Verdict guide, and the colour says food and fun, not a dashboard. They narrow with one tap, shortlist up to three, compare facts side by side, open one table and see Verdict, Confidence, the main reason and one action. They trust it because the Verdict is a word plus pips and a sentence of reason, never a star or number, and the illustration is labelled as not showing any listed Restaurant.

FIRST VIEWPORT (390px): Landing on lemon: wordmark and Sign in pill; "Know where to eat in Lisbon." at about 52px in Bagel Fat One with "eat" on a tomato blob; the owner's sardine-plate illustration in an organic blob with a cobalt disc, a tomato disc and an olive leaf behind it and the caption "Original illustration. It does not show any listed Restaurant."; one sentence naming a Lisbon Restaurant Verdict guide judged against its own kind; a full-width cobalt "Sign in with your invite" pill; then the cream, slightly tilted fictional Casa Imaginária card with Good pips and Medium Confidence. Directory: search, one row of filter chips (pressed chip is cobalt with a check), cream rounded ementa card of lines. Report: name, Verdict capsule with Confidence, the main reason, a full-width Maps or Book pill, all above 700px.

FORM: Own-world direction authored from the owner's brief, not a catalogue roll; "Recorte" was position 1 of 4 on the decision page (Recorte, Conserveira, Pastelaria, Mesa), chosen by the owner. Seed key c109bad0, bolder register, challenger. Signature interaction: each Directory line's dotted leader draws from the name to the Verdict in tomato on hover and focus (200ms, ease-out, off under prefers-reduced-motion).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Round 3 update (2026-10-02)
Mode: Operate. The first phone screen must show Verdict, Confidence, the main reason and the next action (Open in Google Maps), with a "Read the Evidence" jump to `#report-evidence`. Hero carries name and address only; Google and Tripadvisor links stay in Sources. Dietary fit always renders, with an honest unknown state. Back link and shortlist button share one row. See `docs/design-round-3-decision-journey.md`.
