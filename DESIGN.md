---
name: Gluton-Free
description: A Lisbon Restaurant Verdict guide cut from paper, cream cards and flat colour fields on a lemon ground.
colors:
  ground: "#FFD23F"
  surface: "#FFF8E7"
  sunk: "#F6E6B4"
  ink: "#14110F"
  muted: "#4D4108"
  faint: "#594C10"
  line: "#E2C766"
  edge: "#7A6416"
  band: "#EBD9A0"
  brand: "#1F3FBF"
  on-brand: "#FFFFFF"
  accent: "#1F3FBF"
  accent-soft: "#DDE4FA"
  focus: "#14110F"
  coral: "#D63A26"
  on-coral: "#FFFFFF"
  olive: "#5E8A1E"
  sun: "#FFD23F"
  tier-avoid: "#B72A17"
  tier-avoid-fill: "#FBDDD6"
  tier-ok: "#55506B"
  tier-ok-fill: "#E6E3EE"
  tier-good: "#4A7216"
  tier-good-fill: "#E1EBC9"
  tier-must-go: "#14603A"
  tier-must-go-fill: "#CFE6D6"
  tier-life-changing: "#F2A900"
  tier-life-changing-fill: "#FFE9A8"
  on-tier: "#FFFFFF"
  flag: "#B72A17"
  flag-fill: "#FBDDD6"
  warn: "#7A5200"
  warn-fill: "#FFEFB8"
typography:
  display:
    fontFamily: "Bagel Fat One, Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(44px, 13.4vw, 76px)"
    fontWeight: 400
    lineHeight: 0.98
  headline:
    fontFamily: "Bagel Fat One, Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(32px, 8vw, 48px)"
    fontWeight: 400
    lineHeight: 1.05
  directory-title:
    fontFamily: "Bagel Fat One, Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(26px, 6vw, 34px)"
    fontWeight: 400
    lineHeight: 1.1
  line-name:
    fontFamily: "Bagel Fat One, Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.15
  hero-tier:
    fontFamily: "Bagel Fat One, Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(23px, 6.2vw, 38px)"
    fontWeight: 400
    lineHeight: 1.1
  page-title:
    fontFamily: "Bagel Fat One, Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 400
    lineHeight: 1.1
  section-title:
    fontFamily: "Bagel Fat One, Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.1
  title:
    fontFamily: "Bagel Fat One, Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.1
  lede:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(17px, 2.2vw, 20px)"
    fontWeight: 400
    lineHeight: 1.5
  reason:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(20px, 5vw, 24px)"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
  caption:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  ledger:
    fontFamily: "Courier Prime, Courier New, ui-monospace, monospace"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tabular-nums"
rounded:
  sm: "10px"
  card: "22px"
  lobe: "28px"
  pill: "999px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  s-7: "48px"
components:
  tier:
    backgroundColor: "{colors.tier-good}"
    textColor: "{colors.on-tier}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 14px"
  tier-lg:
    backgroundColor: "{colors.tier-good}"
    textColor: "{colors.on-tier}"
    typography: "{typography.hero-tier}"
    rounded: "{rounded.pill}"
    padding: "8px 22px"
  tier-provisional:
    backgroundColor: "{colors.tier-good-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "4px 14px"
  nee:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 18px"
  chip:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  book:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.pill}"
    padding: "0 26px"
    height: "52px"
  book-sm:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  btn:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.pill}"
    padding: "8px 20px"
    height: "44px"
  btn-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    padding: "8px 20px"
    height: "44px"
  btn-danger:
    backgroundColor: "{colors.flag-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 20px"
    height: "44px"
  sign-in-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 18px"
  dir-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  dir-chip-pressed:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
  shortlist-btn:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    padding: "0"
    height: "44px"
  shortlist-btn-labelled:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 14px 0 8px"
    height: "44px"
  shortlist-btn-pressed:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    markFill: "{colors.brand}"
    markColor: "{colors.on-brand}"
  ementa:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  ementa-course:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink}"
    padding: "12px 16px 6px"
  report-hero:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lobe}"
    padding: "24px"
  compare-table:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "0"
  shortlist-dock:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lobe}"
    padding: "10px 16px"
  flag:
    backgroundColor: "{colors.flag-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "14px 16px"
  source-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "14px 16px"
  filter-sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lobe}"
    padding: "0 16px 20px"
  skeleton-block:
    backgroundColor: "{colors.band}"
    rounded: "{rounded.card}"
  diet-badge:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    size: "28px"
