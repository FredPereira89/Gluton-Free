# Verdict rule: simulation findings

Supports [Verdict rule: gates, weights, confidence](https://github.com/FredPereira89/Gluton-Free/issues/7). Synthetic data only: re-run on the real Lisbon baseline before freezing any number.

## Setup (`sim/verdict_sim.py`)

- A Format of N Restaurants with latent quality on 6 Aspects (shared factor, ρ = 0.35).
- Text-bearing Reviews per Restaurant ~ lognormal (median 250, min 15).
- Mention rates: food 75%, service 55%, value 30%, ambience 25%. Wait is mentioned mostly when bad.
- Each mention is scored −2..+2 with positivity bias and Restaurant-specific spread (consistency).
- Rollup: empirical-Bayes shrinkage to the Format mean (k = 10), consistency = shrunk per-Review stance SD, then mid-rank percentiles.
- Every rule targets the same Tier shares.
- **Accuracy** is measured against each rule's own noise-free Tier. **Retest** is Tier agreement on a second, independent draw of Reviews.

## Q1: how per-Aspect signals combine (N = 300, 100 reps)

| Rule | Accuracy | Retest | Accuracy, n<60 | Must Go+ with food < P50 | Must Go+ with service < P25 |
|---|---|---|---|---|---|
| **A: weighted composite of percentiles + floors** | **0.882** | **0.875** | **0.775** | **0.000** | **0.000** |
| A-z: composite of standardised θ + floors | 0.882 | 0.881 | 0.766 | 0.000 | 0.000 |
| A0: composite, no floors | 0.878 | 0.881 | 0.762 | 0.010 | 0.001 |
| B: pure gates (rank by minimum Aspect percentile) | 0.779 | 0.764 | 0.586 | 0.083 | 0.000 |
| C: food-first, service demotes | 0.839 | 0.835 | 0.724 | 0.000 | 0.019 |

The same ordering holds for a Tasca profile (ambience informative-only) and for a 40-peer Format.

- Gates rank by a minimum of noisy estimates, which is the least stable statistic.
- Floors cost about no accuracy and remove every leak of bad food or bad service into Must Go.
- A and A-z are tied; percentiles were chosen because they are distribution-free and easy to explain.

Tier shares under A with floors: Avoid 10% (before the net-negative condition), OK 45%, Good 33%, Must Go 11%, Life Changing 0.7% (before the exceptional-language test).

## Q10: relative "exceptional language" with a margin of error (`sim/exceptional_sim.py`)

- Setup: true exceptional share ~ Beta(mean 8%, SD 6%). The bar is the P90 of peers' shrunk shares (≈ 15.5%). 300 reps.

| Criterion | Pass rate | Precision | Recall |
|---|---|---|---|
| E1: ≥ 10 exceptional Reviews and share ≥ P90 | 0.098 | 0.811 | 0.791 |
| **E2: P(true share > P90) ≥ 0.90, peer-fitted Beta prior** | 0.054 | **0.975** | 0.525 |
| E3: Wilson 95% lower bound ≥ P90 | 0.050 | 0.983 | 0.488 |
| E4: share ≥ P90 and 95% margin of error ≤ 5 pp | 0.054 | 0.825 | 0.447 |

Minimum text-bearing Reviews to pass, by true share:

| True share | E2 | E3 | E4 |
|---|---|---|---|
| 20% | 178 | 233 | 246 |
| 25% | 62 | 46 | 289 |
| 30% | 36 | 22 | 323 |

- A fixed margin of error (E4) controls precision, not the distance above the bar. It is less precise, and it demands more Reviews at higher shares.
- E2 is chosen: it has no absolute count, it adapts to the distance above the bar, and it matches the shrinkage used elsewhere.

## Assumptions to check against real data

- The mention rates, positivity bias and Aspect correlations above.
- Real θ distributions: this also sets the provisional cut-offs.
- The real distribution of exceptional shares by Format.
