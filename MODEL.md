# Model specification and interpretation

This document describes the calculations in [`thirlwall_statistical_model.py`](thirlwall_statistical_model.py), version 5. It accompanies the code so that a reader can reproduce the outputs and substitute other assumptions. The model explores what could happen if a mortality-monitoring signal were followed by a retrospective search of staff attendance. It does not assert that the Thirlwall Inquiry prescribed these particular thresholds or that trusts will use this pathway.

For the policy context, see the Inquiry's [recommendations, especially 6, 9, and 10](https://thirlwall.public-inquiry.uk/final-report-chapter/volume-iii/part-three/recommendations/) and [Chapter 35 on data and signals](https://thirlwall.public-inquiry.uk/final-report-chapter/volume-iii/part-two/chapter-35/). The simulation's decision rules and numerical inputs are documented below rather than attributed to the Inquiry.

## Synthetic population and time

| Modelled unit type | Number of units | Mean background deaths per year | Nurses on roster |
| --- | ---: | ---: | ---: |
| Neonatal intensive care (NICU) | 45 | 20 | 100 |
| Local neonatal unit (LNU) | 85 | 4 | 40 |
| Special care unit (SCU) | 45 | 1 | 20 |

These are modelling assumptions, not a unit-by-unit dataset. Each simulated unit has 48 months of history followed by 120 monitoring months. Its underlying annual background rate is redrawn each year from a gamma distribution with mean equal to the table value and coefficient of variation 0.25. The rate is constant within that year; monthly background deaths are Poisson draws with one-twelfth of the annual rate as their mean. Thus deaths fluctuate both through case-mix variation between years and Poisson variation between months.

One pseudorandom generator is seeded with `20261002`. The chance-alarm calculations use 2,000 simulated ten-year paths per rule and unit type. Detection calculations use 10,000 paths per cell. These are Monte Carlo estimates, so rounded values can vary if the seed, software versions, or draw order changes.

## Monitoring rules

For rules A–D, `c` is the death count in the 12-month window under review. `base` is the death count in the preceding 36 months divided by three, with a floor of 0.5 deaths per year. Annual rules check at the end of each monitoring year; monthly rules check a rolling window every month.

| Rule | Alarm condition | Frequency |
| --- | --- | --- |
| A | `c > Poisson.ppf(0.977, base)` | Annual |
| B | `c > Poisson.ppf(0.9987, base)` | Annual |
| C | `c > Poisson.ppf(0.977, base)` | Monthly, rolling 12 months |
| D | `c >= 2 * base` and `c >= 4` | Monthly, rolling 12 months |

The quantiles approximate the named two- and three-sigma checks; the actual decision is the discrete Poisson condition in the table. The checks use each unit's own recent history and do not know its true expected rate.

E10 and E50 are idealised Poisson CUSUM rules for a doubling of deaths. At month `t`, the statistic is updated by `S = max(0, S + x[t] * log(2) - mu[t])`, where `x[t]` is observed deaths and `mu[t]` is the **true** expected background count for that month. The statistic resets to zero after crossing threshold `h`. This perfect knowledge of `mu` is deliberately favourable to the CUSUM and is not available to a real monitoring system.

For each unit type, thresholds are calibrated on one fixed set of 50,000 ten-year null paths, or 500,000 simulated unit-years. E10 targets 0.10 crossings per unit-year and E50 targets 0.02. The code also sweeps targets from 0.20 down to 0.0001 crossings per unit-year. These are *crossing* rates: a year with multiple crossings contributes multiple events to calibration. The rarest target corresponds to only about 50 expected crossings in 500,000 unit-years per type, so its estimated performance has appreciable Monte Carlo uncertainty.

An **alarm unit-year** is a monitoring year with at least one alarm. An **alarm episode** starts when an alarmed check follows a non-alarmed check. Consecutive alarmed checks belong to one episode. These counts are reported separately. Block 1 also prints, for each rule, the share of unit-years with an alarm in each unit type (`alpha_t` below).

## Rota review after an alarm

