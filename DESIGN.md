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

Surfaces are flat paper. Blue double rules frame the menu and Report hero; the page is quiet, the Verdict is the loudest thing on it. Recognisable with content removed: the framed menu, dotted leaders, round pips. There are no gradients in surfaces and no photographs; one soft paper lift is the only shadow.

**Key Characteristics:**
- One ink: blue carries brand, links, actions, rules and focus. Tomato marks Avoid, red flags and errors; menu green marks Good-side Tiers and positives.
- Logo mark: the original open G-and-dot mark, with the G in Ementa Blue (#1C3D9B) and the dot in brighter blue (#3A7BD5). Its warm cream counter sits on the transparent mark and the header's cream tile; app icons use the same mark on that tile. The wordmark remains live text.
- Double-rule frames (2px rule plus a second 2px rule 3px outside) mark the ementa and the Report hero.
- Dotted rules (2px, `edge`) divide sections and join name to Verdict.
- Round pips and dots carry meaning (Tier 1-5, Confidence 1-3) alongside words.
- Capsule controls, 44px minimum touch height.
- Light and dark themes share one structure; only values change.

## Colors

Table-paper white and blue-black ink, one saturated blue for everything interactive, a green-to-amber Tier family, and tomato held back for Avoid and flags.

### Primary
- **Ementa Blue** (#1C3D9B): the one ink. Book and `.btn` fill, links, double-rule frames, focus ring, selection, the leader's drawn state, the landing headline. Dark twin #8FA9FF (accent #A6BAFF, focus #C9D5FF), with `on-brand` #0B1030.
- **Blue Wash** (#E7ECF9): `accent-soft`. Pressed chips, checked options, banner, welcome card, diet badge tint. Dark #1F274A.

### Secondary
- **Tomato** (#B5301D, token `flag`/`tier-avoid`): Flag cards, Avoid Tier, negative themes and bars, errors. Fill **Tomato Wash** #FCE6E1. Dark #FF9C8A on #3A1F1B.
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
**The One Ink Rule.** Blue is the only interactive and brand colour. Tomato is for Avoid and red flags, green for Good-side Tiers; neither is used as decoration.

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
- **Headline** (800, clamp(32px, 8vw, 48px), 1.05, -0.025em): restaurant name on the Report hero.
- **Directory title** (800, clamp(26px, 6vw, 34px), -0.02em): Directory heading and state-page title; privacy and account titles run clamp 28 to 38 and 30 to 42 at 800.
- **Ementa name** (700, 22px, 1.15, -0.01em): consistent across Directory sorts; the sample line runs 700 at clamp(22px, 5.5vw, 26px).
- **Hero Tier** (700, clamp(23px, 6.2vw, 38px)): the large Verdict on the Report hero; `.tier.lg` elsewhere is 26px; the Tier in a list is 700 at body size.
- **Page title** (800, 28px, -0.03em): sign-in, settings, baseline checks, feedback inbox.
- **Section title** (700, 24px, -0.02em): Report section headings; Bricolage, upright. Fraunces italic is reserved for reasons, selected quotes and course headings.
- **Title** (700, 17px to 19px, display face): sheet group legends, "How we judged this" summary, source-card name 18px.
- **Lede** (400, 17px, 1.5): intro, sample reason, search input; the Report reason is 500 at clamp(20px, 5vw, 24px), max 62ch.
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

Single centred column. `.wrap` max 720px; the landing widens to 960px; the Directory (and its wide skeleton, and the top bar above it) to 1120px. Body has 16px gutters and 32px bottom spacing plus the safe-area inset. Spacing scale 4 / 8 / 12 / 16 / 24 / 32 / 48.

Report: name, area, Verdict, Confidence, reason and warning come first; booking follows the warning and is secondary for forced Avoid. Standout dishes and Dietary fit are compact; then quotes, concise Source cards, expandable method/history, Invitee feedback and collapsed Owner tools. Back to results sits above the hero and preserves the Directory URL and scroll. Landing: the blue headline and two-sentence intro lead into the sign-in action, then the fictional example on phones; at 900px the copy and example sit side by side (1.05fr / .95fr).

Directory: below 1000px it is one column: search, an always-visible Filters button, scrollable quick chips and removable active filters above the result count and ementa. At 1000px and up a 268px sticky filter panel sits left of the ementa. Each row uses one 22px name style, reason and standout dish; the report link is primary and booking stays secondary. While the list refetches (`aria-busy` on the controls) the ementa dims to 55%.

Top bar: Brand at left, a "Lisboa · Invitation-only beta" tagline, feedback and Settings or "Your data" at right, over a 1px dotted `edge` rule; signed-in navigation includes Directory and Sign out. The page keeps its state in the URL.

## Elevation & Depth

Flat paper. Depth is a rule and a tone: cream cards on Table Paper, Sunk wells inside cards, double rules to frame the important things. One soft paper lift exists for secondary cards.

### Shadow Vocabulary
- **Paper lift** (`box-shadow: 0 1px 0 rgba(70,50,15,.10), 0 10px 24px -14px rgba(50,35,10,.38)`; dark `0 1px 0 rgba(0,0,0,.4), 0 6px 18px -10px rgba(0,0,0,.6)`): account, settings and index cards, the landing sample card, state pages, the feedback panel. The ementa, Report hero and filter sheet use the double rule instead and carry no shadow.
- **Highlight band** (`box-shadow: inset 0 -.42em 0 var(--sun)`): a flat marker stroke under the main reason; `inset 0 -.2em 0 var(--flag-bg)` under "eat" in the landing headline. Cloned across line breaks. An inset band, not a gradient and not a drop shadow.

### Named Rules
**The Paper Lift Only Rule.** One shadow token. No extra elevation on hover; hover changes tone (Sunk row) or draws the leader.

## Shapes

Printed and squared-off: a menu card, not a lobe. Cards, rows, flags and source cards 6px; small wells, inputs, language tags 4px; every control, chip, pip and badge a full capsule or circle (999px / 50%). Exceptions: the filter sheet's top corners 14px, the logo tile 8px, the preview panel 10px, tooltips 5px, meter segments and bars 4px, rails 2 to 3px.

Frames: the **double rule** is `border:2px solid brand` plus `outline:2px solid brand; outline-offset:3px` with 5px margin so the outer rule is not clipped. Keep it on the menu and Report hero only. Dividers: 1px `line` for ordinary groups, dotted `edge` for the menu. Quiet cards: 1px `line`. Flags: 2px Tomato, all round, no side stripe. Grain stays faint and is disabled in dark mode.

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
**Hero:** white, double-rule frame, 6px radius, 24px padding: name, area, Verdict and Confidence, reason and warning before booking. Forced Avoid booking is a secondary link. NEE heroes show the `.nee` state, missing-evidence explanation and any red flags before booking.
**Sections:** upright 24px Bricolage 700 headings. "How we judged this" is a white details card with a 2px `edge` border and a 44px Bricolage summary.
**Flags:** Tomato-ruled card with a round 28px icon badge; minor flags use the amber pair. A dotted rule separates the quote.
**Quotes:** white card, 1px `line`; negative quotes take a Tomato border.
**Scorecard and strips:** five-segment meters (green at 4-5, slate at 3, amber at 2, tomato at 1), 4px percentile rails with a dot, Courier Prime values.
**Source cards:** one semantic card per Source at every width: white, 1px `line`, 6px radius, linked name, review count and newest review. A native disclosure holds access and processing details; `<dl>` carries the labels and values.

### Landing
Wordmark and secondary Sign in; headline in Display blue with the word "eat" under a Sun band; short intro and sign-in action precede the sample on phones. The fictional Casa Imaginária sample has a double rule and paper lift, a Good Tier, reason and Medium Confidence, with one clear fictional-example note.

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
- **Don't** use tomato or green as decoration; tomato marks Avoid and red flags, green is Good-side.
- **Don't** add a coloured side stripe to cards or flags; frame them all round.
- **Don't** use photographs or imagery that implies a listed Restaurant; label the example as fictional.
- **Don't** put a kicker, eyebrow or uppercase caption above headings.

## Scope and known gaps

Beta surfaces on this system: landing, privacy, Directory, Report, history, search-home, settings (including invites), sign-in, account, feedback widget and inbox, baseline checks, owner questions, and the loading, error and not-found states. The Directory shows reasons and standout dishes; the paginated Restaurant inventory is Owner-only. Portuguese UI is out of scope.

## Current implementation (2026-10-02)
- **Brand and paper.** The open G-and-dot mark is `public/brand-mark.png`; matching PWA rasters live in `public/`. Ground #F5EFE0, Card Cream #FFF9EA, Sunk #ECE4CE, Line #D6CDB6, Band #E4DBC3. The faint paper grain is disabled in dark mode; `themeColor` matches the ground.
- **Landing.** A short intro and sign-in action precede the clearly labelled fictional example on phones. The Tier menu is centred; the sample line wraps cleanly.
- **Discovery.** Normal name and neighbourhood search filter the URL-backed Directory. Stored links open a recognised listing; Owner Google Maps search is explicit. Mobile Filters are always visible, active groups are removable, and hidden Not enough evidence has a direct reveal link. The paginated Restaurant inventory is Owner-only.
- **Navigation and account.** Reports link back to the validated Directory URL and restore its scroll position. Magic-link sign-in carries a safe return path. Invitees have Your data, Sign out and installation guidance; successful account deletion returns with a confirmation.
- **Report.** Verdict and warnings precede booking. Dishes and Dietary fit are compact; quotes and concise Source cards lead to expandable method/history and feedback. Source processing facts, incident quotes and Owner tools remain available in disclosures.
- **Supporting flows.** Confidence has an explanation; provisional badges announce their state. Standing history has a latest-eight view and an accessible quarterly list. Spot checks default to Pending and offer direct next-item navigation. Settings group device, beta access and Owner operations; invite creation starts collapsed.
- **PWA.** Manifest, service worker and icons are available outside the sign-in redirect. The service worker does not cache private data.
