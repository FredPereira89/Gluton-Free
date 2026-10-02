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
    fontSize: "clamp(34px, 7vw, 52px)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(26px, 5vw, 34px)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.015em"
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
  label:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, Consolas, monospace"
    fontSize: "13.5px"
    fontWeight: 500
    fontFeature: "tabular-nums"
rounded:
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
  diet-badge:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    size: "28px"
---

# Design System: Gluton-Free

Recorded from the shipped foundation build of issue #121. Only the foundation is on this system (see Scope at the end).

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
- **Meadow Green** (#8ED462): the Book capsule and primary `.btn` fill; text selection. Always outlined in ink with ink text.
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

### Named Rules
**The Never-Hue-Alone Rule.** Tier is carried by fill plus pip count (1 to 5 filled round pips) plus the label. Confidence is carried by dot count (1 to 3) plus its word. Trend is carried by arrow glyph plus word. Colour never stands alone.

**The Dashed Means Unsure Rule.** A dashed outline means a provisional Tier or Not enough evidence. Nothing else uses a dashed border on a Tier or status atom.

**The Ink-On-Fill Rule.** Text on any Tier or chip fill is ink (#2C2E2A in light). Tier outline colours are for borders and pips, not text.

## Typography

**Display and Body Font:** Schibsted Grotesk (via next/font, with system sans fallback)
**Label/Mono Font:** IBM Plex Mono (400, 500), for percentiles, counts, axes, language tags

**Character:** One grotesk used heavy (800) for names and Tiers, regular for reading; mono only for numbers that must align.

### Hierarchy
- **Display** (800, clamp(34px, 7vw, 52px), 1.15): the `xl` Tier badge.
- **Headline** (800, clamp(26px, 5vw, 34px), 1.15): restaurant name on the Report hero. Hero Tier badge is 800-weight text clamp(23px, 6.2vw, 38px).
- **Title** (700, 18px to 22px): section headings; directory heading 22px; card name 19px (phone) or 17px (table).
- **Body** (400, 16px, 1.5): running text; explanation line 17px, hero explain clamp(18px, 4.6vw, 21px) at 600, max 62ch.
- **Label** (600, 14px): chips, row labels (700, muted), field labels.
- **Data** (mono 500, 12 to 13.5px, tabular): percentiles, axis ticks.

### Named Rules
**The Verdict Vocabulary Rule.** Copy never calls a Verdict a "score", "rating" or "grade". Say Verdict, Tier, Confidence.

## Layout

Single centred column, `.wrap` max 720px; the Directory widens to 1120px and the landing to 960px. Body padding 16px. Spacing scale 4 / 8 / 12 / 16 / 24 / 32 / 48. Report sections are separated by a 2px dotted line divider with 24px vertical padding.

Report first viewport at 390px: name and area, large Tier badge with pips, Confidence chip beside it, one explanation line, then the full-width Book capsule (48px). Legend, facts and history sit below. At 560px and up the Book capsule shrinks to fit its content.

Directory: a table at wide widths (9 columns, still dense; known deferral). Below 1000px each row becomes a phone card: name, Tier and Confidence, Trend, dietary badges, facts line (Format, Price, Area), then a full-width Book capsule. The whole card is tappable through the name link's stretched overlay; the Book link sits above it. Filters become a bottom sheet below 720px.

## Elevation & Depth

Flat by default. Depth is tonal: Fresh Cream cards on Warm Cream ground, Sunk Cream wells inside cards.

### Shadow Vocabulary
- **Flat offset** (`box-shadow: 0 2px 0 rgba(44,46,42,.1)`; dark `0 2px 0 rgba(0,0,0,.35)`): hero, cards, rows, filter panel. A ledge, not a blur.

### Named Rules
**The One Ledge Rule.** The only shadow token is the 2px flat offset. Cards do not gain extra elevation on hover; the Tier badge swells instead.

## Shapes

Lobe language: large rounded boxes with one tight corner. Hero uses a 32px radius all round. Large Tier badges and phone cards use 32px on three corners and a tight 10px to 12px on the bottom-left, like a map lobe with a tail. Cards and flags 20px; small wells 10px; every control, chip, pip and badge is a full capsule or circle (999px / 50%). Borders: 2px ink on hero and Book; 2px Tier colour on badges; 2px dotted line for dividers. Pips are 9px (default), 14px (hero) and 18px (xl); Confidence dots 8px.

## Components

### Tier badge
Capsule with 2px outline in the Tier colour, fill in the Tier fill, ink text weight 700, five round pips (filled up to the Tier, hollow after) then the label. Sizes: default, `lg` (26px, lobe shape), `xl` (clamp 34 to 52px, lobe shape). Dashed variant for provisional. Hover or focus on a directory row swells it `scale(1.04)` over 160ms; disabled under prefers-reduced-motion.

### Confidence chip
Capsule on a tinted fill (High light green, Medium pale yellow, Low pale coral), three round dots filled to level, then "High/Medium/Low Confidence". Compact form shortens the visible word on rows; the full phrase stays for screen readers.

### Trend chip
Capsule with a drawn arrow (up, flat, down) and the word Improving, Steady or Slipping, on green, sand or coral tint. Renders nothing without a Trend.

### Dietary icons
28px round Soft Sprout badge holding a drawn 16px stroke icon (leaf sprig, leaf, crossed wheat) plus the name. Icon-only on wide table rows (name read aloud and in tooltip); on phone cards the name shows inside a Soft Sprout capsule.

### Icons
Drawn SVG icons (the `Icon` renderer and the external-link arrow live in `src/web/icons.tsx`; Trend arrow and Dietary paths sit beside their atoms in `src/web/atoms.tsx`): 24px viewBox, 2.25 stroke, round caps and joins, `currentColor`, decorative with `aria-hidden`. External link arrow sits beside link text, never alone.

### Buttons
- **Shape:** full capsule (999px), 2px ink border.
- **Primary (Book):** Meadow Green, ink text, weight 800, min-height 48px, padding 0 24px. `.btn` is the form variant, 44px, weight 700.
- **Small:** 44px, padding 0 16px, 15px text. In table rows it sits on Fresh Cream and fills green on hover.
- **Hover / Focus:** hover mixes 14% white into green; focus is a 3px ink outline offset 3px.
- **Secondary:** Sunk Cream fill, 2px line border.

### Cards / Containers
Hero: Fresh Cream, 2px ink border, 32px radius, flat offset, 24px padding. Restaurant card (phone): Fresh Cream, lobe radius, 16px padding. Flag: coral-tinted fill, 2px red border, 20px radius, framed all round. Evidence wells: Sunk Cream, 20px. Quotes: tinted green or coral, 20px.

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

Built on this system: tokens, Tier badge, Confidence dots, Trend chip, Dietary icons, restaurant card and row, Report hero, Directory, Tier legend.

Pending (not yet on the system): landing, sign-in, invite, settings and inbox, search-home, history, feedback, privacy, quote stars, owner-questions glyph. These still carry earlier radii (6px to 16px), 1px borders and plain cards.

Deferrals from the finish review: the wavy divider and blob hero silhouette from the direction were not built (a dotted `.sec` divider ships); the 9-column desktop directory table is still dense; `.eyebrow` (uppercase 11.5px caption) is still used by landing, privacy and search-home.
