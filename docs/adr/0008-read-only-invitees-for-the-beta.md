---
status: accepted
---

# Read-only Invitees for the beta; personal-only quotes stay with the owner

Gluton-Free was built for one user, the owner (ADR 0006; the MVP PRD put "more than one user" out of scope). For an invitation-only beta, shared with friends and promoted on LinkedIn, we add a second kind of signed-in person: the **Invitee**. Invitees can read Verdicts and Evidence and give feedback. They cannot start Lookups, answer Owner questions, declare Change points, or reach owner tools. Lookups stay owner-only, so the paid vendor calls behind them (the live DataForSEO Google Maps search, Apify, the LLM passes) never run on an Invitee's behalf. An Invitee's search reads only Restaurants already in the database.

Every crowd Source (Google, Tripadvisor, TheFork) is tagged personal-only. So **Invitees never see verbatim Review text from a personal-only Source**: they see Themes, shares and other derived Evidence. Quotes and their translations stay owner-only. The Invitee projection of the Restaurant bundle keeps Review text only when its Source is recorded as public-OK, and treats an unknown Source as personal-only. It also drops the Sources table, Owner questions, the active job and the proposed Format marker.

This is not the multi-user rewrite that ADR 0006 warned about. Verdicts are universal, so nothing an Invitee reads needs separating per user. Only rows an Invitee writes, such as feedback, belong to them. Authorization stays in the API layer: a route declares whether it is owner-only or open to Invitees.

Invitees come in through **Invite links**, not a request-and-approve queue, because only modest traction is expected. Each link can be revoked and can carry a use cap. Opening one leads to an email magic-link account, so feedback has a name, one person can be locked out, and a GDPR deletion request can be honoured. The public pages are a static landing page whose example report shows a fictional Restaurant, and a privacy notice explaining Invitee data and deletion. No real Verdict is public.

Avoid Verdicts and Red flags are shown to Invitees, worded as what reviewers report (e.g. "4 recent reviews report food poisoning"), with a way to tell the Owner something is wrong. Invitees' Verdict feedback never moves a Verdict.

## Consequences

- The route registry gains a second auth level. The owner-only test turns into "every route declares its level"; owner-only stays the default.
- The search bar reads only the database, **for everyone, the Owner included**. The old search made a live DataForSEO Google Maps call on every pause in typing, which was slow and cost money. The Owner finds a Restaurant that isn't in the database through a separate, explicit "Add a Restaurant" action. That action is the only path that calls the vendor search, once per submit, and it leads to the existing preview and Lookup.
- Showing derived Evidence from personal-only Sources to Invitees is still a residual risk to revisit before any open launch.

## Considered Options

- **Invitees see quotes too:** richer Evidence, but it redistributes personal-only Review text to people the owner may not know (LinkedIn).
- **Invitees can start Lookups:** grows coverage, but strangers could drain the shared daily spend cap and stop the owner's own Lookups.