---

# Design System: Gluton-Free

Recorded from the shipped build of the round-3 "Recorte" redesign (owner-chosen, seed key c109bad0), from `src/app/globals.css`, `layout.tsx`, `page.tsx`, `compare/page.tsx`, `directory.tsx`, `r/[slug]/page.tsx` and `src/web/*.tsx`. It replaces the round-2 "Ementa do Dia" system. Provenance and decisions: `docs/design-round-3-decision-journey.md`. Where the build and the direction contract differ, the build is recorded.

## Overview

**Creative North Star: "Recorte"**

The guide is a paper cut-out, Matisse's scissors in a Lisbon kitchen. Flat saturated colour fields and food shapes (lemon, tomato, olive, cobalt) are cut from paper and set on a lemon ground; cream paper cards carry the facts. The joy is colour with a job: lemon is the ground, cobalt is the action, tomato marks the word "eat" and warnings, olive is Good-side. The system refuses the category default of a white photo card with a star score, and the sober paper-menu look it replaces.

Cards are cream paper lifted off the ground by one soft shadow, with large radii. A Restaurant is still a line: name, dotted leader, Verdict. Recognisable with content removed: a lemon page, a tomato blob and cobalt disc bleeding off the edges, cream rounded cards, a chunky rounded face.

**Key Characteristics:**
- Lemon ground (#FFD23F) with cream cards (#FFF8E7); ink (#14110F) for all text.
- Cobalt (#1F3FBF) is the action and link colour; coral and olive appear as cut shapes and as Avoid/Good-side signals.
- Chunky single-weight display face for the wordmark, headlines, Restaurant names and Verdicts; plain sans for reading.
- Round cut-paper discs, a leaf and organic blobs; pill controls with 44px minimum touch height.
- Dotted leaders join name to Verdict; the leader draws in coral on hover, focus and touch press.
- Dark theme is a deep cobalt-ink night with a lemon action; structure unchanged.

## Colors

A lemon page, cream paper, near-black warm ink, one cobalt for action, tomato and olive as food-shaped accents, and a Tier family that always carries a label and pips.

### Primary
- **Cobalt** (#1F3FBF, `brand`/`accent`): Book and `.btn` fill, links, pressed chip and shortlist state, pressed-row name, `.skip-link`, the cut disc on the landing. Dark twin is **Lemon** (#FFD23F) with `on-brand` #14110F.
- **Cobalt Wash** (#DDE4FA, `accent-soft`): banners, Sent notice, diet badge, hover on secondary controls, checked filter options, "N chosen" count. Dark #2B3478.

### Secondary
- **Tomato** (#D63A26, `coral`, `on-coral` #FFFFFF): the tilted blob behind "eat" in the landing headline, the step-2 disc, the tomato cut disc, the leader's drawn state. Dark #FF8A75 with ink text.
- **Olive** (#5E8A1E, `olive`): the cut leaf on the landing only. Dark #A8D45A.
- **Avoid Red** (#B72A17, `flag`/`tier-avoid`): Avoid Tier, Flag cards, negative themes and bars, errors; fill **Red Wash** #FBDDD6. Dark #FF8A75 on #4A1E1E (flag fill #44201C).
- **Highlighter** (#FFD23F, `sun`): the flat inset band under the one main reason and under the sample reason; lemon on cream. Dark #6A5710.
- **Amber** (`warn` #7A5200 on #FFEFB8): minor flags, provisional and personal-source tints, change-point marks. Dark #FFD23F on #3F3508.

### Tier family
Avoid #B72A17, OK #55506B, Good #4A7216 (olive-leaning), Must-go #14603A, Life-changing #F2A900. Fills #FBDDD6, #E6E3EE, #E1EBC9, #CFE6D6, #FFE9A8. A Tier capsule is solid Tier colour with white text and pips (`on-t` #FFFFFF); Life-changing is the exception, with ink text on amber. Dark: #FF8A75, #B9BEDD, #A8D45A, #6FD39A, #FFD23F on fills #4A1E1E, #262C60, #26391A, #153D2A, #4A3A08 with ink text.

### Neutral
- **Lemon Ground** (#FFD23F): page background; scrollbar and `themeColor` match. **Cream Paper** (#FFF8E7): cards, rows, hero, sheet, inputs. **Sunk** (#F6E6B4): wells, chips, row hover, course headers. **Band** (#EBD9A0): rails, meters, skeleton blocks.
- **Warm Ink** (#14110F): all text and the focus ring. **Muted** (#4D4108), **Faint** (#594C10): secondary text; **Line** (#E2C766) hairlines; **Edge** (#7A6416) dotted rules and control borders.
- Dark neutrals: ground #0E1233, surface #1A2050, sunk #141A45, ink #FFF3D1, muted #CDD0EE, faint #ADB1DA, line #2E3672, edge #808ACB, band #2B3470. Dark applies by `prefers-color-scheme` or `data-theme="dark"`.

### Named steps
- **Scrim:** rgba(10,14,36,.55) behind the filter sheet.
- **Logo disc:** #FFF8E7 behind the 36px round logo in the top bar.
- **Status tints:** Confidence High and Trend Improving use the Good fill; Medium and provisional the warn fill; Low and Slipping the Avoid fill; Steady the OK fill.

### Named Rules
**The Colour-With-A-Job Rule.** Lemon is the ground, cobalt is the action, tomato marks "eat", warnings and the leader, olive is Good-side. A cut shape is decoration only when it sits in the page gutter or behind a figure, never under text.

**The Never-Hue-Alone Rule.** Tier is carried by label plus pip count (1 to 5 round pips) plus fill. Confidence is dots plus its word. Trend is an arrow plus its word.

**The Dashed Means Unsure Rule.** A dashed outline on a Tier or status atom means a provisional Tier or Not enough evidence, and the disabled shortlist button. Nothing else uses a dashed border on such atoms.

**The NEE Is A State Rule.** Not enough evidence is a state, not a Tier: no pips, no Tier colour, a dashed faint pill (`.nee`, `.nee-chip`, the dashed filter option). Never ranked or coloured like a Tier.

**The Provisional Stays Tinted Rule.** A provisional Tier (`.tier.dashed`) keeps the tinted fill with ink text and ink pips and a dashed rule; only a confirmed Tier is solid.

## Typography

**Display Font:** Bagel Fat One (via next/font, one weight, 400; fallback Figtree then system sans)
**Body Font:** Figtree (via next/font, weights as shipped, system sans fallback)
**Ledger Font:** Courier Prime (400, 700), for ledger data only: percentile values, axis ticks, counts, language tags

**Character:** Bagel Fat One is chunky, rounded and cut-paper friendly, a food-label voice for names and Verdicts. Figtree is a friendly plain reader. Courier Prime is the till receipt, only where figures must align. The display face has a single weight, so `font-weight` on display text is inert (`font-synthesis:none`); hierarchy comes from size.

### Hierarchy
- **Display** (400, clamp(44px, 13.4vw, 76px), 0.98, max 11ch): landing headline only; "eat" sits on a tomato blob tilted -3deg.
- **Headline** (400, clamp(32px, 8vw, 48px), 1.05): restaurant name on the Report hero.
- **Directory title** (400, clamp(26px, 6vw, 34px)): Directory heading, state-page title, Compare title clamp 30 to 44; 24px at 520px and below.
- **Line name** (400, 22px, 1.15; 21px at 520px and below): Restaurant name in a Directory line; Compare and sample names clamp 22 to 26px.
- **Hero Tier** (clamp(23px, 6.2vw, 38px)): the large Verdict on the Report hero; `.tier.lg` elsewhere 26px; Tier in a list is display face at body size, 15px on phone rows.
- **Page title** (28px): sign-in, settings, baseline checks, feedback inbox; privacy and account clamp 28 to 42.
- **Section title** (24px): Report section headings; owner-tool sub-headings 19px.
- **Title** (17 to 22px, display face): filter group summaries 17px, source-card names 18px, sheet title 22px, "How we judged this" section heading 24px.
- **Lede** (Figtree 400, clamp(17px, 2.2vw, 20px), 1.5): landing intro. **Reason** (Figtree 600, clamp(20px, 5vw, 24px), 1.35, max 62ch): the Report's main reason; a Directory line reason is 500 at 16.5px.
- **Body** (400, 16px, 1.5). **Label** (600 to 800, 14px): chips, row labels, meta lines, field labels. **Caption** (12px): footnotes, tooltips, axis, language tags; 12px is the floor.
- **Ledger** (Courier Prime, 12 to 13.5px, tabular): percentile values, axis ticks, counts, language tags.

### Named Rules
**The Ledger Only Rule.** Courier Prime appears only on figures that must align. Never on names, headings, labels or running copy.

**The One Face Per Job Rule.** Bagel Fat One is for the wordmark, headlines, Restaurant names, Verdicts and button labels that name an action on the landing and state pages; Figtree carries all reading and UI chrome.

**The Verdict Vocabulary Rule.** Copy never calls a Verdict a "score", "rating" or "grade". Say Verdict, Tier, Confidence.

## Layout

Single centred column. `.wrap` max 720px; the landing widens to 960px; the Directory (and its skeleton and top bar) to 1120px. Body gutters 16px; bottom padding 32px plus safe-area inset, growing to 96px (112px at 520px and below) while the shortlist dock exists. Spacing scale 4 / 8 / 12 / 16 / 24 / 32 / 48.

Landing on a phone: headline, framed illustration, short intro, full-width Sign in, then the tilted fictional sample card; the tier menu and three steps follow. From 900px the copy and illustration sit side by side (1.05fr / .95fr). Directory: below 1000px one column of search, a Filters button, scrollable quick chips, removable active filters, then the ementa; from 1000px a 268px sticky filter panel sits left. Filter groups are `details.dir-group` in the order Neighbourhood, Price, Dietary fit, Kind of place, Tier, open on desktop and folded in the sheet. Compare: one aligned table at every width; phones show two Restaurants with a sticky fact column and sideways access to a third. Report: back link and shortlist button share a row; name, address, Verdict, Confidence and reason come first, then Open in Google Maps and "Read the Evidence". The page keeps its state in the URL.

Cut-paper discs bleed off the page edge on every signed-in page (a tomato disc at right, a cobalt disc at left, fixed, behind content); only the gutter sliver shows.

## Elevation & Depth

Cut paper lying on paper. Depth is a soft lift under cream cards plus tone changes (Sunk wells inside cards); there is no hover elevation.

### Shadow Vocabulary
- **Paper lift** (`box-shadow: 0 2px 0 rgba(20,17,15,.05), 0 16px 28px -18px rgba(60,40,0,.55)`; dark `0 2px 0 rgba(0,0,0,.25), 0 16px 28px -16px rgba(0,0,0,.7)`): ementa, Report hero, sample card, Compare cards, source cards, quotes, forms, sections, state pages.
- **Button lift** (`0 8px 16px -8px rgba(20,17,15,.5)`; dark `.7`): Book and `.btn`; removed from `.book.sm` in Directory lines.
- **Sheet and dock lift** (`0 -12px 32px -12px` / `0 -14px 28px -14px`, ink at .55): filter sheet and shortlist dock rising from the bottom edge.
- **Highlight band** (`box-shadow: inset 0 -.5em 0 var(--sun)`): a flat marker stroke under the main reason, cloned across line breaks. An inset band, not a gradient or drop shadow.

### Named Rules
**The Lift Does Not Move Rule.** No extra elevation on hover; hover changes tone (Sunk row, Cobalt Wash) or draws the leader.

## Shapes

Cut paper: soft, large and round. Cards, rows, flags and source cards 22px (`--r-card`); the Report hero, filter sheet, shortlist dock and desktop filter panel 28px (`--r-lobe`); inputs, small wells and invite rows 10px; every control, chip, pip, Tier and badge a full pill or circle (999px / 50%). Organic blob radii (`--blob-a`, `--blob-b`) shape the word "eat" and the illustration. Cut shapes: cobalt disc (92px), tomato disc (66px), olive leaf (72x34px, corners 0 100% 0 100%, tilted -14deg). The sample card tilts -1.2deg, the illustration -1.5deg, "eat" -3deg; nothing else tilts.

Dividers: dotted `edge` between sections and in the tier menu, 2px dotted `line` between Directory rows. Flags: 2px Avoid Red border, all round, no side stripe. The sign-in pill has a 3px ink border.

Pips are 9px (14px large, 12px in the hero at 480px and below, 8px on phone rows); Confidence dots 8px (7px in rows).

## Components

### Tier (`.tier`, `.tier.lg`, `.tier.dashed`)
Pill in the display face: solid Tier colour, white label and white pips (five round pips, filled up to the Tier, hollow after; ink text on Life-changing amber). `.lg` is 26px (clamp 23 to 38px in the hero). Provisional: tinted fill, ink text and ink pips, dashed 2px border. Phones shrink the row Tier to 15px with 8px pips.

### Not enough evidence (`.nee`, `.nee-chip`)
A state: 2px dashed `faint` border, ink display text on cream, pill, no pips. In rows a compact transparent dashed chip (display 15px).

### Confidence, Trend, chips
Chips are pills on Sunk. Confidence: dots filled to level plus the word, tinted High olive-wash, Medium amber, Low red. Trend: arrow plus word on green, slate or red tint. In Directory rows chips drop their fill and read as muted text, keeping the dots.

### Book (`.book`) and Buttons
- **Book:** cobalt pill, white text, display face 18px, min-height 52px, padding 0 26px, button lift; hover mixes 14% black into cobalt. Full width on phones. `.book.sm`: 44px, Figtree 800 15px. In Directory lines it is a plain cobalt underlined link (hidden at 520px and below); in Compare cards a cream pill with a cobalt border; on the Report a secondary underlined link when Booking is not the lead.
- **`.btn`:** same pill, 44px, Figtree 800 (display face on the landing CTA and state pages). **Secondary:** cream fill, cobalt text, 2px cobalt border. **Danger:** Red Wash fill, ink text, 2px Avoid Red border.
- **Sign in (landing):** cream pill, ink text, 3px ink border, one-line label; hover Sunk. Compact header spacing and a smaller logo at 360px and below keep the control in view.
- **Focus:** 3px ink outline (lemon-cream #FFE27A in dark), 3px offset. **Disabled:** Sunk fill, muted text, line border, not-allowed.

### Directory ementa (signature)
`ul.ementa`: cream, 22px radius, paper lift, clipped. Optional `li.ementa-course` headers (display 18px on Sunk with a dotted rule on desktop; hidden on phones). Each `.dir-row` is a ledger line with a dotted `line` rule between rows: name (display 22px) | dotted leader | Tier, then the one-line reason, a muted meta line (Kind, Price, Area), then a foot of Confidence, dietary marks, shortlist button and, on desktop, the Book link. Trend is not shown on rows. The whole row is clickable through the name link's stretched overlay; hover or focus-within tints the row Sunk and turns the name cobalt. The Tier guide follows the results, so a phone shows a Verdict sooner.

**The leader** is a 2px dotted `edge` line from name to Verdict. On row hover, focus-within and touch press a 3px dotted tomato line is revealed left to right (`clip-path`, 200ms ease-out). Under `prefers-reduced-motion` transitions collapse and the tomato leader appears at once. Keyboard focus shows a 3px inset outline on the row. This is the one authored motion moment.

### Shortlist and dock
`.shortlist-btn`: icon-only on Directory rows, a 28px drawn plus/check disc inside a 44px target. The Report keeps the labelled 44px pill. Pressed has a cobalt disc and white check (`aria-pressed`); at three, an unselected button remains focusable with a dashed disc and an explanation. Up to 3 slugs and their display names live in `sessionStorage`, cleared on sign-out. `.shortlist-dock`: fixed cream bar with 28px top corners, named chips with individual 44px remove buttons, count/status and a "Compare N" pill; hides on `/compare` and on the public landing.

### Compare (`/compare`)
`.compare-scroll` contains one `.compare-table`: Restaurant names head aligned fact rows (Verdict, reason, Format, Price, Neighbourhood, optional Trend, Known for and Dietary fit, then up to three praised and criticised Review themes with reviewer counts). The More row puts each Restaurant's booking link, Read the Verdict and Remove just after the Verdict and reason, within the first phone screen. Phone columns scroll sideways with a sticky fact column and a swipe hint for three Restaurants. Tier pills use neutral ink outlines and retain their five pips above the label on phones; a note explains when different Formats mean the Tiers do not compare directly. It never ranks or highlights a winner; missing evidence is named plainly.

### Directory controls and filter sheet
Quick chips: 44px pills, 2px `edge` border on cream, 15px 600; pressed is solid cobalt with a white check. Sort is a pill select. Filter options are pills (2px `edge`), checked Cobalt Wash with a cobalt border; "Not enough evidence" is dashed. At 1000px and up options are plain 36px rows in a sticky cream panel. Below 1000px the filters open as a modal bottom sheet: cream, 28px top corners, max-height 86vh, sticky header with a dotted rule, over the scrim. Empty state: cream card, 2px dashed `edge`.

### Report
**Hero:** cream, 28px radius, paper lift, 24px padding: name, address, Verdict, Confidence, the highlighted reason, then `.report-actions` (Open in Google Maps, "Read the Evidence" jump). Forced Avoid, Not enough evidence and No Verdict yet keep booking secondary: an underlined 44px link without a shadow or full-width fill.
**Sections:** dotted-top sections with 24px display headings. Quotes and Sources follow the highlights; "How we judged this" remains open after the Evidence.
**Flags:** Red-ruled card with a round 28px icon badge; minor flags use the amber pair.
**Quotes:** cream card with paper lift; negative quotes take an inset 2px Avoid Red ring.
**Scorecard and strips:** five-segment meters (olive at 4-5, slate at 3, amber at 2, red at 1), 4px rails with a dot, Courier Prime values.
**Source cards:** one card per Source: display-face name over a dotted rule, `<dl>` labels and values, a native disclosure for processing details.

**Standing chart:** three cut-paper strips (Higher, Middle, Lower, each labelled in words), a 5px cobalt line with round caps, cream disc dots with a cobalt ring (solid for the latest quarter, hollow for few reviews), a tomato pill marks a Change point. It scales to the column and never sets the page width.
**Critical quote:** a solid tomato paper card with on-coral text and a "Criticism" pill; never an outline.

**Praising quote:** a solid deep-green paper card (#14603A light, #1F6B45 dark) with cream text and an explicit "Praise" pill, so its meaning never depends on colour.

### Landing
Wordmark and Sign in pill; headline with "eat" on a tomato blob; the framed illustration `public/lisbon-table.png` (a cut-out plate of grilled sardines) in a blob-shaped mask with the cobalt disc, tomato disc and olive leaf behind it, captioned "Original illustration. It does not show any listed Restaurant."; a short intro comparing cafés with cafés at every width, explicitly naming Not enough evidence, and a full-width cobalt sign-in action; the tier menu; three numbered steps (cobalt, tomato, olive discs); the tilted fictional Casa Imaginária sample with a Good Tier, a highlighted reason and a content-width Medium Confidence chip. Its fiction label comes first inside the card; tasca is explained as a traditional Portuguese restaurant.

### Inputs / Fields
44px minimum height, 2px `edge` border, cream fill, 10px radius (search input 22px, 48px tall), 16px text. Focus: 3px ink outline, 2px offset.

### Page skeletons and state pages
Band blocks pulsing to 55% over 1.4s (removed under reduced motion), shaped like what they replace. State pages (error, not found): cream card, paper lift, max 520px, 48px top margin, display heading, pill actions.

### Navigation
Brand (36px round logo on a cream disc, display wordmark 22px) and ink 800 links on the lemon ground, 44px tap height, no rule. The feedback widget panel is cream with a 2px ink border. Tagline "Lisboa · Invitation-only beta" hides at 480px and below.

### Icons and images
Drawn SVG icons from `src/web/icons.tsx` and `atoms.tsx`: 24px viewBox, 2.25 stroke, round caps, `currentColor`, `aria-hidden`, always beside words. Stars describe a Review, never the Verdict. Rasters: `public/logo-mark.png` (the original G-and-dot mark, kept) and `public/lisbon-table.png` (1536x1024, transparent cut-out, supplied by the owner 2026-10-02, rights owner-confirmed 2026-10-02, creation tool not recorded). The illustration is landing-only and never implies a listed Restaurant.

## Do's and Don'ts

### Do:
- **Do** give every Tier, Confidence or status atom a shape cue (pips, dots, arrow, dashed outline) and a word.
- **Do** use cream cards with the paper lift on the lemon ground; keep shapes round (22px cards, 28px hero, pills for controls).
- **Do** join a name to its Verdict with the dotted leader; draw it in tomato on hover, focus and touch press in 200ms ease-out, and drop the animation under `prefers-reduced-motion`.
- **Do** keep Not enough evidence a dashed state with no pips and no Tier colour.
- **Do** use Courier Prime for ledger figures only; use Bagel Fat One for names, Verdicts and headlines only.
- **Do** use the highlighter inset band for the one main reason on a screen.
- **Do** keep cut shapes in gutters or behind figures, never under text.
- **Do** make every tap target at least 44px tall; keep Book full width on phones; keep text at 12px or above.

### Don't:
- **Don't** show a star, numeric score or score pill as the Verdict, and don't call a Verdict a score, rating or grade.
- **Don't** signal Tier or Confidence by hue alone.
- **Don't** use a dashed outline on a Tier or status atom except for a provisional Tier or Not enough evidence.
- **Don't** treat Not enough evidence as a Tier.
- **Don't** add a coloured side stripe to cards or flags; frame them all round.
- **Don't** rank or highlight a winner in Compare.
- **Don't** use photographs or imagery that implies a listed Restaurant.
- **Don't** put a kicker, eyebrow or uppercase caption above headings.

## Scope and known gaps

Beta surfaces on this system: landing, privacy, Directory, Compare, Report, history, search-home, settings (including invites), sign-in, account, feedback widget and inbox, baseline checks, owner questions, and the loading, error and not-found states. The paginated Restaurant inventory is Owner-only. Portuguese UI is out of scope.

Drift in the build, recorded but not canonized: single-weight Bagel Fat One still carries inert `font-weight` 700/800 declarations; some rules are declared twice (box-shadow on `.state-page`); several CSS comments still say "blue double rule" though no double rule ships; `--blob-a`/`--blob-b` are the only organic radii and `--coral` doubles as the leader colour. These are cleanup items, not rules.
