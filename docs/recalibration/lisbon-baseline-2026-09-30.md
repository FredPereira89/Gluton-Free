# Lisbon recalibration and first-snapshot acceptance

Generated: 2026-09-30T21:03:12.202Z  
Rule version: `provisional-v2-red-flags`  
Persisted baseline Restaurants: 0  
Snapshot published: no  

This check is read-only. It excludes expected Tier labels from every decision and never uses O Velho Eurico's Tier as a criterion. An empty baseline fails the acceptance checks; it does not produce guessed calibration values.

## Recalibration

- Empirical-Bayes k is fitted by the existing snapshot builder for every available Peer group and input.
- Rule comparison uses real theta/n_eff standings. With no real ground-truth labels, it reports rank agreement (Kendall tau-b); a negative tau is a ranking reversal, and this command does not change the selected rule automatically.
- Confidence disagreement caps: 30 percentile points for both Source-vs-Source and text-vs-stars.
- Exceptional-language posterior threshold remains 90%.
- Current gate remains 1.00%; no data supports changing it.
- Provisional cut-offs: No baseline Peer Tier shares available; provisional cut-offs remain unchanged.
- Snapshot size: not calculated.

### Empirical-Bayes shrinkage

No real Peer data available; k was not fitted.

### Real effective sample sizes

No real Peer n_eff available.

### ADR 0002 ranking comparison

No real rankings available; no rule change is justified.

## Eight acceptance checks

| # | Acceptance criterion | Result | Evidence |
|---:|---|---|---|
| 1 | Each Format meets its target Peers or records the selected fallback level | **FAIL** | No persisted Lisbon baseline Restaurants. |
| 2 | Owner confirms at least 90% of 50 random baseline Formats | **FAIL** | No completed Format spot-check. |
| 3 | At least 95% of 30 Tripadvisor matches are correct | **FAIL** | No completed Tripadvisor spot-check. |
| 4 | Extraction failures are below 2% of attempted Reviews | **FAIL** | No baseline extraction counters recorded. |
| 5 | A PII audit of 100 random texts finds no reviewer names | **FAIL** | No baseline PII audit recorded. |
| 6 | Recalibration is recorded; no expected Restaurant Tier is used | **FAIL** | No real Peer sample; recalibration not run. |
| 7 | Forced Avoid applies to no more than 5% of Peers | **FAIL** | No real Peer sample. |
| 8 | Baseline spend stays within ceilings and database storage stays below 500 MB | **FAIL** | DataForSEO not recorded / $50; Anthropic not recorded incl. PII audit / $30; database 19.7 / 500 MB. |

## Readiness

**0/8 pass.** First snapshot publication is not accepted until all eight pass and any reported ranking reversal has an explicit rule decision.
