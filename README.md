# Thirlwall Statistical Model

Code and technical notes behind *The Arithmetic of Suspicion*, an analysis of what follows if the Thirlwall Inquiry's recommendations on mortality monitoring and on suspicion of deliberate harm are joined together.

A mortality chart can tell you where to look. It cannot tell you whom to blame. This model puts numbers on that claim.

## What the model asks

The Thirlwall Inquiry's final report (15 September 2026) asks every trust to monitor deaths of babies and children and to escalate concerning trends (Recommendation 6), and to act at once on any good-faith concern that a member of staff has deliberately harmed a patient (Recommendation 9). The model asks what happens if a statistical alarm from the first is followed by a look at the rota, which can then feed the second:

1. How often does monitoring raise an alarm when nothing is wrong?
2. After an alarm, how often does a nurse look statistically significant by chance?
3. What is an alarm worth as evidence of deliberate harm?

It does not forecast how often trusts will make that step. That is left as an explicit parameter, *q*: the share of alarms followed by a search of the rota.

## Running it

Requires Python 3.9 or later.

```
pip install -r requirements.txt
python thirlwall_statistical_model.py            # full run
python thirlwall_statistical_model.py --quick    # reduced run, noisier
python thirlwall_statistical_model.py --seed 1   # a different random seed
```

The full run with the default seed (20261002) reproduces every figure in the article. Quick mode runs about a tenth of the simulations: its central figures land close to the full run's, but the extreme tail of the threshold sweep becomes unreliable. The run prints its elapsed time at the end.

