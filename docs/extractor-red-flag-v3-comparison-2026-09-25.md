# Red flag extractor change — 25 September 2026

Issue #37 changes the money incident instruction to include an unordered or uneaten couvert and to treat a merely pricey couvert as a value complaint. The extractor is now `claude-haiku-4-5|extract-v3|themes-v1`; the verifier definition is `verify-v2`. The frozen `extract-v2` gold baseline remains intact.

The candidate was run against all 200 Reviews in the frozen gold set using `scripts/compare-extractor.ts`. The run completed in 10 requests for $0.1701. Flag outputs agreed for 188/200 Reviews (94.0%). Across all extraction fields, 173/200 Reviews differed on at least one field; the comparison includes normal model variation and does not by itself isolate the wording change. The detailed comparison log was kept outside the repository because it contains Review excerpts.

Before publishing another Peer snapshot, re-extract every Peer with `extract-v3` and verify its pending flags with `verify-v2`, as required by [the extractor freeze](extractor-freeze-2026-09-24.md). Previously stored analyses and flag decisions retain their original version until reprocessed.
