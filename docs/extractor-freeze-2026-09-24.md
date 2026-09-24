# Extractor freeze — 24 September 2026

The owner approved the [O Velho Eurico sign-off pack](extractor-signoff-o-velho-eurico-2026-09-24.md) for issue #30 on 24 September 2026. Approval covers all four items: the extraction schema including `change`, the Theme vocabulary, the Red flag groups, and the fetched Review fields. The owner accepted the documented `none`/`renovated` variation for Tripadvisor Review 4370. No Change point was inferred or applied as part of this freeze.

## Frozen version

- Extractor version: `claude-haiku-4-5|extract-v2|themes-v1`.
- Source commit at freeze: `3be3b6618a57618d33f7764894e0d963f5d48c64`.
- Contract sources: `src/analysis/extract.ts` (schema and prompt), `src/domain/themes.ts` (Theme vocabulary), `src/domain/aspects.ts` (Red flag groups), `src/ingest/normalise.ts` (fetched-field whitelist), and `src/analysis/llm.ts` (model ID).

Any change to these frozen extractor inputs requires a new version, comparison against the gold set, and re-extraction of every Peer before a new Peer snapshot. The `change` marker is part of the frozen schema.

## Gold baseline

Migration `0003_gold_set.sql` was applied, 42 already stored and previously analysed Reviews were re-extracted on the frozen version, and `scripts/gold-set.ts` rebuilt `gold_review`. No new vendor Reviews were fetched.

- 200 scrubbed text Reviews, all on the frozen extractor version.
- 142 Google and 58 Tripadvisor Reviews; 27 Source/language groups.
- Baseline selected at `2026-09-24T14:30:56.323Z`.
- Fingerprint of ordered `review_id`, text hash, and baseline JSON hash: `336dfeedec299b2db0bad5a1b8a24065`. The fingerprint contains no Review text or reviewer identity.
- The backfill's successful pass cost $0.0390 in LLM calls. The initial failed pass and three diagnostic probes cost about $0.0909, for about $0.130 total, within the owner's $0.15 cap.

To check a later candidate, use the model-retirement instructions in `scripts/compare-extractor.ts`. Regenerate this baseline only when deliberately replacing the frozen sample.
