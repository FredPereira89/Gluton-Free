"""Simulation study: how should per-Aspect signals combine into a Tier?

Pre-registered design (fixed before running):
  Synthetic Format of N Restaurants with latent Aspect quality q ~ N(0, R) (shared factor).
  Text-bearing Review count ~ lognormal (median ~250, min 15).
  Each Review mentions an Aspect with an Aspect-specific rate (wait: mentioned more when bad).
  Mentioned score = clip(round(0.7 + 0.6 q + e), -2, 2), e ~ N(0, sd_i), sd_i from a latent consistency.
  Rollup: empirical-Bayes shrink to the Format mean (k=10); consistency = shrunk SD of per-Review stance.
  Percentile = mid-rank within the Format.

Rules compared (all targeting the same Tier shares):
  A    weighted composite of Aspect percentiles, re-ranked, + floors
  A-z  weighted composite of standardised theta, re-ranked, + floors
  A0   weighted composite of percentiles, no floors
  B    pure gates == rank by the minimum counted-Aspect percentile
  C    food-first: food percentile sets the Tier; service < P25 demotes one level

Metrics: accuracy vs the rule's own noise-free Tier, test-retest agreement (independent second
Review draw), bad-service / bad-food rate among Must Go+, Spearman of Tier with true food vs ambience.
"""
import numpy as np
from scipy.stats import rankdata, spearmanr

ASPECTS = ["food", "service", "ambience", "value", "wait", "consistency"]
W = np.array([0.35, 0.25, 0.10, 0.12, 0.06, 0.12])
MENTION = np.array([0.75, 0.55, 0.25, 0.30, 0.08, np.nan])  # consistency derived
# Tier cut-offs on the composite percentile: Avoid <10, OK <45, Good <85, Must Go <98, LC >=98
CUTS = [0.10, 0.45, 0.85, 0.98]
TIERS = ["Avoid", "OK", "Good", "Must Go", "LC"]
K = 10.0


def pct(x):
    return (rankdata(x) - 0.5) / len(x)


def tier_from_pct(p):
    return np.searchsorted(CUTS, p, side="right")


def latent(rng, n_rest):
    rho = 0.35
    cov = np.full((6, 6), rho) + np.eye(6) * (1 - rho)
    return rng.multivariate_normal(np.zeros(6), cov, size=n_rest)


def review_counts(rng, n_rest):
    return np.maximum(15, rng.lognormal(np.log(250), 1.0, n_rest).astype(int))


def observe(rng, q, n):
    """Return shrunk theta per Aspect (N x 6) from one draw of Reviews."""
    N = len(q)
    theta = np.zeros((N, 6))
    sums = np.zeros((N, 5)); cnts = np.zeros((N, 5))
    stance_sd = np.zeros(N); stance_n = np.zeros(N)
    noise_sd = 1.0 * np.exp(-0.35 * q[:, 5])  # consistent places have less Review-to-Review spread
    for i in range(N):
        m = n[i]
        rates = MENTION[:5].copy()
        rates[4] = 0.04 + 0.12 * (q[i, 4] < -0.5)  # wait mostly mentioned when bad
        mention = rng.random((m, 5)) < rates
        raw = 0.7 + 0.6 * q[i, :5] + rng.normal(0, noise_sd[i], (m, 5))
        s = np.clip(np.round(raw), -2, 2)
        s = np.where(mention, s, np.nan)
        sums[i] = np.nansum(s, axis=0); cnts[i] = mention.sum(axis=0)
        st = np.nanmean(s, axis=1)
        st = st[~np.isnan(st)]
        stance_sd[i] = st.std(ddof=1) if len(st) > 2 else np.nan
        stance_n[i] = len(st)
    mu = sums.sum(0) / cnts.sum(0)
    theta[:, :5] = (sums + K * mu) / (cnts + K)
    # consistency: higher = more consistent; shrink -SD toward the Format mean with k=20
    c = -stance_sd
    cmu = np.nanmean(c)
    c = np.where(np.isnan(c), cmu, c)
    theta[:, 5] = (stance_n * c + 20 * cmu) / (stance_n + 20)
    return theta


