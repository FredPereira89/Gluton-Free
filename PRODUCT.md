# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Invitees: anyone with an interest in the app whom the Owner has let into the invitation-only beta by Invite link, plus the Owner, who runs it. Diners in or visiting Lisbon, mostly on a phone, choosing where to eat. They want a clear answer fast and a way to go and book. They may not know Lisbon dining terms (tasca, marisqueira, couvert). The audience is broad, so the UI must meet general UI/UX and accessibility guidelines, not just suit a niche.

Invitees are read-only: they never start a Lookup or use Owner tools. They read the same report as the Owner, quotes included, and may leave feedback.

## Product Purpose

Gluton-Free aggregates restaurant reviews from many Sources and distils them into one qualitative Verdict per Restaurant, backed by Evidence. Star ratings alone are too compressed to tell restaurants apart. Success: a diner opens a Restaurant, understands the Verdict at once, trusts it because the reasons are visible, and books or opens the map.

## Positioning

Verdicts are relative. A Restaurant is judged against its Peers (the same Format in Lisbon), not against every restaurant. A tasca is compared with tascas. Each Verdict states its Tier, its Confidence and why, and can say "Not enough evidence" instead of guessing. Few review aggregators will say that.

## Operating Context

- Mobile-first. Diners decide on a phone, often in a hurry.
- Decision-first and Verdict-led: Tier, Confidence, reason and booking link come before detail. Evidence supports the Verdict and is never the headline.
- Invitation-only beta. The landing page is public and shows only a fictional example report. No real Verdicts are public, and everything else needs sign-in.
- Lisbon only. Verdicts are universal and are re-judged monthly against a frozen Peer snapshot.
- Surfaces: landing, sign-in, Invite redemption, directory (search, sort, filter, Booking link), Restaurant report, welcome card and Tier legend, Verdict feedback and general feedback, privacy notice, "your data" page. Owner-only: settings, feedback inbox, Lookups and Owner questions.
- Owner-only tools adopt the shared components but are not redesigned as product surfaces.

## Capabilities and Constraints

- The Tier ladder, lowest to highest, with plain meanings from `TIER_MEANING` in `src/domain/aspects.ts`:
  - Avoid: reviewers report real problems
  - OK: fine if convenient
  - Good: solid choice for its kind
  - Must Go: clearly better than most of its kind
  - Life Changing: among the very best of its kind in Lisbon, worth planning a trip around
- Not enough evidence is a state shown in place of a Verdict, never a Tier. Trend is hidden when Confidence is Low or history is under a year.
- Provisional Verdicts always have Low Confidence.
- Red flags (health or money problems) are shown. Only grave ones force Avoid.
- Dietary fit is shown only on positive evidence, never as a "no".
- Booking link: "Book on TheFork" when a TheFork Listing exists, otherwise "Open in Google Maps". No affiliate parameters.
- Verbatim review quotes appear on the report. Access tags are governed by the beta rules in ADR 0008.
- UI vocabulary is the CONTEXT.md glossary. Capitalised terms keep their meaning: Restaurant, Verdict, Tier, Confidence, Evidence, Format, Peer, Invitee, Owner. Do not use the terms CONTEXT.md marks "Avoid" (e.g. never "score", "rating" or "grade" for a Verdict).
- Stack in place: Next.js, React, TypeScript, Supabase. The ticket does not call for a stack change.
- Undecided: whether a Portuguese UI is ever offered. It is out of scope for this redesign.

## Brand Commitments

- The name is Gluton-Free.
- Voice: English UI with Portuguese names, places and dish names left as written. Plain and direct, no hype and no filler.
- Nothing else is binding. Colour, type, logo and icon are open for the redesign. This includes today's teal `#0E6170`, the Schibsted Grotesk and IBM Plex Mono pair, and the current app icons. They are incumbent evidence, not constraints.

## Evidence on Hand

- A baseline of about 336 Lisbon Restaurants with Verdicts, and TheFork Listings for 87 of 341.
- A fictional sample report ("Casa Imaginária") on the landing page. No real Verdict, testimonial, user count or press may be fabricated for any surface.
- Existing PWA icons in `public/`. The Tier legend and welcome card already exist (#119).

## Product Principles

1. Verdict first. A diner should get the answer, how sure we are and the next step on the first phone screen.
2. Show the reasons. Every Verdict is shown with its Confidence and the evidence behind it. Uncertainty is shown, never hidden.
3. Judged against its own kind. Say which Peer group a Verdict was judged against.
4. Never guess. Not enough evidence, hidden Trend and absent Dietary fit are honest states, designed as carefully as the full ones.
5. One shared language. A Tier, a Confidence level or a flag looks and reads the same on every surface.

## Accessibility & Inclusion

- Meets general UI/UX and WCAG 2.2 AA guidance. This is the user's stated bar.
- The Tier must never rely on colour alone. The Tier palette has to read without colour.
- Visible focus, adequate contrast and comfortable tap targets on phones.
- No layout shift while loading.
- Plain language for people unfamiliar with Lisbon dining terms.
