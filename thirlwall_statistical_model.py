"""
Thirlwall Statistical Model
===========================

Companion code to "The Arithmetic of Suspicion", an analysis of what follows if the
Thirlwall Inquiry's recommendations on mortality monitoring and on suspicion of
deliberate harm are joined together (Rob Goudie, October 2026).

Repository:      https://github.com/Elevation9184/thirlwall-statistical-model
Technical notes: README.md in the same repository.

What it is
----------
A statistical model of neonatal deaths, staff rotas and mortality-monitoring rules
across England and Wales, evaluated by Monte Carlo simulation, with exact binomial
calculations for the rota tests. It asks two questions:

  1. If a mortality alarm is followed by a look at the rota, how often does chance
     alone put a nurse in the frame?
  2. What is an alarm worth as evidence of deliberate harm?

Running it
----------
    pip install -r requirements.txt
    python thirlwall_statistical_model.py            # full run, about 2 to 3 minutes
    python thirlwall_statistical_model.py --quick    # reduced run, under 20 seconds, noisier

Numba, if installed, compiles the CUSUM loops. If it is not installed, the code falls
back to plain NumPy and gives identical results. How much Numba saves depends on the
machine; README.md gives measured run times.

The full run with the default seed reproduces every figure in the article. Each block
of output is labelled with the part of the article it supports.

Changing the assumptions
------------------------
All inputs are set in the block headed "Model inputs" below: unit numbers, death rates,
staffing, shift patterns, year-to-year variation, monitoring rules, the offender's
effect and the base rates. They are modelling assumptions anchored to published
national totals; README.md gives the sources and the reasoning.

Licence: MIT (see LICENSE).
"""
from time import perf_counter

_run_start = perf_counter()

import argparse
import numpy as np
from scipy import stats
try:
    from numba import njit
except ImportError:
    njit = None

parser = argparse.ArgumentParser(description="Thirlwall Statistical Model")
parser.add_argument("--quick", action="store_true",
                    help="reduced run (about a tenth of the simulations): fast but noisier")
parser.add_argument("--seed", type=int, default=20261002,
                    help="random seed (default reproduces the article's figures)")
ARGS = parser.parse_args()

rng = np.random.default_rng(ARGS.seed)

# ======================= Model inputs =======================
# Unit types: number of units, mean deaths a year, nurses on the roster
TYPES = {"NICU": dict(n=45, mean=20.0, staff=100),
         "LNU":  dict(n=85, mean=4.0,  staff=40),
         "SCU":  dict(n=45, mean=1.0,  staff=20)}
CV = 0.25; K = 1 / CV**2               # year-to-year variation in each unit's death rate
PRE, MON = 48, 120                      # months of history, months of monitoring
YEARS = MON / 12
REPS = 2000                             # simulated units per type, chance-alarm runs
DET_REPS = 10000                        # simulated units per cell, detection runs
EXACT = False                           # set by the exact-count robustness run
# Shift exposure: full time, part time, extra shifts; and the share of staff in each
EXPOSURE = np.array([0.21, 0.13, 0.27]); EXP_P = [0.5, 0.35, 0.15]
OFFENDER_F = 0.21                       # offender works a full-time pattern
RULES = ["A", "B", "C", "D", "E10", "E50"]
LABEL = {"A": "Annual check, 2-sigma", "B": "Annual check, 3-sigma",
         "C": "Rolling 12m, monthly, 2-sigma", "D": "Rolling 12m, monthly, doubling heuristic",
         "E10": "Risk-adjusted CUSUM, 1 false alarm per 10 unit-years",
         "E50": "Risk-adjusted CUSUM, 1 false alarm per 50 unit-years"}
BASE_RATES = (1, 3, 10, 30)             # offender-years per 10,000 unit-years
Q = (1, .5, .25, .1)                    # share of alarms followed by a rota search
N_CAL = 50000                           # fixed null paths per type for CUSUM calibration
N_DET = 50000                           # fixed paths per type for the threshold sweep
if ARGS.quick:
    REPS, DET_REPS, N_CAL, N_DET = 200, 1000, 5000, 5000
# ============================================================

