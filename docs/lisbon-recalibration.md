# Lisbon recalibration and snapshot gate

The calibration report must be run after the Lisbon baseline is persisted and before the first snapshot is published. It reads stored Reviews and analyses, builds the candidate snapshot in memory, and writes an eight-item acceptance report. It makes no vendor calls and writes no database rows.

```powershell
npx tsx --env-file=.env.local scripts/recalibrate-lisbon.ts
```

The command fits empirical-Bayes `k` for every Peer group and input, reports real `n_eff`, compares weighted-composite rankings with pure-gate and food-first rankings using Kendall tau-b, estimates absolute provisional cut-offs from the aggregate Peer Tier shares, and checks the current red-flag rate. It does not use an expected Tier for any Restaurant or automatically change the active rule/cut-offs. Review and apply any recommendation, then rerun the report.

Cut-offs are fitted to baseline-sampled Peers only. If the comparison finds a ranking reversal, record the reviewed rule choice with `LISBON_RULE_DECISION` before rerunning. The value must match the active implementation (`weighted-composite`, `pure-gates`, or `food-first`); changing rules requires changing the implementation and `ACTIVE_RANKING_RULE` together.

The report checks Peer targets/fallbacks, the owner’s Format and Tripadvisor spot-checks, extraction failures, a baseline PII audit, recalibration, forced Avoid share, spend ceilings, and the 500 MB database budget. Missing evidence fails the check.

Run the separate PII audit after the baseline is persisted and before generating the final report. This sends 100 sampled Review texts to the configured Anthropic model, records counts and cost in a baseline Job, and never stores Review text, detected names or Review IDs in the result:

```powershell
npx tsx --env-file=.env.local scripts/audit-baseline-pii.ts
```

The audit command makes a billable Anthropic call. Do not run it before the baseline has 100 text Reviews.
