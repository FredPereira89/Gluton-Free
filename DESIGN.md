---
name: Gluton-Free
description: A Lisbon Restaurant Verdict guide set as an ementa, the paper menu of a tasca, printed in one blue ink on table-paper white.
colors:
  ground: "#F5EFE0"
  surface: "#FFF9EA"
  sunk: "#ECE4CE"
  ink: "#141B3A"
  muted: "#424968"
  faint: "#525877"
  line: "#D6CDB6"
  edge: "#6F7592"
  band: "#E4DBC3"
  brand: "#1C3D9B"
  on-brand: "#FFFFFF"
  accent: "#1C3D9B"
  accent-soft: "#E7ECF9"
  focus: "#1C3D9B"
  coral: "#D9402B"
  sun: "#FFE27A"
  tier-avoid: "#B5301D"
  tier-avoid-fill: "#FCE6E1"
  tier-ok: "#4D5578"
  tier-ok-fill: "#E9EBF3"
  tier-good: "#1F6F43"
  tier-good-fill: "#DEF0E5"
  tier-must-go: "#14502F"
  tier-must-go-fill: "#C5E4D1"
  tier-life-changing: "#8A5200"
  tier-life-changing-fill: "#FFEAB3"
  flag: "#B5301D"
  flag-fill: "#FCE6E1"
  warn: "#7A5200"
  warn-fill: "#FFF0C4"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(46px, 13.4vw, 76px)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Bricolage Grotesque, Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(32px, 8.4vw, 46px)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.025em"
  directory-title:
    fontFamily: "Bricolage Grotesque, Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(26px, 6vw, 34px)"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.02em"
  ementa-name:
    fontFamily: "Bricolage Grotesque, Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(20px, 5.2vw, 24px)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  hero-tier:
    fontFamily: "Bricolage Grotesque, Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(23px, 6.2vw, 38px)"
    fontWeight: 700
    lineHeight: 1.12
  page-title:
    fontFamily: "Bricolage Grotesque, Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  section-title:
    fontFamily: "Bricolage Grotesque, Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Bricolage Grotesque, Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.12
  lede:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
  caption:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
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
  sm: "4px"
  card: "6px"
  lobe: "6px"
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
    backgroundColor: "{colors.tier-ok-fill}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 14px"
  tier-lg:
    backgroundColor: "{colors.tier-good}"
    textColor: "{colors.on-brand}"
    typography: "{typography.hero-tier}"
    rounded: "{rounded.pill}"
    padding: "8px 22px"
  tier-lg-dashed:
    backgroundColor: "{colors.tier-ok-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 22px"
  nee:
    textColor: "{colors.muted}"
    rounded: "{rounded.card}"
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
  dir-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  dir-chip-pressed:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink}"
  ementa:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  report-hero:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lobe}"
    padding: "24px"
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

Recorded from the shipped build of issue #121, round 2 ("Ementa do Dia", seed 268cf2c0), from `src/app/globals.css`, `layout.tsx`, `page.tsx`, `directory.tsx`, `directory-controls.tsx` and `r/[slug]/page.tsx`. It replaces the round-1 "Guide Map Lobes" system. Where the build and the direction contract differ, the build is recorded and the difference is noted.

## Overview

**Creative North Star: "Ementa do Dia"**

The guide is an ementa, the paper menu of a Lisbon tasca, printed in one colour of blue ink on table-paper white. A Restaurant is a line: name, dotted leader, Verdict. The leader carries the eye from a name to its call, so a diner compares tables by reading down one edge. The system refuses the category default of a photo card with a star score.

Surfaces are flat paper framed by blue double rules; the page is quiet, the Verdict is the loudest thing on it. Recognisable with content removed: a blue double rule on paper, dotted leaders, round pips. There are no gradients in surfaces and no photographs; one soft paper lift is the only shadow.