**Numba.** If [Numba](https://numba.pydata.org/) is installed, the CUSUM loops are compiled; if not, the code falls back to plain NumPy. The results are identical either way. The first run with Numba also spends a few seconds compiling, and caches the result for later runs.

**Run times** measured on a two-core Linux cloud machine with Python 3.13:

| Run | With Numba | NumPy only |
| --- | --- | --- |
| Full | 2.7 minutes | 2.7 minutes |
| Quick | 17 seconds | 17 seconds |

On that machine NumPy's vectorised loops already ran as fast as the compiled ones. Numba may help more elsewhere, depending on the processor and the Python build.

## Where each figure comes from

Each block of output is labelled with the part of the article it supports.

| Output block | What it reports | Article |
| --- | --- | --- |
| 1 | Chance alarms per year, nationally, under each monitoring rule | Step one: table of rules |
| 2 | How often the most-present nurse looks significant under the careless, naive and correct tests | Step two: table |
| 3 | How often a unit with an offender is flagged within a year; how often the rota review names her; background flagging with no offender | Step three: detection table and background result |
| 4 | Falsely flagged unit-years per detected offender-year, at four base rates; staff-weighted sensitivity | Step three: base-rate table |
| 5 | Probability that a flagged nurse is the offender | Step three: closing paragraph |
| 6 | Nurses put in the frame each year, by *q* | Step three: *q* table; The cost side |
| 7 | Chance alarms with no case-mix variation and a known baseline | Step one: robustness check |
| 8 | Exactly four offender deaths instead of an expected four | Step three: exact-count result |
| 9 | Threshold sweep for the idealised chart: false alarms against detection | Step three: trade-off chart |

## Model structure

**Units.** About 175 neonatal units in England and Wales, in three kinds: 45 intensive care units averaging 20 deaths a year, 85 local units averaging 4, and 45 special care units averaging 1. That gives roughly 1,300 deaths a year on units, about three-quarters of the 1,766 neonatal deaths in England and Wales in 2023. The split and the averages are modelling assumptions chosen to match the national total.

**Deaths.** Each unit's death rate varies from year to year with a coefficient of variation of 25% (gamma-distributed), and monthly deaths are Poisson given that rate. Units have four years of history before ten years of monitoring.

**Monitoring rules.**

| Rule | Definition |
| --- | --- |
| A | Year's deaths above the 2-standard-deviation (97.7%) Poisson line, against the previous three years' average; checked once a year |
| B | The same with the 3-standard-deviation (99.87%) line |
| C | Rolling 12-month count above the 2-standard-deviation line, checked monthly |
| D | Rolling 12-month count at least double the previous three years' average, and at least 4; checked monthly. A deliberately simple heuristic |
| E10, E50 | Idealised benchmark: a Poisson CUSUM chart tuned to a doubling of deaths, with perfect risk adjustment (it knows each month's true expected deaths). Calibrated to 1 false alarm per 10 and per 50 unit-years, counting crossings, on one fixed set of 50,000 null paths per unit type |

**Rotas.** Staff numbers follow unit size: 100 nurses in an intensive care unit, 40 in a local unit, 20 in a special care unit. Half work full time (on duty about 21% of the time), 35% part time (about 13%) and 15% pick up extra shifts (about 27%). Each nurse's presence at each death is independent. Each unit keeps the same roster for the whole simulation, so the model counts distinct nurses as well as flagging episodes.

**Rota tests.** After an alarm, the deaths in the triggering window are matched to the rota and the most-present nurse is tested three ways:

- **Careless:** her attendance against the average nurse's share of shifts.
- **Naive:** against her own share, as if she had been named in advance.
- **Correct under this model:** the exact probability that the top nurse on the whole roster would do at least this well, P(max X_j ≥ m) = 1 − ∏ P(X_j < m), with X_j ~ Binomial(k, f_j). Because attendance counts are whole numbers, this test is conservative: about 2% of chance alarms pass it at the nominal 5% level. A real rota, with fixed staffing, teams and night shifts, would need a test built on the rota itself.

**Offender.** In detection runs, one nurse on the roster works a full-time pattern, causes an expected 4 (or 7) extra deaths over twelve months (Poisson), and is present at every death she causes. Detection means the unit is flagged within that year, whether or not her deaths caused the alarm; block 3 also reports how often the same units are flagged with no offender present.

**Base rates.** Four scenarios: 1, 3, 10 and 30 offender-years per 10,000 unit-years. The first two are roughly what the historical record allows; the last two are deliberately pessimistic. A sensitivity run spreads the same national rate in proportion to staff numbers.

## Assumptions and limits

- The unit mix, death rates, staffing and shift patterns are modelling assumptions, anchored to published national totals.
- The monitoring rule the report envisages is unspecified. Rules A to D are simple; rule E is better than any real system can achieve.
- Baselines are recent history, and true rates are held steady apart from year-to-year variation.
- Rotas are simplified: presence at each death is independent. Real clustering of deaths at night and on busy shifts can make chance coincidences more likely.
- Behaviour enters only through *q*, which is shown at four values rather than estimated.
- The base rate is a set of scenarios, not an estimate.
- The tables compare falsely flagged unit-years with detected offender-years; the threshold sweep counts chart crossings. At these alarm rates the two differ by a few per cent at most.
- At the strictest settings of the threshold sweep, calibration rests on as few as 50 simulated crossings, so those points are approximate.
- In the posterior, the offender side counts the first flagged alarm in her year and the background side every flagged episode. At these base rates the asymmetry is negligible.
- Paediatric wards, which the report's monitoring also covers, are not modelled.

## Sources for the inputs

- Neonatal deaths, England and Wales, 2023: [Tommy's, citing ONS](https://www.tommys.org/baby-loss-support/pregnancy-loss-statistics)
- Number of UK neonatal units: [Mother&Baby, citing Bliss](https://motherandbaby.com/baby/baby-care/neonatal-unit-nurse-baby-definition)
- Scottish units: [Scottish Perinatal Network](https://www.perinatalnetwork.nhs.scot/wp-content/uploads/2023/09/SPN-Neonatal-Care-Info_A5_2023_Digital_v3.pdf)
- Thirlwall recommendations: [Recommendations](https://thirlwall.public-inquiry.uk/final-report-chapter/volume-iii/part-three/recommendations/) and [Chapter 35](https://thirlwall.public-inquiry.uk/final-report-chapter/volume-iii/part-two/chapter-35/)
- Statistical background: Green, Gill, Mackenzie, Mortera and Thompson, [*Healthcare serial killer or coincidence?*](https://arxiv.org/abs/2210.00962v1) (Royal Statistical Society, 2022)

## Version history

The model was revised five times after rounds of adversarial review of the code and the article draft. Working versions were named `sim.py` to `sim5.py`; this file is `sim5.py` renamed and documented, with command-line options added and two speed changes: optional Numba compilation of the CUSUM loops, and detection runs that check only the first twelve months of monitoring, the only months whose alarms they use. Its calculations, random-number sequence and default seed are unchanged, and a full run gives the same figures as `sim5.py` to the last digit.

| Version | Main changes |
| --- | --- |
| 1 | Chance alarms under four rules; separate rota model with fixed death counts; unit-level predictive value |
| 2 | Rolling rules checked from the first monitoring month; moving baselines; alarm episodes counted; rota review joined to the triggering alarm, with three tests reported separately; detection by unit type; base rates widened to 1–30 per 10,000; results conditional on *q* |
| 3 | Pooled shares weighted by unit numbers; exact correct test; persistent rosters; offender placed on the rota; idealised CUSUM benchmark; staff-weighted sensitivity |
| 4 | Offender effect labelled as expected deaths, with an exact-count check; 10,000 detection runs per cell; full CUSUM excursion as the review window; threshold sweep |
| 5 | CUSUM calibrated on crossings using fixed null paths; sweep extended to 1 in 10,000; background detection with no offender |

## Licence

MIT. See [LICENSE](LICENSE).
