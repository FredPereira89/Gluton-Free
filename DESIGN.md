---
name: Gluton-Free
description: A Lisbon dining guide where each Restaurant is a lobe on a map, sized and filled by its Verdict, on warm cream.
colors:
  ground: "#F5F1E4"
  surface: "#FDFBF4"
  sunk: "#ECE7D6"
  ink: "#2C2E2A"
  muted: "#575A50"
  faint: "#60634F"
  line: "#D6D0B9"
  band: "#E2DCC6"
  brand: "#8ED462"
  on-brand: "#2C2E2A"
  coral: "#FF705D"
  sun: "#FFE681"
  accent: "#2E6B1D"
  accent-soft: "#E2F1D0"
  tier-avoid: "#B3321F"
  tier-avoid-fill: "#FFD3CB"
  tier-ok: "#6B6754"
  tier-ok-fill: "#E9E4D0"
  tier-good: "#2F6B1E"
  tier-good-fill: "#D6EFBC"
  tier-must-go: "#1F5A10"
  tier-must-go-fill: "#B5E48A"
  tier-life-changing: "#7A5A00"
  tier-life-changing-fill: "#FFE681"
  flag: "#B3321F"
  flag-fill: "#FFE3DD"
  warn: "#7A5A00"
  warn-fill: "#FFF1C2"
typography:
  display:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(36px, 7vw, 64px)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.055em"
  headline:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(26px, 5vw, 34px)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  hero-tier:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(23px, 6.2vw, 38px)"
    fontWeight: 700
    lineHeight: 1.15
  page-title:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  section-title:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  subhead:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 750
    lineHeight: 1.15
  title:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.15
  body:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  lede:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
  action:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
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
    lineHeight: 1.35
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, Consolas, monospace"
    fontSize: "13.5px"
    fontWeight: 500
    fontFeature: "tabular-nums"
rounded:
  rail: "4px"
  tip: "5px"
  logo: "9px"
  sm: "10px"
  card: "20px"
  lobe: "32px"
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
  tier-badge:
    backgroundColor: "{colors.tier-ok-fill}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  tier-badge-lg:
    backgroundColor: "{colors.tier-good-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lobe}"
    padding: "10px 22px"
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
    padding: "0 24px"
    height: "48px"
  book-sm:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  hero:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lobe}"
    padding: "24px"
  restaurant-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lobe}"
    padding: "16px"
  flag:
    backgroundColor: "{colors.flag-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "14px 16px"
  button-danger:
    backgroundColor: "{colors.flag-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "8px 20px"
  button-secondary:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "8px 20px"
  ledge-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  filter-sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lobe}"
    padding: "0 16px 16px"
  skeleton-block:
    backgroundColor: "{colors.band}"
    rounded: "{rounded.card}"
  state-page:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lobe}"
    padding: "24px"
  diet-badge:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    size: "28px"
---

# Design System: Gluton-Free

Recorded from the shipped build of issue #121 (`src/app/globals.css`). Every beta surface is on this system (see Scope at the end).

## Overview

**Creative North Star: "Guide Map Lobes"**

A Restaurant is a lobe on a guide map, and the Verdict is the lobe's size and fill. Flat, unmodulated colour sits on warm cream; shapes swell and round; controls are capsules. The Tier is read from fill, pip count and label together, never from hue alone. The system refuses the category default of a star or score pill on a white card.

The build is warm and plain-spoken rather than clinical or dashboard-dense. Recognisable with content removed: cream ground, capsule buttons, round pips. Ink text sits on every Tier fill.

**Key Characteristics:**
- Flat colour, no gradients, one soft flat offset shadow.
- Round pips and dots carry meaning (Tier 1-5, Confidence 1-3) alongside words.
- Capsule controls, 44px minimum touch height.
- Lobe corners: three large radii and one tight corner (the "tail").
- Light and dark themes share the same structure; only values change.

## Colors

Warm cream ground, near-black green-grey ink, one fresh green action colour, and a five-step Tier family of pastel fills with darker outlines.

