---
status: accepted
---

# A confirmed Change point cuts the Review window

After a renovation, a change of owner, head chef or concept, or a move, a Restaurant's older Reviews describe a different place. We therefore **cut every Source's Review window at the newest confirmed Change point**. Only Reviews since then count toward the Verdict. Earlier Reviews stay stored, and the trend chart still shows them. We do not discount them: the Review window (ADR 0004) and the 18-month half-life already clear most of the past. At O Velho Eurico, only 10 of 158 pooled text Reviews came from before the renovation, and a discount weight could not be calibrated. A hard cut is the explanation the owner can check ("judged on Reviews since it reopened in May 2025").

- **The owner confirms every Change point; nothing is applied automatically.** Signals propose one as an Owner question, which never blocks a lookup (ADR 0005):
  - a gap in Reviews across all Sources of at least 8 weeks and at least 4× the Restaurant's median time between Reviews; or
  - at least 3 Reviews within 6 months that mention a change, read by a per-Review **change marker** in the extractor.

  A shift in stars alone never proposes one, because decline is exactly what the Verdict should show. The owner can also declare one by hand.
- **Peers have no Change points.** About 500 of them cannot be confirmed by hand, and the window already limits how much of their past counts.
- **Identity follows the Listings.** A move or a change of hands is a Change point on the same Restaurant. A different business in the same premises is a new Restaurant.

Decided in [Review recency, Restaurant changes, and trends](https://github.com/FredPereira89/Gluton-Free/issues/16).

## Consequences

- The change marker (`none`, `new_owner`, `new_chef`, `renovated`, `new_concept`, `moved`) must be in the extractor **before the extractor freeze**. Adding it later means re-extracting every Peer (≈$25).
- A recent Change point can put a Restaurant into Not enough evidence. The state gives the reason ("Reopened ‹date›; n Reviews since").
- Each Verdict row records the Change point in force. A confirmed *new concept* or *moved* Change point re-proposes the Format from the Reviews since the change.
- Restaurants with a Change point and Peers without one are judged on slightly different terms. We accept this.

## Considered Options

- **Discount pre-change Reviews:** keeps more evidence, but the weight is arbitrary and cannot be calibrated.
- **Ignore changes:** simplest, and adequate for busy Sources, but a quiet Source can carry years of the old Restaurant.
- **Detect and apply automatically:** no owner effort, but a gap or a few mentions is too weak a signal to throw away Reviews on.