# ---------------- simulation of one unit ----------------
def sim_unit(mean, extra=0.0):
    """Return background deaths, offender deaths, and true expected background per month."""
    rates = mean * rng.gamma(K, 1 / K, size=(PRE + MON) // 12)
    mu = np.repeat(rates / 12, 12)
    bg = rng.poisson(mu)
    off = np.zeros_like(bg)
    if extra:
        if EXACT:
            off[PRE:PRE + 12] = rng.multinomial(int(extra), [1 / 12] * 12)
        else:
            off[PRE:PRE + 12] = rng.poisson(extra / 12, size=12)
    return bg, off, mu

# ---------------- CUSUM calibration ----------------
LN2 = np.log(2)
def cusum_alarm_years(mean, h, reps=4000):
    """Fraction of monitoring unit-years with >=1 alarm, in control, for threshold h."""
    rates = mean * rng.gamma(K, 1 / K, size=(reps, MON // 12))
    mu = np.repeat(rates / 12, 12, axis=1)
    x = rng.poisson(mu)
    S = np.zeros(reps); alarmed = np.zeros((reps, MON // 12), bool)
    for t in range(MON):
        S = np.maximum(0, S + x[:, t] * LN2 - mu[:, t])
        a = S >= h
        alarmed[a, t // 12] = True
        S[a] = 0
    return alarmed.mean()

def make_paths(mean, n, months, extra=0.0):
    rates = mean * rng.gamma(K, 1 / K, size=(n, max(months // 12, 1)))
    mu = np.repeat(rates / 12, 12, axis=1)[:, :months]
    x = rng.poisson(mu)
    if extra:
        x = x + rng.poisson(extra / 12, size=(n, months))
    return x, mu

def _cusum_run_numpy(inc, h):
    """Vectorised fallback for CUSUM paths when Numba is unavailable."""
    n, T = inc.shape
    S = np.zeros(n); count = np.zeros(n); first = np.full(n, np.inf)
    for t in range(T):
        S = np.maximum(0, S + inc[:, t])
        a = S >= h
        count += a
        first[a & np.isinf(first)] = t
        S[a] = 0
    return count, first

def _crossing_total_numpy(inc, h):
    """Count all crossings without allocating per-path first-crossing arrays."""
    S = np.zeros(inc.shape[0]); total = 0
    for t in range(inc.shape[1]):
        S = np.maximum(0.0, S + inc[:, t])
        alarm = S >= h
        total += int(alarm.sum())
        S[alarm] = 0.0
    return total

def _cusum_run_loop(inc, h):
    """Path-major loop; Numba compiles this when installed."""
    n, months = inc.shape
    count = np.zeros(n); first = np.full(n, np.inf)
    for i in range(n):
        S = 0.0
        for t in range(months):
            S = max(0.0, S + inc[i, t])
            if S >= h:
                count[i] += 1.0
                if first[i] == np.inf:
                    first[i] = t
                S = 0.0
    return count, first

def _crossing_total_loop(inc, h):
    n, months = inc.shape
    total = 0
    for i in range(n):
        S = 0.0
        for t in range(months):
            S = max(0.0, S + inc[i, t])
            if S >= h:
                total += 1
                S = 0.0
    return total

if njit is not None:
    _cusum_run_jit = njit(cache=True)(_cusum_run_loop)
    _crossing_total_jit = njit(cache=True)(_crossing_total_loop)
else:
    _cusum_run_jit = _crossing_total_jit = None

def cusum_run(x, mu, h):
    """Return crossings per path and first-crossing month (inf if none)."""
    inc = x * LN2 - mu
    if _cusum_run_jit is not None:
        return _cusum_run_jit(inc, h)
    return _cusum_run_numpy(inc, h)

# These paths are reused at every calibration threshold; compute increments once.
NULL_INC = {}
for t, T in TYPES.items():
    x_null, mu_null = make_paths(T["mean"], N_CAL, MON)
    NULL_INC[t] = x_null * LN2 - mu_null
del x_null, mu_null

def crossing_rate(t, h):
    inc = NULL_INC[t]
    if _crossing_total_jit is not None:
        total = _crossing_total_jit(inc, h)
    else:
        total = _crossing_total_numpy(inc, h)
    return total / (N_CAL * YEARS)

def calibrate(t, target):
    lo, hi = np.log(0.05), np.log(60.0)
    for _ in range(30):
        mid = (lo + hi) / 2
        if crossing_rate(t, np.exp(mid)) > target:
            lo = mid
        else:
            hi = mid
    return float(np.exp(hi))

H = {}
for tag, target in (("E10", 0.10), ("E50", 0.02)):
    for t in TYPES:
        H[(tag, t)] = calibrate(t, target)

# ---------------- alarm checks ----------------
def checks(x, rule, mu=None, t_type=None, monitor_months=MON):
    """List of (monitoring_month, alarmed, window_start_abs, window_end_abs)."""
    out = []
    if rule in ("A", "B", "C", "D"):
        cs = np.concatenate([[0], np.cumsum(x[:PRE + monitor_months])])
    if rule in ("A", "B"):
        q = 0.977 if rule == "A" else 0.9987
        for y in range(monitor_months // 12):
            t1 = PRE + 12 * y + 12
            c = cs[t1] - cs[t1 - 12]
            base = max((cs[t1 - 12] - cs[t1 - 48]) / 3, 0.5)
            out.append((12 * y + 11, c > stats.poisson.ppf(q, base), t1 - 12, t1))
    elif rule in ("C", "D"):
        t1 = np.arange(PRE + 1, PRE + monitor_months + 1)
        c = cs[t1] - cs[t1 - 12]
        base = np.maximum((cs[t1 - 12] - cs[t1 - 48]) / 3, 0.5)
        al = c > stats.poisson.ppf(0.977, base) if rule == "C" else (c >= 2 * base) & (c >= 4)
        out = [(m, a, s - 12, s) for m, a, s in zip(t1 - PRE - 1, al, t1)]
    else:  # CUSUM with perfect risk adjustment; window = months since last reset
        h = H[(rule, t_type)]
        S, start = 0.0, PRE
        for t in range(PRE, PRE + monitor_months):
            S = max(0.0, S + x[t] * LN2 - mu[t])
            if S == 0.0:
                start = t + 1
            a = S >= h
            out.append((t - PRE, a, start if a else None, t + 1))
            if a:
                S, start = 0.0, t + 1
    return out

def episodes(chk):
    eps, prev = [], False
    for m, a, s, e in chk:
        if a and not prev:
            eps.append((m, s, e))
        prev = a
    return eps

# ---------------- rota tests ----------------
def exact_max_tail(k, f, m):
    """P(max_j Bin(k, f_j) >= m), exact, conditional on the roster f."""
    return 1 - np.prod(stats.binom.cdf(m - 1, k, f))

def rota_review(f, presence_counts, k):
    i = int(presence_counts.argmax()); top = presence_counts[i]
    p_avg = stats.binom.sf(top - 1, k, f.mean())
    p_own = stats.binom.sf(top - 1, k, f[i])
    p_adj = exact_max_tail(k, f, top)
    return i, top, p_avg, p_own, p_adj

# ---------------- 1 & 2: chance alarms, joined rota, persistent rosters ----------------
per = {}   # per (rule, type): dict of rates
for r in RULES:
    for t, T in TYPES.items():
        uy = ep = 0; sig_own = sig_avg = sig_adj = n_rev = 0; distinct = 0
        for _ in range(REPS):
            bg, off, mu = sim_unit(T["mean"])
            f = rng.choice(EXPOSURE, size=T["staff"], p=EXP_P)          # persistent roster
            chk = checks(bg, r, mu, t)
            uy += len({m // 12 for m, a, *_ in chk if a})
            flagged = set()
            for m, s, e in episodes(chk):
                ep += 1
                k = int(bg[s:e].sum())
                if k < 2:
                    continue
                cnt = rng.binomial(k, f)
                i, top, pa, po, pj = rota_review(f, cnt, k)
                n_rev += 1; sig_avg += pa < .05; sig_own += po < .05; sig_adj += pj < .05
                if po < .05:
                    flagged.add(i)
            distinct += len(flagged)
        unit_years = REPS * YEARS
        per[(r, t)] = dict(alpha=uy / unit_years, ep=ep / unit_years,
                           rev=n_rev / unit_years,
                           s_avg=sig_avg / max(n_rev, 1), s_own=sig_own / max(n_rev, 1),
                           s_adj=sig_adj / max(n_rev, 1),
                           flag_ep=sig_own / unit_years, flag_distinct=distinct / unit_years)

def sysw(r, key):            # system total per year
    return sum(TYPES[t]["n"] * per[(r, t)][key] for t in TYPES)
def sysshare(r, key):        # system-weighted share among reviewed episodes
    num = sum(TYPES[t]["n"] * per[(r, t)]["rev"] * per[(r, t)][key] for t in TYPES)
    return num / sysw(r, "rev")

print("=== 1. Chance alarms per year, England and Wales   [article: Step one, table of rules] ===")
for t in TYPES:
    if ("E10", t) in H:
        print(f"   CUSUM h: {t} E10={H[('E10', t)]:.2f} E50={H[('E50', t)]:.2f}")
for r in RULES:
    print(f"{r:4s} {LABEL[r]:55s} alarm unit-yrs {sysw(r,'alpha'):5.1f}  episodes {sysw(r,'ep'):5.1f}")

print("\n=== 2. Rota review of chance alarms, system-weighted shares   [article: Step two, table] ===")
for r in RULES:
    print(f"{r:4s} careless {sysshare(r,'s_avg'):.2f}  naive {sysshare(r,'s_own'):.2f}  "
          f"exact-correct {sysshare(r,'s_adj'):.3f}  | flag episodes/yr {sysw(r,'flag_ep'):5.1f}  "
          f"distinct nurses/yr {sysw(r,'flag_distinct'):5.1f}")
    for t in TYPES:
        d = per[(r, t)]
        print(f"       {t}: careless {d['s_avg']:.2f} naive {d['s_own']:.2f} correct {d['s_adj']:.3f}")

# ---------------- 3: detection with an offender on the roster ----------------
print("\n=== 3. Offender adds expected deaths for 12 months; caught within 12 months [bg = no offender]   [article: Step three, detection table and background result] ===")
det = {}
for extra in (4, 7):
    for r in RULES:
        row = []
        for t, T in TYPES.items():
            hit = top_off = flag_off = flag_any = 0
            reps = DET_REPS
            for _ in range(reps):
                bg, off, mu = sim_unit(T["mean"], extra)
                x = bg + off
                f = rng.choice(EXPOSURE, size=T["staff"] - 1, p=EXP_P)
                f = np.append(f, OFFENDER_F)            # offender is the last nurse
                chk = checks(x, r, mu, t, monitor_months=12)
                first = next(((m, s, e) for m, a, s, e in chk if a), None)
                if first is None or first[0] >= 12:
                    continue
                hit += 1
                m, s, e = first
                kb, ko = int(bg[s:e].sum()), int(off[s:e].sum())
                k = kb + ko
                if k < 2:
                    continue
                cnt = rng.binomial(kb, f) + rng.binomial(ko, f)
                cnt[-1] = rng.binomial(kb, OFFENDER_F) + ko     # present at all her own
                i, top, pa, po, pj = rota_review(f, cnt, k)
                if po < .05:
                    flag_any += 1
                    flag_off += (i == len(f) - 1)
            bg_hit = 0
            for _ in range(reps):
                bg0, _, mu0 = sim_unit(T["mean"])
                f0 = next((m for m, a, *_ in checks(bg0, r, mu0, t, monitor_months=12) if a), None)
                bg_hit += f0 is not None and f0 < 12
            det[(extra, r, t)] = dict(d=hit / reps, bg=bg_hit / reps,
                                      flag_off=flag_off / max(hit, 1),
                                      flag_any=flag_any / max(hit, 1))
            row.append(f"{t}: {hit/reps:.2f} [bg {bg_hit/reps:.2f}] (offender flagged {flag_off/max(hit,1):.2f})")
        print(f"+{extra} {r:4s} " + "  ".join(row))

# ---------------- 4: predictive value ----------------
def false_true(r, p_10k, weights=None):
    p = p_10k / 1e4
    w = weights or {t: 1.0 for t in TYPES}
    false_ = sum(TYPES[t]["n"] * per[(r, t)]["alpha"] * (1 - p * w[t]) for t in TYPES)
    true_ = sum(TYPES[t]["n"] * p * w[t] * det[(4, r, t)]["d"] for t in TYPES)
    return false_ / true_, 1 / true_

print("\n=== 4. Falsely flagged unit-years per detected offender-year (+4); years per detection   [article: Step three, base-rate table] ===")
for r in RULES:
    print(f"{r:4s} " + "  ".join(f"p={p}: {false_true(r,p)[0]:6.0f}:1 ({false_true(r,p)[1]:4.0f}y)"
                                 for p in BASE_RATES))
# prevalence proportional to staff, same national total
tot_staff = sum(T["n"] * T["staff"] for T in TYPES.values())
tot_units = sum(T["n"] for T in TYPES.values())
w_staff = {t: T["staff"] * tot_units / tot_staff for t, T in TYPES.items()}
print("   prevalence proportional to staff, p=3/10k: "
      + "  ".join(f"{r}: {false_true(r,3,w_staff)[0]:.0f}:1" for r in RULES))

# ---------------- 5: individual posterior ----------------
print("\n=== 5. P(flagged nurse is the offender | alarm and naive flag), +4   [article: Step three, closing paragraph] ===")
for r in RULES:
    vals = []
    for p_10k in BASE_RATES:
        p = p_10k / 1e4
        num = sum(TYPES[t]["n"] * p * det[(4, r, t)]["d"] * det[(4, r, t)]["flag_off"] for t in TYPES)
        den_true = sum(TYPES[t]["n"] * p * det[(4, r, t)]["d"] * det[(4, r, t)]["flag_any"] for t in TYPES)
        den_false = sum(TYPES[t]["n"] * (1 - p) * per[(r, t)]["flag_ep"] for t in TYPES)
        vals.append(num / (den_true + den_false))
    print(f"{r:4s} " + "  ".join(f"p={b}: {v*100:.2f}%" for b, v in zip(BASE_RATES, vals)))

# ---------------- 6: nurses in the frame by q ----------------
print("\n=== 6. Nurse-flagging episodes per year (distinct nurses) by q   [article: Step three, q table] ===")
for r in RULES:
    fe, fd = sysw(r, "flag_ep"), sysw(r, "flag_distinct")
    print(f"{r:4s} " + "  ".join(f"q={q}: {fe*q:.1f} ({fd*q:.1f})" for q in Q))

# ---------------- 7: robustness ----------------
print("\n=== 7. Robustness: pure Poisson, true baseline known   [article: Step one, robustness check] ===")
for r in ("C", "D"):
    tot = 0
    for t, T in TYPES.items():
        uy = 0
        for _ in range(REPS):
            x = rng.poisson(np.full(PRE + MON, T["mean"] / 12))
            cs = np.concatenate([[0], np.cumsum(x)])
            t1 = np.arange(PRE + 1, PRE + MON + 1)
            c = cs[t1] - cs[t1 - 12]
            al = c > stats.poisson.ppf(0.977, T["mean"]) if r == "C" else (c >= 2 * T["mean"]) & (c >= 4)
            uy += len({(m - PRE - 1) // 12 for m, a in zip(t1, al) if a})
        tot += T["n"] * uy / (REPS * YEARS)
    print(f"{r}: {tot:.1f} alarm unit-years per year")


# ---------------- 8: exact-count robustness ----------------
def exact_robustness():
    global EXACT
    EXACT = True
    out = {}
    for r in RULES:
        d = {}
        for t, T in TYPES.items():
            hit = 0
            for _ in range(DET_REPS // 2):
                bg, off, mu = sim_unit(T["mean"], 4)
                first = next((m for m, a, *_ in checks(bg + off, r, mu, t, monitor_months=12) if a), None)
                hit += first is not None and first < 12
            d[t] = hit / (DET_REPS // 2)
        p = 3e-4
        false_ = sum(TYPES[t]["n"] * per[(r, t)]["alpha"] * (1 - p) for t in TYPES)
        true_ = sum(TYPES[t]["n"] * p * d[t] for t in TYPES)
        out[r] = false_ / true_
    EXACT = False
    return out
print("\n=== 8. Exactly 4 offender deaths, not an expected 4, p = 3/10k   [article: Step three, exact-count result] ===")
ex = exact_robustness()
print("  " + "  ".join(f"{r}: {ex[r]:.0f}:1 (expected-4 model {false_true(r,3)[0]:.0f}:1)" for r in RULES))

# ---------------- 9: CUSUM threshold sweep (fixed paths) ----------------
OFF = {t: make_paths(T["mean"], N_DET, 12, extra=4) for t, T in TYPES.items()}
BG = {t: make_paths(T["mean"], N_DET, 12) for t, T in TYPES.items()}
print("\n=== 9. Idealised CUSUM threshold sweep, fixed paths, +4 expected deaths, p = 3/10k   [article: Step three, trade-off chart] ===")
print("  false alarms per unit-year | national false alarms/yr | caught within 12m NICU LNU SCU | LNU with no offender | false:true | years per detection")
SWEEP = []
for target in (0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 0.0005, 0.0002, 0.0001):
    alarms, dets, bgs = 0.0, {}, {}
    for t, T in TYPES.items():
        h = calibrate(t, target)
        alarms += T["n"] * crossing_rate(t, h)
        dets[t] = np.mean(cusum_run(*OFF[t], h)[1] < 12)
        bgs[t] = np.mean(cusum_run(*BG[t], h)[1] < 12)
    true_ = sum(TYPES[t]["n"] * 3e-4 * dets[t] for t in TYPES)
    SWEEP.append((target, alarms, dets, bgs, alarms / true_, 1 / true_))
    print(f"  1 in {1/target:6.0f} | {alarms:6.2f} | {dets['NICU']:.3f} {dets['LNU']:.3f} {dets['SCU']:.3f} | "
          f"{bgs['LNU']:.3f} | {alarms/true_:6.0f}:1 | {1/true_:6.0f}")

print(f"\nTotal elapsed wall time: {perf_counter() - _run_start:.2f} s "
      f"({'Numba' if njit is not None else 'NumPy fallback, Numba not installed'})")