### Primary
- **Meadow Green** (#8ED462): the Book capsule and primary `.btn` fill; text selection. Always outlined in ink with ink text. Book hover mixes 14% white (#fff) into it; that white is a hover step, not a palette colour.
- **Forest Link** (#2E6B1D): links, focus-adjacent accents, checkbox accent, history line, diet icon colour. Lightens to #A6E07C in dark.

### Secondary
- **Coral** (#FF705D) and **Sun Yellow** (#FFE681): palette accents declared in the build; Sun Yellow is also the Life-changing Tier fill. Coral is declared but its direct use is not evidenced in the stylesheet beyond the palette; do not treat it as a UI role yet.

### Tertiary
- **Soft Sprout** (#E2F1D0): tint behind diet badges, banner, welcome card.

### Neutral
- **Warm Cream** (#F5F1E4): page ground. **Fresh Cream** (#FDFBF4): cards, hero, rows. **Sunk Cream** (#ECE7D6): chips, evidence wells, secondary buttons. **Band** (#E2DCC6): tracks and rails.
- **Garden Ink** (#2C2E2A): all text on fills, borders of hero and capsules. **Muted** (#575A50) and **Faint** (#60634F): secondary text. **Line** (#D6D0B9): hairlines and dotted dividers.

### Tier family
Each Tier has an outline colour and a fill (values in frontmatter): Avoid coral-red, OK warm grey-sand, Good light green, Must-go green, Life-changing yellow. Dark theme inverts fills to deep tones with light outlines.

### Named steps
Intentional steps built into the system, recorded so they read as design and not drift:
- **Dark theme ramp:** every light token has a dark twin on the same role (ground #1C1F19, surface #262A22, sunk #20231C, ink #F2EFE2, muted #B4B6A8, faint #8E9082, line #3A3E33, band #31352A, accent #A6E07C, accent-soft #2A3A20; Tier outlines lighten to #FF9A8A / #BDB89F / #9CD97B / #B9F08A / #FFD84D on deep fills #4A2520 / #34362B / #2C4220 / #365A24 / #5C4A10; flag #FF9A8A on #3A1F1B; warn #F2C94C on #3A3010). Dark applies by `prefers-color-scheme` or `data-theme="dark"`.
- **Scrim:** the filter sheet backdrop is dark ground at 55% (rgba(28,31,25,.55)) in both themes.
- **Shadow ink:** the ledge is ink at 10% in light and black at 35% in dark.
- **Logo tile:** #F5F1E4 behind the 32px logo in both themes.
- **Status tints:** Confidence High and Trend Improving use the Good fill; Medium and provisional use the warn fill; Low and Slipping use the Avoid fill; Steady uses the OK fill.

### Named Rules
**The Never-Hue-Alone Rule.** Tier is carried by fill plus pip count (1 to 5 filled round pips) plus the label. Confidence is carried by dot count (1 to 3) plus its word. Trend is carried by arrow glyph plus word. Colour never stands alone.

**The Dashed Means Unsure Rule.** A dashed outline means a provisional Tier or Not enough evidence. Nothing else uses a dashed border on a Tier or status atom.

**The Ink-On-Fill Rule.** Text on any Tier or chip fill is ink (#2C2E2A in light). Tier outline colours are for borders and pips, not text.

## Typography

**Display and Body Font:** Schibsted Grotesk (via next/font, with system sans fallback)
**Label/Mono Font:** IBM Plex Mono (400, 500), for percentiles, counts, axes, language tags

**Character:** One grotesk used heavy (800) for names and Tiers, regular for reading; mono only for numbers that must align.

### Hierarchy
- **Display** (800, clamp(36px, 7vw, 64px), 1.02, -0.055em): landing hero heading only.
- **Headline** (800, clamp(26px, 5vw, 34px), 1.15): restaurant name on the Report hero; account and privacy page titles run clamp 28 to 38 and 30 to 42 at the same weight.
- **Hero Tier** (700, clamp(23px, 6.2vw, 38px)): the large Tier badge on the Report hero. The `lg` badge elsewhere is 26px.
- **Page title** (800, 28px, -0.03em): sign-in, settings, baseline checks, feedback inbox.
- **Section title** (800, 22px, -0.02em): directory heading, baseline groups, inbox section heads; landing example heading 23px.
- **Subhead** (750 to 800, 19px): settings and account section heads; phone card name 19px.
- **Title** (700, 17px to 18px): report section headings; table row name and search result 17px.
- **Lede** (400, 17px, 1.5): explanation line, search input; hero explain clamp(18px, 4.6vw, 21px) at 600, max 62ch.
- **Body** (400, 16px, 1.5): running text, inputs.
- **Action** (600 to 700, 15px): small Book, spot-check links.
- **Label** (600, 14px): chips, row labels (700, muted), field labels, table headers.
- **Caption** (400, 12px to 13px): footnotes, tooltips, footers.
- **Data** (mono 500, 12 to 13.5px, tabular): percentiles, axis ticks.

Odd values (12.5px, 13.5px, 14.5px, 21px, 30px, 36px) are one-off refinements around these steps; do not add more.

### Named Rules
**The Step-Not-Size Rule.** New text takes a named step above. A new literal size needs a reason and a place in this list.

**The Verdict Vocabulary Rule.** Copy never calls a Verdict a "score", "rating" or "grade". Say Verdict, Tier, Confidence.

## Layout

Single centred column, `.wrap` max 720px; the Directory widens to 1120px and the landing to 960px. Body padding 16px. Spacing scale 4 / 8 / 12 / 16 / 24 / 32 / 48. Report sections are separated by a 2px dotted line divider with 24px vertical padding.

Report first viewport at 390px: name and area, large Tier badge with pips, Confidence chip beside it, one explanation line, then the full-width Book capsule (48px). Legend, facts and history sit below. At 560px and up the Book capsule shrinks to fit its content.

Directory: a table at wide widths (9 columns, still dense; known deferral). Below 1000px each row becomes a phone card: name, Tier and Confidence, Trend, dietary badges, facts line (Format, Price, Area), then a full-width Book capsule. The whole card is tappable through the name link's stretched overlay; the Book link sits above it. Below 720px the filters leave the page and open as a modal bottom sheet (see Components). While the list refetches (`aria-busy` on the controls) the results dim to 50% opacity. The wide loading skeleton uses the same 1120px column as the Directory.

## Elevation & Depth

Flat by default. Depth is tonal: Fresh Cream cards on Warm Cream ground, Sunk Cream wells inside cards.

### Shadow Vocabulary
- **Flat offset** (`box-shadow: 0 2px 0 rgba(44,46,42,.1)`; dark `0 2px 0 rgba(0,0,0,.35)`): hero, cards, rows, inline filter panel, state pages. A ledge, not a blur. The open filter sheet and the feedback panel drop it for a 2px ink border.

### Named Rules
**The One Ledge Rule.** The only shadow token is the 2px flat offset. Cards do not gain extra elevation on hover; the Tier badge swells instead.

## Shapes

Lobe language: large rounded boxes with one tight corner. Hero uses a 32px radius all round. Large Tier badges, phone cards, the landing hero, state pages and skeleton rows use 32px on three corners and a tight 10px on the bottom-left, like a map lobe with a tail. Cards and flags 20px; small wells and inputs 10px; every control, chip, pip and badge is a full capsule or circle (999px / 50%). Small radii for tiny parts: 4px chart rails and meter segments (2px and 3px on thinner rails), 5px tooltips and warnings, 9px logo tile. Borders: 2px ink on hero and Book; 2px Tier colour on badges; 2px dotted line for dividers. Pips are 9px (default), 14px (large; 12px at 480px and under); Confidence dots 8px.

## Components

### Tier badge
Capsule with 2px outline in the Tier colour, fill in the Tier fill, ink text weight 700, five round pips (filled up to the Tier, hollow after) then the label. Sizes: default, `lg` (26px, lobe shape; clamp 23 to 38px in the Report hero). Dashed variant for provisional. Hover or focus on a directory row swells it `scale(1.04)` over 160ms; disabled under prefers-reduced-motion.

### Confidence chip
Capsule on a tinted fill (High light green, Medium pale yellow, Low pale coral), three round dots filled to level, then "High/Medium/Low Confidence". Compact form shortens the visible word on rows; the full phrase stays for screen readers.

### Trend chip
Capsule with a drawn arrow (up, flat, down) and the word Improving, Steady or Slipping, on green, sand or coral tint. Renders nothing without a Trend.

### Dietary icons
28px round Soft Sprout badge holding a drawn 16px stroke icon (leaf sprig, leaf, crossed wheat) plus the name. Icon-only on wide table rows (name read aloud and in tooltip); on phone cards the name shows inside a Soft Sprout capsule.

### Icons
Drawn SVG icons (the `Icon` renderer, `ArrowIcon`, `ExternalIcon` and `Stars` live in `src/web/icons.tsx`; Trend arrow and Dietary paths sit beside their atoms in `src/web/atoms.tsx`): 24px viewBox, 2.25 stroke, round caps and joins, `currentColor`, decorative with `aria-hidden`. `ArrowIcon` (14px right arrow) points forward inside the app and follows the action words ("Preview", "Open Verdict"). `ExternalIcon` (14px diagonal arrow) marks links that leave the app. Both sit beside link text, never alone. `Stars` draw a Review's count as filled against outlined stars (outlined ones at 55% opacity) with an aria-label; they describe a Review, never the Verdict.

### Buttons
- **Shape:** full capsule (999px), 2px ink border.
- **Primary (Book):** Meadow Green, ink text, weight 800, min-height 48px, padding 0 24px. `.btn` is the form variant, 44px, weight 700.
- **Small:** 44px, padding 0 16px, 15px text. In table rows it sits on Fresh Cream and fills green on hover.
- **Hover / Focus:** hover mixes 14% white into green; focus is a 3px ink outline offset 3px.
- **Secondary:** Sunk Cream fill, 2px line border.
- **Danger (`btn-danger`):** Flag Fill (#FFE3DD), ink text, 2px flag-red border, same capsule and 44px height. For destructive account actions; its words carry the meaning alongside the colour.
- **Disabled:** Sunk Cream fill, muted text, line border, full opacity, not-allowed cursor; legible rather than faded.

### Cards / Containers
**Ledge card** is the default container: Fresh Cream surface, flat offset shadow, 20px radius, no border, 16px padding (24px for the feedback block). Used by account and settings sections, owner questions, baseline checks, feedback groups, search results, index rows, the history chart and the sign-in form. Borders are reserved for the hero (ink), the Report judged panel and sample report (line), and the feedback panel (ink). Wells inside a ledge card step down to Sunk Cream at 10px.

Hero: Fresh Cream, 2px ink border, 32px radius, flat offset, 24px padding. Restaurant card (phone): Fresh Cream, lobe radius, 16px padding. Flag: coral-tinted fill, 2px red border, 20px radius, framed all round. Evidence wells: Sunk Cream, 20px. Quotes: tinted green or coral, 20px.

### Filter sheet (Directory, below 720px)
A modal bottom sheet. A capsule Filters button opens it; the panel is fixed to the bottom edge, Fresh Cream, 32px radius on the top corners, 2px ink border (none at the bottom), no shadow, max height 82vh and scrolling, bottom padding includes the safe-area inset. A sticky header row holds the title and close control. A full-viewport backdrop (dark ground at 55%) sits one layer beneath the sheet. Area options lose their inner scroll cap inside the sheet. At 721px and up the same groups render as an inline ledge panel (auto-fit columns) and the backdrop and sheet header are hidden.

### Busy list
While the Directory refetches, `aria-busy="true"` on the controls dims the results scroller to 50% opacity (150ms). Content stays in place; no spinner and no layout shift.

### Page skeletons
Loading routes render a `skeleton-page` of blocks filled with Band (#E2DCC6) pulsing to 55% opacity over 1.4s. Blocks copy what they stand in for: title (32px, 10px radius), bar (44px capsule), card (160px, 20px radius), row (70px, 132px under 720px, lobe corners with the tight tail), and a Report hero variant (min-height min(520px, 70vh), text lines, 56px Tier capsule, Book capsule pinned to the bottom). The wide variant uses the 1120px Directory column. Reduced motion removes the pulse.

### State pages (error and not found)
One lobe card (Fresh Cream, 32px with a tight bottom-left, flat ledge, 24px padding, max 520px, 48px top margin) holding a 56px accent-soft round badge, a 26 to 34px 800-weight heading, copy and a wrapping row of capsule actions.

### Inputs / Fields
44px minimum height, 2px line border, Fresh Cream fill, 10px radius, 16px text. Sort select is a capsule. Focus: 3px ink outline offset 2px.

### Navigation
Plain text top bar, 13px, ink links weight 700, no chrome.

## Do's and Don'ts

### Do:
- **Do** give every new Tier, Confidence or status atom both a shape cue (pips, dots, arrow, dashed outline) and a word.
- **Do** put ink text on every Tier fill; pair a darker outline with a pastel fill.
- **Do** make every tap target at least 44px tall; keep Book a full-width capsule on phones.
- **Do** keep depth to the 2px flat offset and tonal layering.
- **Do** use the drawn icon set for glyphs; keep icons decorative beside real words.
- **Do** honour prefers-reduced-motion for the 160ms Tier swell.

### Don't:
- **Don't** use gradients or blurred shadows.
- **Don't** call a Verdict a score, rating or grade, or show a star or score pill as the Verdict.
- **Don't** signal Tier or Confidence by hue alone.
- **Don't** use a dashed outline for anything except provisional Tier or Not enough evidence.
- **Don't** add a coloured side-stripe to cards or flags; frame them all round.
- **Don't** use a pill label or uppercase caption above headings on new surfaces.

## Scope and known gaps

Every beta surface follows this system: landing, privacy, directory, Report, history, search-home, settings (including invites), sign-in, account, feedback widget and inbox, baseline checks, owner questions, and the loading, error and not-found states. New surfaces inherit it; the earlier 6px to 16px radii and 1px borders are gone from the stylesheet.

Known gaps: the wavy divider and blob hero silhouette from the direction were not built (a dotted `.sec` divider ships); the 9-column desktop directory table is still dense. Eyebrows and kickers no longer exist in the source and are not part of the system.

