---
status: accepted
---

# Verdicts are judged against frozen monthly Peer snapshots, not live Peers

A Tier is a Restaurant's rank among its Peers, and Peers change whenever a Restaurant is looked up, refreshed or closes. We freeze Peer standings into a dated **Peer snapshot** instead of ranking against whatever is in the database at that moment:

- A snapshot records:
  - membership;
  - for each Peer group and input: the sorted θ values, the Format mean and shrinkage k, the composite distribution, the exceptional-language prior, and the Peer count.
- A snapshot is taken monthly, after the Lisbon baseline, and on demand.
- Publishing a snapshot re-judges **every** Verdict against it. The stability rule from ADR 0002 still applies, and the explanation is rewritten only where its inputs changed.
- A Restaurant looked up between snapshots is judged against the current snapshot, but joins its Peers only at the next one.
- Every Verdict row names the snapshot it used. All snapshots are kept; they are under 1 MB each.

This keeps every Verdict reproducible and explainable ("judged against Tasca Peers as of Oct 2026"). It also stops Tiers drifting silently between refreshes, and it gives all Verdicts one frame of reference at any moment. Decided in [Data model and storage budget](https://github.com/FredPereira89/Gluton-Free/issues/12).

## Consequences

- A new lookup never moves other Restaurants' Tiers until the next snapshot. Their Verdict pages can lag reality by up to a month, by design.
- Shrinkage (θ toward the Format mean) reads the Format mean from the snapshot. The snapshot is built from raw weighted means, then θ is computed.
- The quarterly Over-time series ranks past quarters against the **current** snapshot ("vs today's Peers"), not against historical Peers.
- Permanently closed Restaurants drop out at the next snapshot.

## Considered Options

- **Live Peers** (rank against the database on every computation): always current, but a Verdict can't be reproduced, and one lookup can quietly shift a whole Format's percentiles.
- **Snapshot adopted only at each Verdict's own refresh:** avoids a monthly re-judge, but leaves Verdicts judged against different frames at the same time.