The synthetic roster persists throughout each unit's ten-year monitoring path. Nurses' attendance fractions are drawn from three values: 0.21 for 50% of nurses, 0.13 for 35%, and 0.27 for 15%. Given a review window with `k` deaths, each nurse's attendance count is drawn independently as `Binomial(k, f_j)`, where `f_j` is her assigned fraction. Episodes with fewer than two deaths do not enter the rota-significance review.

The most-present nurse is then tested three ways. The article calls these the careless, naive and correct tests; the output labels them `careless`, `naive` and `exact-correct` (or `correct`).

1. **Average exposure:** compare her count with `Binomial(k, mean(f))`.
2. **Own exposure, naive:** compare it with `Binomial(k, f_j)` as though she had been named before looking at the rota.
3. **Maximum adjusted:** under this synthetic independent-attendance model, calculate `1 - product_j P(Binomial(k, f_j) < m)`, where `m` is the observed maximum attendance count. This allows for having selected the highest count from the entire roster.

Block 2 also prints, for each rule and unit type, the median number of deaths in a reviewed window and the median attendance of the most-present nurse. The printed nurse-flagging episode and distinct-nurse rates use the *naive own-exposure* test at `p < 0.05`. The maximum-adjusted test is exact **conditional on this model's independent roster probabilities**; it is not a test for an actual rota with fixed shifts, teams, and correlated attendance.

## Offender and detection scenarios

In the detection runs, an offender is added as one nurse on the roster with attendance fraction 0.21. She is present at every death she causes and may also be present at background deaths. Her effect is an *expected* four or seven extra deaths during the first 12 monitoring months; the number and timing of those deaths are Poisson draws. A separate robustness run assigns exactly four extra deaths randomly across those months.

**Detection means that the unit alarms during those first 12 months**, regardless of whether the offender's deaths caused the alarm. Identification of the offender by the rota review is a distinct result. Each detection cell also has a separate background run with no offender, showing how often the same rule would have alarmed anyway. The detection calculation keeps all 48 history months, and CUSUM calibration remains on 120-month paths. Only the detection *checks* stop after month 12. The current script still generates complete unit paths, preserving its random-number sequence.

## Base-rate calculations and output sections

The model evaluates 1, 3, 10, and 30 offender-years per 10,000 unit-years. These are **scenarios, not estimates of actual prevalence**. With `p` as a scenario fraction, `n_t` as the count of units of type `t`, `alpha_t` as the chance-alarm unit-year rate, and `d_t` as the +4 detection probability, section 4 calculates:

```text
false alarmed unit-years/year = sum_t n_t * (1 - p) * alpha_t
detected offender-years/year = sum_t n_t * p * d_t
false:true ratio = false alarmed unit-years / detected offender-years
years per detection = 1 / detected offender-years/year
```

The proportional-to-staff sensitivity run uses type-specific scenario weights while holding the national total offender-year rate fixed. Section 5 combines simulated nurse-flagging rates under offender and background paths to estimate the chance that a *naively flagged* nurse is the offender, conditional on this model and its base-rate scenario. It is not a case-specific probability.

Section 6 treats `q` as the share of alarms followed by a rota search and scales nurse-flagging counts for `q = 1, 0.5, 0.25, 0.1`. It does not predict which alarm a manager will pursue. Section 7 removes year-to-year gamma variation and gives the unit its true Poisson baseline as a robustness comparison for C and D. Section 8 uses exactly four offender deaths. Section 9 uses fixed null and offender paths to compare CUSUM thresholds. In section 9, the false-alarm numerator counts *crossings* rather than alarmed unit-years, a slightly different denominator from section 4.

## Scope and ways to challenge the model

The synthetic unit mix, annual rates, staffing levels, attendance independence, rate variation, monitoring thresholds, offender effect, and base-rate scenarios can all be replaced. Real units differ; real rosters contain teams and fixed shifts; expected risks drift; and a real investigation might examine information beyond deaths or decide not to examine a rota at all. The model is intentionally explicit about these choices so that alternative emphases can be run and compared.

The outputs describe consequences of the specified scenarios. They do not establish how any individual hospital behaved, whether any individual caused harm, or what an actual trust will do after an alarm. A useful comparison should identify the changed assumption, keep the outcome definition and denominator clear, and account for simulation uncertainty where event counts are small.
