# Change marker investigation — O Velho Eurico, 26 September 2026

## Finding

The `extract-v3` May 2025 diagnostic returned `none` for all 31 text Reviews. Two Reviews published on 13 May (Google 800 and Tripadvisor 4370) describe a reservation cancelled because of building works. They are near-duplicate posts of the same account on two Sources. Google Review 730, published on 22 June, explicitly says the Restaurant was renovated. None of these three rows had a stored `renovated` marker; two had no analysis row.

The model returned `renovated` for all three in three focused runs of those Reviews together. In two runs with the 31 May Reviews batched in groups of 20, it returned `none` for both May Reviews. Smaller batches sometimes recovered the markers, but a subsequent 10-Review batch run missed the two May Reviews again. Batch context therefore makes the model marker unreliable for these texts.

## Candidate and check

`extract-v4` makes the change instruction explicit about building works and applies a conservative text check to clear renovation statements when the model says `none`. The check covers direct restaurant renovation and a reservation the Restaurant cancelled due to works. It requires the Restaurant to be the cancelling actor or the stated location of the works; an unrelated hotel cancellation does not match. It also excludes nearby roadworks and ordinary uses of “works.” It only proposes a Change point; owner confirmation still governs whether any Review window changes.

Read-only extraction of 83 May–June 2025 text Reviews with `extract-v4` returned three `renovated` markers. Combined with the existing Review dates, the issue #59 detector produced a proposed **renovated** Change point dated **1 May 2025**. Cost: $0.0659. No analysis, Owner question, Change point, or Verdict was written to the database.

The frozen 200-Review gold set comparison completed in 10 requests for $0.1647: `change` agreed for 199/200, flags for 189/200. Across all extraction fields, 173/200 differed from the `extract-v2` baseline; the previous `extract-v3` comparison also reported 173/200. This comparison is a variation check, not proof that every marker is correct.

After review narrowed the cancellation check to the Restaurant, none of the 200 gold texts changed under that text check. All three O Velho Eurico Review texts still match it.

The May pair is one account cross-posted on two Sources. Issue #59 counts Review rows, so it contributes two of the three mentions; the Owner question should remain a proposal, not an automatic Change point.

## Rollout gate

The extractor freeze requires re-extraction of every Peer on the new version before another Peer snapshot. The May–June O Velho Eurico diagnostic is read-only; the proposed question appears in stored data only after those historical Reviews are analysed on `extract-v4` and the proposal check runs in a lookup or rejudge.
