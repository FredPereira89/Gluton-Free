# Extractor freeze — 30 September 2026

This approval supersedes the initial [24 September `extract-v2` freeze](extractor-freeze-2026-09-24.md) for new extractions. On 30 September 2026, the owner approved the existing `extract-v4` implementation for new extractions, including the Lisbon baseline.

The approval follows the [26 September gold-set comparison and change-point investigation](extractor-change-point-investigation-2026-09-26.md). The v4 comparison cost $0.1647 across 200 Reviews: `change` agreed with v2 for 199/200 and flags for 189/200; at least one extraction field differed for 173/200. The approval accepts the measured variation and the conservative renovation-text check described in the investigation.

## Frozen version

- Extractor version: `claude-haiku-4-5|extract-v4|themes-v1`.
- Source commit: `464a98dfcac432b5f5b616c6938184ced234d543`.
- Contract sources: `src/analysis/extract.ts` (schema, prompt, and renovation-text check), `src/domain/themes.ts` (Theme vocabulary), `src/domain/aspects.ts` (Red flag groups), `src/ingest/normalise.ts` (fetched-field whitelist), and `src/analysis/llm.ts` (model ID).

The original 200-Review gold set remains the v2 reference described in the [initial freeze](extractor-freeze-2026-09-24.md). Every Peer must be re-extracted on v4 before a new Peer snapshot. Any later change to these frozen inputs requires a new version and comparison against the gold set.

The `change` marker is part of the frozen schema. The change-point detector still proposes changes for owner confirmation; this approval does not apply any Change point.
