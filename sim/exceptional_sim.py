"""Q10: a relative 'recurring exceptional language' criterion with a controlled margin of error.

p_i = true share of a Restaurant's text-bearing Reviews marked exceptional (food/overall),
p_i ~ Beta(mean 0.08, sd 0.06) across the Format. Bar = P90 of peers' shrunk shares.
Criteria:
  E1  count >= 10 and shrunk share >= bar                       (absolute count; the old proposal)
  E2  P(p_i > bar | data) >= 0.90  (Beta posterior, prior fitted to peers)
  E3  Wilson 95% lower bound >= bar
  E4  shrunk share >= bar and 95% margin of error <= 5 pp
Metrics: precision (passes AND truly above the true P90), recall, pass rate.
"""
import numpy as np
from scipy.stats import beta as B, norm

rng = np.random.default_rng(7)
m, sd = 0.08, 0.06
k = m * (1 - m) / sd**2 - 1
a0, b0 = m * k, (1 - m) * k


def wilson_lo(x, n, z=1.96):
    ph = x / n
    c = ph + z * z / (2 * n)
    r = z * np.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n))
    return (c - r) / (1 + z * z / n)


def fit_prior(x, n):
    ph = x / n
    mu, var = ph.mean(), ph.var()
    # subtract binomial noise (method of moments for Beta-binomial)
    var_true = max(var - np.mean(mu * (1 - mu) / n), 1e-5)
    kk = mu * (1 - mu) / var_true - 1
    return mu * kk, (1 - mu) * kk


res = {e: {"prec": [], "rec": [], "pass": []} for e in ["E1", "E2", "E3", "E4"]}
for _ in range(300):
    N = 300
    p = rng.beta(a0, b0, N)
    n = np.maximum(15, rng.lognormal(np.log(250), 1.0, N).astype(int))
    x = rng.binomial(n, p)
    a, b = fit_prior(x, n)
    shr = (x + a) / (n + a + b)
    bar = np.quantile(shr, 0.90)
    true_top = p >= np.quantile(p, 0.90)
    post_gt = B.sf(bar, a + x, b + n - x)
    moe = 1.96 * np.sqrt(shr * (1 - shr) / n)
    crit = {
        "E1": (x >= 10) & (shr >= bar),
        "E2": post_gt >= 0.90,
        "E3": wilson_lo(x, n) >= bar,
        "E4": (shr >= bar) & (moe <= 0.05),
    }
    for e, c in crit.items():
        res[e]["pass"].append(c.mean())
        res[e]["prec"].append((c & true_top).sum() / max(c.sum(), 1))
        res[e]["rec"].append((c & true_top).sum() / true_top.sum())

print(f"prior Beta({a0:.2f},{b0:.2f}); typical bar (P90 of shrunk shares) ~ {bar:.3f}")
print(f"{'crit':4} {'pass rate':>9} {'precision':>9} {'recall':>7}")
for e, r in res.items():
    print(f"{e:4} {np.mean(r['pass']):9.3f} {np.mean(r['prec']):9.3f} {np.mean(r['rec']):7.3f}")

# Minimum text-bearing Reviews needed to pass, for a Restaurant whose observed share is s
bar = 0.155
print(f"\nMinimum text-bearing Reviews to pass, bar = {bar:.1%} (a Restaurant truly at share s):")
print(f"{'s':>6} {'E2 (P>=.90)':>12} {'E3 Wilson':>10} {'E4 MoE<=5pp':>12}")
a, b = a0, b0
for s in [0.18, 0.20, 0.25, 0.30, 0.40]:
    def need(f):
        for nn in range(10, 5000):
            if f(round(s * nn), nn):
                return nn
        return None
    e2 = need(lambda x, nn: B.sf(bar, a + x, b + nn - x) >= 0.90)
    e3 = need(lambda x, nn: wilson_lo(x, nn) >= bar)
    e4 = need(lambda x, nn: (x + a) / (nn + a + b) >= bar and 1.96 * np.sqrt(s * (1 - s) / nn) <= 0.05)
    print(f"{s:6.0%} {e2:12} {e3:10} {e4:12}")
