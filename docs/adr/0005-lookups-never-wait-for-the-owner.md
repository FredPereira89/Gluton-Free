---
status: accepted
---

# A lookup never waits for the owner

Earlier decisions said Listings are matched semi-automatically "with owner confirmation" and that Format is "LLM-proposed and owner-confirmed". Taken literally, a lookup would stop at each confirmation until the owner answered. The owner uses Gluton-Free on a phone, often at the table, so a lookup that stops for input is a lookup that never finishes. We therefore never let a lookup wait for the owner:

- **Confident matches are accepted automatically.** A Listing match with the same phone number, or one within about 100 m that also has a near-identical name, starts the lookup at once. The owner can undo it from the Restaurant.
- **Uncertain matches don't block the lookup.** When two Tripadvisor pages both fit, the lookup runs on the Sources it is sure of. The choice goes to the owner as a *Needs you* item, and the chosen Listing is fetched afterwards and triggers a re-judge.
- **The Format is confirmed after the Verdict.** The Verdict is issued with the Format read from the Reviews, marked "(proposed)". If the Reviews disagree with Google's category, the owner is asked afterwards. Changing the Format re-judges the Verdict in seconds, because it is code plus a new explanation, not new fetching.
- **A partial lookup still gives a Verdict.** If one Crowd Source fails after retries, the Verdict is judged on the Sources that arrived, with Confidence capped at Low, and "Retry ‹Source›" becomes a Needs-you item.

Decided in [Search and add-Restaurant UX](https://github.com/FredPereira89/Gluton-Free/issues/14).

## Consequences

- The job model has no `needs_input` status. Owner questions live beside the job as Needs-you items, not inside it.
- `listing.match_provenance` needs a third value for automatically accepted matches, alongside `pasted` and `proposed_confirmed`.
- A Restaurant can have several Verdict rows within its first hour (the first Verdict, then re-judges after a Format or Listing answer). The append-only Verdict table already allows this.
- An accepted match can be wrong. The undo, and the evidence shown with each match (phone, distance, name similarity), are the guard against that.

## Considered Options

- **Confirm everything before spending (a wizard):** the safest option, but it blocks at the table and adds a tap even when every match is certain.
- **Pause at "Placing among Peers" when the Format is disputed:** gets the Format right first time, but the lookup can stall for hours with every Review already paid for.