def rule_A(P, counted, floors=True, Z=None):
    w = W * counted
    base = Z if Z is not None else P
    comp = (base * w).sum(1) / w.sum()
    t = tier_from_pct(pct(comp))
    if not floors:
        return t
    food, serv = P[:, 0], P[:, 1]
    minc = np.where(counted, P, 1).min(1)
    ok_mg = (food >= 0.75) & (serv >= 0.50) & (minc >= 0.25)
    ok_lc = ok_mg & (food >= 0.98)
    ok_good = (food >= 0.40) & (serv >= 0.25)
    t = np.where((t == 4) & ~ok_lc, 3, t)
    t = np.where((t == 3) & ~ok_mg, 2, t)
    t = np.where((t == 2) & ~ok_good, 1, t)
    return t


def rule_B(P, counted):
    minc = np.where(counted, P, 1).min(1)
    return tier_from_pct(pct(minc))


def rule_C(P, counted):
    t = tier_from_pct(P[:, 0])
    return np.where(P[:, 1] < 0.25, np.maximum(t - 1, 0), t)


def apply_rules(theta, counted):
    P = np.column_stack([pct(theta[:, j]) for j in range(6)])
    Z = (theta - theta.mean(0)) / theta.std(0)
    return {
        "A": rule_A(P, counted),
        "A-z": rule_A(P, counted, Z=Z),
        "A0": rule_A(P, counted, floors=False),
        "B": rule_B(P, counted),
        "C": rule_C(P, counted),
    }


def run(reps=100, N=300, counted=np.ones(6, bool), seed=1):
    rng = np.random.default_rng(seed)
    out = {r: {k: [] for k in ["acc", "acc_top", "retest", "badserv", "badfood", "rho_food", "rho_amb", "share_top", "acc_small"]}
           for r in ["A", "A-z", "A0", "B", "C"]}
    for _ in range(reps):
        q = latent(rng, N)
        n = review_counts(rng, N)
        truth = apply_rules(q, counted)
        est1 = apply_rules(observe(rng, q, n), counted)
        est2 = apply_rules(observe(rng, q, n), counted)
        qp = np.column_stack([pct(q[:, j]) for j in range(6)])
        small = n < 60
        for r in out:
            t, t2, tt = est1[r], est2[r], truth[r]
            top = t >= 3
            o = out[r]
            o["acc"].append((t == tt).mean())
            o["acc_top"].append(((t >= 3) == (tt >= 3)).mean())
            o["retest"].append((t == t2).mean())
            o["badserv"].append((qp[top, 1] < 0.25).mean() if top.any() else np.nan)
            o["badfood"].append((qp[top, 0] < 0.50).mean() if top.any() else np.nan)
            o["rho_food"].append(spearmanr(t, q[:, 0])[0])
            o["rho_amb"].append(spearmanr(t, q[:, 2])[0])
            o["share_top"].append(top.mean())
            o["acc_small"].append((t[small] == tt[small]).mean() if small.any() else np.nan)
    return out


def report(out, title):
    print(f"\n=== {title} ===")
    print(f"{'rule':5} {'acc':>6} {'top/not':>8} {'retest':>7} {'acc n<60':>9} {'MG+ bad serv':>13} {'MG+ bad food':>13} {'rho food':>9} {'rho amb':>8} {'MG+ share':>10}")
    for r, o in out.items():
        m = {k: np.nanmean(v) for k, v in o.items()}
        print(f"{r:5} {m['acc']:6.3f} {m['acc_top']:8.3f} {m['retest']:7.3f} {m['acc_small']:9.3f} {m['badserv']:13.3f} {m['badfood']:13.3f} {m['rho_food']:9.3f} {m['rho_amb']:8.3f} {m['share_top']:10.3f}")


if __name__ == "__main__":
    report(run(), "All Aspects counted (e.g. Casual contemporary), N=300 peers, 100 reps")
    tasca = np.array([1, 1, 0, 1, 1, 1], bool)
    report(run(counted=tasca, seed=2), "Tasca profile (ambience informative-only), N=300, 100 reps")
    report(run(N=40, seed=3, reps=200), "Small Format, N=40 peers, 200 reps")