**Key Characteristics:**
- One ink: blue carries brand, links, actions, rules and focus. Tomato appears only on the stamp and red flags; menu green only on Good-side Tiers and positives.
- Logo mark: a solid blue "G" whose counter holds a menu: two rules and a dotted Verdict row ending in one pip, drawn in Ementa Blue. The header keeps the transparent mark on its cream tile; app icons use the same mark on Table-paper white. The wordmark remains live text.
- Double-rule frames (2px rule plus a second 2px rule 3px outside) mark the ementa, the Report hero, the sample report, state pages and the filter sheet.
- Dotted rules (2px, `edge`) divide sections and join name to Verdict.
- Round pips and dots carry meaning (Tier 1-5, Confidence 1-3) alongside words.
- Capsule controls, 44px minimum touch height.
- Light and dark themes share one structure; only values change.

## Colors

Table-paper white and blue-black ink, one saturated blue for everything interactive, a green-to-amber Tier family, and tomato held back for the stamp and flags.

### Primary
- **Ementa Blue** (#1C3D9B): the one ink. Book and `.btn` fill, links, double-rule frames, focus ring, selection, the leader's drawn state, the landing headline. Dark twin #8FA9FF (accent #A6BAFF, focus #C9D5FF), with `on-brand` #0B1030.
- **Blue Wash** (#E7ECF9): `accent-soft`. Pressed chips, checked options, banner, welcome card, diet badge tint. Dark #1F274A.

### Secondary
- **Tomato** (#B5301D, token `flag`/`tier-avoid`): the "Not a real Verdict" stamp border and text, Flag cards, Avoid Tier, negative themes and bars, errors. Fill **Tomato Wash** #FCE6E1. Dark #FF9C8A on #3A1F1B.
- **Menu Green** (#1F6F43, `tier-good`): Good Tier, positive themes, High Confidence tint. Must-go #14502F, fills #DEF0E5 and #C5E4D1.
- **Highlighter** (#FFE27A, `sun`): the flat inset band under the main reason and the sample reason. Dark #6A5710.
- **Amber** (`tier-life-changing` #8A5200 on #FFEAB3; `warn` #7A5200 on #FFF0C4): Life-changing Tier, minor flags, provisional and personal-source tints, change-point marks.

Note: `--coral` #D9402B is declared in the build but no rule uses it; the tomato actually shipped is #B5301D. Treat #D9402B as unused.

### Neutral
- **Table Paper** (#F5EFE0): page ground. **Card Cream** (#FFF9EA): ementa, hero, cards, sheet. **Sunk** (#ECE4CE): wells, chips, hover row. **Band** (#E4DBC3): rails, meters, skeleton blocks.
- **Blue-Black Ink** (#141B3A): all text on fills; **Muted** (#424968), **Faint** (#525877); **Line** (#D6CDB6) hairlines; **Edge** (#6F7592) dotted rules, input and chip borders.
- **OK Slate** (`tier-ok` #4D5578 on #E9EBF3): OK Tier, Steady trend, and the family's neutral.

### Named steps
- **Dark twin:** every light token has a dark twin on the same role (ground #0F1220, surface #171B30, sunk #131728, ink #EEF0F8, muted #B0B6CF, faint #9298B4, line #2D3454, edge #6C7396, band #2A3050; Tier colours #FF9C8A / #B7BDD6 / #7FD1A0 / #A5E8BF / #FFD25A on #3D1E1A / #262B42 / #16301F / #1E4630 / #4A3A0A; warn #F2C94C on #3A3010). Dark applies by `prefers-color-scheme` or `data-theme="dark"`.
- **Scrim:** rgba(10,14,36,.55) behind the filter sheet.
- **Logo tile:** #F5F1E4 behind the 32px logo in both themes.
- **Status tints:** Confidence High and Trend Improving use the Good fill; Medium and provisional use the warn fill; Low and Slipping the Avoid fill; Steady the OK fill.

### Named Rules
**The One Ink Rule.** Blue is the only interactive and brand colour. Tomato is for the stamp and red flags, green for Good-side Tiers; neither is used as decoration.

**The Never-Hue-Alone Rule.** Tier is carried by label plus pip count (1 to 5 filled round pips) plus fill. Confidence is carried by dot count (1 to 3) plus its word. Trend is carried by arrow plus word. Colour never stands alone.

**The Dashed Means Unsure Rule.** A dashed outline on a Tier or status atom means a provisional Tier or Not enough evidence. Nothing else uses a dashed border there.

**The NEE Is A State Rule.** Not enough evidence is a state, not a Tier: no pips, no Tier colour, a dashed muted frame at card radius (`.nee`, `.nee-chip`, the dashed "Not enough evidence" filter option). It is never ranked or coloured like a Tier.

**The Ink-On-Fill Rule.** In lists and chips, text on a tinted Tier fill is ink; Tier colours are borders and pips. The one exception is the Report's large Verdict (`.tier.lg`), which is solid Tier colour with paper-colour text (`on-t`). A provisional large Verdict stays tinted with ink text and a dashed rule.

## Typography

**Display Font:** Bricolage Grotesque (via next/font, 800 and 700, fallback Schibsted Grotesk then system sans)
**Body Font:** Schibsted Grotesk (via next/font, system sans fallback)
**Ledger Font:** Courier Prime (400, 700), for ledger data only: price, counts, dates, percentiles, axis ticks, language tags, Evidence figures

**Character:** Bricolage is heavy and slightly quirky for names, Verdicts and headings; Schibsted reads plainly; Courier Prime is the till receipt, used only where a figure must align. Fraunces italic is the printed voice: the masthead, Tier course headings, Verdict reasons and the sample Restaurant kind, never UI chrome, numbers or body copy.

### Hierarchy
- **Display** (800, clamp(46px, 13.4vw, 76px), 0.95, -0.035em, `brand` colour, max 13ch): landing headline only.
- **Headline** (800, clamp(32px, 8.4vw, 46px), 1.02, -0.025em): restaurant name on the Report hero.
- **Directory title** (800, clamp(26px, 6vw, 34px), -0.02em): Directory heading and state-page title; privacy and account titles run clamp 28 to 38 and 30 to 42 at 800.
- **Ementa name** (700, clamp(20px, 5.2vw, 24px), 1.15, -0.01em): a Restaurant's line in the Directory; the sample line runs 800 at clamp(20px, 5.2vw, 26px).
- **Hero Tier** (700, clamp(23px, 6.2vw, 38px)): the large Verdict on the Report hero; `.tier.lg` elsewhere is 26px; the Tier in a list is 700 at body size.
- **Page title** (800, 28px, -0.03em): sign-in, settings, baseline checks, feedback inbox.
- **Section title** (800, 22px, -0.01em): Report section headings, group heads.
- **Title** (700, 17px to 19px, display face): sheet group legends, "How we judged this" summary, source-card name 18px.
- **Lede** (400, 17px, 1.5): intro, sample reason, search input; the Report reason is 600 at clamp(19px, 5vw, 22px), max 62ch.
- **Body** (400, 16px, 1.5): running text, inputs.
- **Label** (600 to 700, 14px): chips, row labels (muted), meta lines, field labels, table headers 13px.
- **Caption** (400, 12px): footnotes, tooltips, axis, language tags. 12px is the floor.
- **Ledger** (Courier Prime, 12 to 13.5px, tabular): percentile values, axis ticks, counts, source figures.

Odd values (12.5px, 13.5px, 14.5px, 15px, 21px) are one-off refinements around these steps; do not add more.

### Named Rules
**The Ledger Only Rule.** Courier Prime appears only on figures that must align: price, counts, dates, percentiles, Evidence numbers. Never on names, headings, labels or running copy.

**The Step-Not-Size Rule.** New text takes a named step above. A new literal size needs a reason and a place in this list.

**The Verdict Vocabulary Rule.** Copy never calls a Verdict a "score", "rating" or "grade". Say Verdict, Tier, Confidence.

## Layout

Single centred column. `.wrap` max 720px; the landing widens to 960px; the Directory (and its wide skeleton, and the top bar above it) to 1120px. Body padding 16px at the sides. Spacing scale 4 / 8 / 12 / 16 / 24 / 32 / 48.

Report: hero card, then sections separated by a 2px dotted `edge` rule with 24px vertical padding. First viewport at 390px: name and area, large Verdict capsule with pips and Confidence, the main reason (highlighted), a full-width Book button (52px); from 560px Book fits its content. Landing: wordmark and Sign in, the blue headline, intro, double-rule sample card, full-width sign-in button; at 900px the copy and example sit side by side (1.05fr / .95fr) with the actions under the copy.

Directory: below 1000px it is one column: a search and one horizontally scrolling row of quick chips (fading at the right edge) plus a "Filters" chip pushed right, a capsule sort select, then the ementa. At 1000px and up a 268px sticky filter panel sits left of the ementa. Each row is a ledger line (see Components); at 1000px and up the facts and Book move to a right column. While the list refetches (`aria-busy` on the controls) the ementa dims to 55%.

Top bar: Brand at left, a "Provisional · Lisboa" tagline (hidden at 480px and under), feedback and Settings or "Your data" at right, over a 1px dotted `edge` rule; hidden on sign-in, invite and welcome pages. The page keeps its state in the URL.

## Elevation & Depth

Flat paper. Depth is a rule and a tone: cream cards on Table Paper, Sunk wells inside cards, double rules to frame the important things. One soft paper lift exists for secondary cards.

### Shadow Vocabulary
- **Paper lift** (`box-shadow: 0 1px 0 rgba(70,50,15,.10), 0 10px 24px -14px rgba(50,35,10,.38)`; dark `0 1px 0 rgba(0,0,0,.4), 0 6px 18px -10px rgba(0,0,0,.6)`): account, settings and index cards, the landing sample card, state pages, the feedback panel. The ementa, Report hero and filter sheet use the double rule instead and carry no shadow.
- **Highlight band** (`box-shadow: inset 0 -.42em 0 var(--sun)`): a flat marker stroke under the main reason; `inset 0 -.2em 0 var(--flag-bg)` under "eat" in the landing headline. Cloned across line breaks. An inset band, not a gradient and not a drop shadow.

### Named Rules
**The Paper Lift Only Rule.** One shadow token. No extra elevation on hover; hover changes tone (Sunk row) or draws the leader.

## Shapes

Printed and squared-off: a menu card, not a lobe. Cards, rows, flags and source cards 6px; small wells, inputs, language tags 4px; every control, chip, pip and badge a full capsule or circle (999px / 50%). Exceptions: the filter sheet's top corners 14px, the logo tile 8px, the preview panel 10px, tooltips 5px, meter segments and bars 4px, rails 2 to 3px.

Frames: the **double rule** is `border:2px solid brand` plus `outline:2px solid brand; outline-offset:3px` with 5px margin so the outer rule is not clipped. Dividers: 2px dotted `edge`. Quiet cards: 1px `line`. Flags: 2px Tomato, all round, no side stripe. The stamp is a 88px circle with a 3px double Tomato border, rotated -12deg, uppercase Bricolage 12px 800 with .04em tracking.

Pips are 9px (default), 14px (large; 12px at 480px and under in the hero), 8px on phone rows; Confidence dots 8px (7px in rows).

## Components

### Tier (`.tier`, `.tier.lg`, `.tier.dashed`)
Capsule: 2px Tier-colour border, Tier fill, ink text in Bricolage 700, then five round pips (filled up to the Tier, hollow after) and the label. `.lg` (26px; clamp 23 to 38px in the Report hero) is solid Tier colour with paper-colour text and paper-colour pips. Provisional: dashed border; a provisional `.lg` stays tinted with ink text and Tier-colour pips. Phones shrink the row Tier to 15px with 8px pips. No hover transform.

### Not enough evidence (`.nee`, `.nee-chip`)
A state, not a Tier: 2px dashed `faint` border, muted display text, 6px radius, no pips. In rows it is a compact dashed chip (display 15px).

### Confidence, Trend, chips
Chips are capsules on Sunk. Confidence: three round dots filled to level plus the word, tinted High green, Medium amber, Low tomato. Trend: arrow plus Improving / Steady / Slipping on green, slate or tomato tint. In Directory rows chips drop their fill and read as plain muted text, keeping the dots. Theme chips add a 1.5px green or tomato border. Account and invite chips take a 2px `line` border on white.

### Book (`.book`) and Buttons
- **Shape:** full capsule (999px), 2px border in the fill colour.
- **Book:** Ementa Blue fill, white text, Bricolage 700 17px, min-height 52px, padding 0 26px; hover mixes 14% black into blue. Full width on phones. `.book.sm`: 44px, 15px. In Directory rows `.book.sm` is a text link: no fill, blue underlined, Schibsted 700, hover Blue Wash.
- **`.btn`:** same capsule, 44px, 700. **Secondary:** white fill, blue text, 2px blue border, hover Blue Wash. **Danger:** Tomato Wash fill, ink text, 2px Tomato border.
- **Focus:** 3px blue (`focus`) outline, 3px offset. **Disabled:** Sunk fill, muted text, line border, full opacity, not-allowed.

### Directory ementa (signature)
`ul.ementa`: cream, double-rule frame, 6px radius. Each `.dir-row` is a ledger line, 1px `line` between rows, 16px padding. Top line is a grid: name (Bricolage 700) | dotted leader | Tier. Under it a muted 14px meta line (Format, Price, Area), then a foot: Confidence, Trend, dietary icons, and the Book link. The whole row is clickable through the name link's stretched overlay; the Book link sits above it. Hover or focus-within tints the row Sunk and draws the leader.

**The leader** is a 2px dotted `edge` line from name to Verdict. On row hover or focus-within a second 2px dotted blue line is revealed left to right (`clip-path`, 200ms ease-out). Under `prefers-reduced-motion` all transitions collapse and the blue leader appears at once. Keyboard focus shows a 3px inset outline on the row.

### Directory controls and filter sheet
Quick chips: capsules, 44px, 2px `edge` border on white, 15px 600; pressed is Blue Wash with a blue border. Sort is a capsule select. Options in groups are capsules (2px `edge`), checked state Blue Wash; "Not enough evidence" option is dashed. At 1000px and up options become plain 36px rows inside a sticky white panel with a 1px line border. Below 1000px the full filters open as a modal bottom sheet: fixed to the bottom, white, 14px top radius, 2px blue border (none at bottom), max height 86vh, scrolling, safe-area padding, sticky header with a 2px dotted rule and Bricolage 22px title, over a scrim beneath. Empty state: white card, 2px dashed `edge`.

### Report
**Hero:** white, double-rule frame, 6px radius, 24px padding: name (Headline), muted area line, a row with the large Verdict and Confidence, the reason in Lede 600 with the highlighter band on the main phrase, an optional muted summary and theme chips, then Book. NEE heroes show the `.nee` state and the reason line instead of a Verdict.
**Sections:** dotted-rule-topped, 22px Bricolage 800 headings. "How we judged this" is a white details card with a 2px `edge` border, 44px summary in Bricolage 19px and a blue chevron that turns (150ms, off under reduced motion).
**Flags:** Tomato-ruled card with a round 28px icon badge; minor flags use the amber pair. A dotted rule separates the quote.
**Quotes:** white card, 1px `line`; negative quotes take a Tomato border.
**Scorecard and strips:** five-segment meters (green at 4-5, slate at 3, amber at 2, tomato at 1), 4px percentile rails with a dot, Courier Prime values.
**Source cards:** one printed card per Source at every width: white, 1px `line`, 6px radius, name in Bricolage 18px 700 over a dotted rule, then two-column labelled lines (13px 700 muted labels, Courier Prime figures). Cards flow in an auto-fit grid of 300px minimum.

### Landing
Wordmark and secondary Sign in; headline in Display blue with the word "eat" under a Tomato Wash band; sample card with a double rule and paper lift: fictional Casa Imaginária ledger line (name, leader, Good Tier), "A fictional Lisbon tasca", a highlighted reason, Medium Confidence, and the rotated "Not a real Verdict" stamp; full-width blue sign-in button (56px) and a facts list with 5px `edge` dot bullets.

### Welcome card, tier legend
Welcome card: Blue Wash, 1px dashed blue, 6px radius. Tier legend: a details disclosure with a definition list of Tier names and meanings.

### Inputs / Fields
44px minimum height, 2px `edge` border, white fill, 4px radius (search input 6px, 48px), 16px text. Focus: 3px blue outline offset 2px.

### Page skeletons and state pages
Skeletons: Band blocks pulsing to 55% over 1.4s (removed under reduced motion), shaped like what they stand in for (title 32px, bar 44px capsule, card 160px, row 70px or 132px under 720px, a Report hero variant with a 56px Tier capsule and the Book block pinned to the bottom). State pages (error, not found): double-rule card, paper lift, max 520px, 48px top margin, 26 to 34px 800 heading, capsule actions.

### Navigation
Brand (32px logo, Bricolage 20px 800) and ink 700 links, 13px bar, 44px tap height, over a 1px dotted rule. Feedback widget panel is white with a 2px ink border and the paper lift.

### Icons
Drawn SVG icons from `src/web/icons.tsx` and `atoms.tsx`: 24px viewBox, 2.25 stroke, round caps, `currentColor`, decorative with `aria-hidden`, always beside words. Forward arrow follows action words; diagonal arrow marks links that leave the app. Stars describe a Review, never the Verdict.

## Do's and Don'ts

### Do:
- **Do** give every Tier, Confidence or status atom a shape cue (pips, dots, arrow, dashed outline) and a word.
- **Do** frame the ementa, Report hero, sample report, state pages and sheet with the blue double rule.
- **Do** join a name to its Verdict with the dotted leader; draw it on hover and focus in 200ms ease-out and drop the animation under `prefers-reduced-motion`.
- **Do** keep Not enough evidence a dashed state with no pips and no Tier colour.
- **Do** use Courier Prime for price, counts, dates and Evidence figures only.
- **Do** use the highlighter inset band for the one main reason on a screen.
- **Do** make every tap target at least 44px tall; keep Book full width on phones.
- **Do** keep text at 12px or above.

### Don't:
- **Don't** use gradients in surfaces or fills, or any shadow beyond the paper lift. The one exception is the paper grain, a faint noise tile on the page ground only (off in dark mode), never on cards or fills.
- **Don't** call a Verdict a score, rating or grade, or show a star or score pill as the Verdict.
- **Don't** signal Tier or Confidence by hue alone.
- **Don't** use a dashed outline on a Tier or status atom except for provisional Tier or Not enough evidence.
- **Don't** treat Not enough evidence as a Tier.
- **Don't** use tomato or green as decoration; tomato is the stamp and red flags, green is Good-side.
- **Don't** add a coloured side stripe to cards or flags; frame them all round.
- **Don't** use photographs or imagery that implies a listed Restaurant; the example is fictional and stamped.
- **Don't** put a kicker, eyebrow or uppercase caption above headings. The stamp is the only uppercase text.

## Scope and known gaps

Beta surfaces on this system: landing, privacy, Directory, Report, history, search-home, settings (including invites), sign-in, account, feedback widget and inbox, baseline checks, owner questions, and the loading, error and not-found states. The Directory row has no reason line or standout dish (needs a DirectoryItem contract change). Portuguese UI is out of scope.

## Polish additions (2026-10-02)
- **Logo mark.** Rounded open menu frame, two menu rules and a dotted Verdict line ending in one pip, in Ementa Blue on transparency. Built-in ImageGen source: `exec-c12dbbbc-24cb-4b18-9773-55dbb011fa96.png`; prompt: “A compact G-like menu mark: open menu frame, two menu rules, dotted verdict row ending in a pip; one solid Ementa Blue, transparent, no words or food clichés.” `public/brand-mark.png` is alpha-cropped and normalized to #1C3D9B. App icon rasters derive from that mark on Logo-tile cream (#F5F1E4): `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-touch-icon.png`, and `src/app/icon.png`.
- **Warm paper.** Ground #F5EFE0, Card Cream #FFF9EA, Sunk #ECE4CE, Line #D6CDB6, Band #E4DBC3; the paper lift is tinted warm (`rgba(70,50,15,.10)`, `rgba(50,35,10,.38)`). Dark twins unchanged. `themeColor` in `layout.tsx` and `manifest.ts` match the ground.
- **Course headings** (`li.ementa-course`, aria-hidden): when the Directory is sorted by Tier, a Sunk band with a 13px uppercase Display label in blue ink and a hairline rule heads each Tier, and "Not enough evidence" heads the NEE rows. Not shown for other sorts.
- **Ornament.** A double hairline rule under the Directory and "How a Verdict reads" titles; a blue CSS diamond on each Report section's dotted rule (the rule is broken by a ground-coloured gap).
- **Landing.** Two rotated paper sheets sit behind the sample card; the primary button carries a double ring; "How a Verdict reads" lists the five Tiers as ementa lines (meaning, leader, Tier), highest first, beside the title at 900px and up.
- **Sidebar.** At 1000px and up the filter panel gets a 3px blue top rule and the paper lift. The Directory row grid is `max-content minmax(0,1fr)`, so the meta line never overlaps the foot.
- **Round 3: the printed menu.** Supersedes the course-heading and Tier-weight details above. (1) **Fraunces italic** (next/font, `--font-serif`) is the one serif accent: masthead, course headings (21px, sentence case, blue diamond), Directory reasons (17px; the Standout dish follows in Schibsted 15px) and the sample kind line. (2) **Masthead** (`src/web/masthead.tsx`): a solid brand-blue band with an inset double rule, "Lisbon" | "Ementa do Dia" | month and year (Europe/Lisbon), on the landing and the signed-in home; 13px sides on phones. (3) **Paper grain** on the page ground only, off in dark. (4) **Tier-scaled rows**: `.dir-row[data-tier]` sets name size and weight (Life Changing 25 to 32px, Must Go 23 to 28px at 800; OK, Avoid and Not enough evidence 18 to 21px at 600), and the top two Tiers get extra top padding. (5) **Phone rows** (up to 520px): the name takes its own line, then the leader and Tier; the landing sample line does the same. (6) The ementa gains an inner 1px hairline inside the double rule; the stamp is 104px; the "eat" highlight is Sun yellow. (7) Tap targets: footer, Source links and the TheFork URL field meet 44px; the TheFork input shares the `.field` styles.
- **Round 4: the report as one menu entry.** The Report hero gets the ementa's inner hairline, a 36 to 60px name, the address line in Fraunces italic, and the Verdict reason as a 25 to 36px Fraunces italic pull-line between two dotted rules. Section headings are Fraunces italic (24 to 30px). Quotes are set in Fraunces italic 19px. Owner tools sit in one Sunk panel labelled "Owner tools" so the reading page and the editing forms never mix. The "How a Verdict reads" menu is a centred 720px card. The sample Restaurant line always stacks name over leader and Tier. Logo file is `public/brand-mark.png` (renamed so Next's image optimizer cache could not keep serving the old mark); PWA assets (`manifest.webmanifest`, `sw.js`, `icon-*.png`) are outside the auth proxy.
