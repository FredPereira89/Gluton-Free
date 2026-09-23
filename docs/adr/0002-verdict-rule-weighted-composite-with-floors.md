---
status: accepted
---

# The Verdict rule is a weighted composite with floors, not a set of gates

A Tier has to honour two owner intents at once: food and service weigh most, and no counted Aspect may be bad at the top. The rule therefore works in three steps:

1. **Composite:** a weighted mean of each input's percentile among Peers, using the fallback chain Format → Format family → all Lisbon. The inputs are food 30, service 20, Overall stars 15, value 15, consistency 10, ambience 5 and wait 5. Informative-only Aspects are dropped and the weights rescaled.
2. **Tier:** the composite is ranked again among Peers and cut into Tiers.
3. **Floors:** a Restaurant that fails a floor drops to the highest Tier whose floors it meets. Good needs food ≥ P40 and service ≥ P25. Must Go needs food ≥ P75, service ≥ P50 and no counted Aspect below P25.

A simulation study backed this choice over pure gates and over a food-first rule (branch `research/verdict-rule`, `FINDINGS.md`):

| Rule | Accuracy | Test-retest | Must Gos with below-median food |
|---|---|---|---|
| Composite + floors | 0.88 | 0.88 | 0% |
| Pure gates | 0.78 | 0.76 | 8% |

The gates were calibrated to the same Tier shares. They amount to ranking by the worst of several noisy estimates, which makes them unstable, and they ignore the weighting. The full rule is recorded in [Verdict rule: gates, weights, confidence](https://github.com/FredPereira89/Gluton-Free/issues/7).

## Consequences

- Most Tier changes come from a Restaurant's rank among its Peers moving. The only exception is a recurring, recent Red flag, which forces Avoid.
- A Restaurant that is weak on a lightly weighted Aspect can still reach Must Go, unless that Aspect falls below P25.
- Before freezing the weights and floors, re-run the comparison on the real Lisbon baseline.

## Considered Options

- **Pure gates** ("every counted Aspect ≥ P85 for Must Go"): least accurate and least stable. Food and service can only weigh more by getting different bars.
- **Food-first** (food sets the Tier, service demotes it): 2–3% of Must Gos had bad service, and it was less stable.
- **Composite of standardised θ instead of percentiles:** statistically tied. Percentiles won because they make no assumption about how the scores are distributed, and "food at P80" is easy to explain.
