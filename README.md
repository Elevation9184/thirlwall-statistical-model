# Thirlwall Statistical Model

This repository contains [*The Arithmetic of Suspicion*](The%20Arithmetic%20of%20Suspicion.pdf), its simulation code, and technical notes. The article explores **one statistical interpretation** of what could happen if a mortality-monitoring alarm leads to a retrospective search of staff attendance in the context of the Thirlwall Inquiry's recommendations.

A mortality chart can tell you where to look. It cannot tell you whom to blame. This model quantifies that distinction under explicit assumptions. Its outputs are not evidence about any particular person or unit, or a forecast of how a trust will act. The code is provided so that others can test different assumptions and interpretations.

## What the model asks

The Thirlwall Inquiry's final report (15 September 2026) asks every trust to monitor deaths of babies and children and to escalate concerning trends (Recommendation 6), and to act at once on any good-faith concern that a member of staff has deliberately harmed a patient (Recommendation 9). The model asks what happens if a statistical alarm from the first is followed by a look at the rota, which can then feed the second:

1. How often does monitoring raise an alarm when nothing is wrong?
2. After an alarm, how often does a nurse look statistically significant by chance?
3. How informative is an alarm under different assumed rates of deliberate harm?

It does not forecast how often trusts will make that step. The share of alarms followed by a rota search is an explicit scenario parameter, *q*.

## Files

- [`The Arithmetic of Suspicion.pdf`](The%20Arithmetic%20of%20Suspicion.pdf) — reader-facing article, including the model results and a separate policy discussion.
- [`thirlwall_statistical_model.py`](thirlwall_statistical_model.py) — the complete simulation.
- [`MODEL.md`](MODEL.md) — technical specification, outcome definitions, and limits.
- [`requirements.txt`](requirements.txt) — exact package versions for the reference environment.
- [`example_output.txt`](example_output.txt) — sample full-run output with the default seed, without local paths.
- [`LICENSE`](LICENSE) — the MIT licence.

All deaths and staff attendance records are simulated. No patient or staff data files are needed.

## Running it

The reference environment is Python 3.14.0 with NumPy 2.3.5, SciPy 1.16.3, and Numba 0.63.0. The single [`requirements.txt`](requirements.txt) pins those tested packages. With Python 3.14 active, preferably in a virtual environment, run these commands from this directory:

```text
python -m pip install -r requirements.txt
python thirlwall_statistical_model.py            # full run
python thirlwall_statistical_model.py --quick    # reduced run, noisier
python thirlwall_statistical_model.py --seed 1   # different random seed
```

If `python` selects a different interpreter, use the path or launcher for Python 3.14 instead. The default seed is `20261002`. The full run prints nine numbered sections and its elapsed wall time; [`example_output.txt`](example_output.txt) records the rounded results from the reference environment. The script produces the model outputs used for the article's tables and discussion. The article's staffing and camera discussion also draws on external sources and explicit extrapolations; those claims are not outputs of this simulation. The script does not produce the article's prose or presentation graphics.

Quick mode uses roughly one tenth as many simulations. It is useful for exploring changes, but its estimates are noisier, especially in the rare-event end of the CUSUM threshold sweep. Use the full run for comparisons. Report the seed, software versions, and any changed inputs; another environment may produce different Monte Carlo values.

Numba is included in the reference requirements and compiles the CUSUM loops on first use. The code has a NumPy fallback if Numba is unavailable. Both paths implement the same calculation. Compilation, hardware, and package versions affect elapsed time, which is not a reproducibility target. Observed full-run times were about 1.6 minutes with Numba and 2.0 minutes with the NumPy fallback on a Windows desktop, though the run recorded in [`example_output.txt`](example_output.txt) took about 4 minutes; a two-core Linux machine took about 2.7 minutes in either mode. A quick Linux run took about 17 seconds. These are examples, not promised run times.

## Reading the output

Each block is labelled with the part of the article it supports. [`MODEL.md`](MODEL.md) defines the outcome and denominator for each calculation.

| Output block | What it reports | Article |
| --- | --- | --- |
| 1 | Chance alarms per year, nationally, under each monitoring rule; share of unit-years with an alarm by unit type | Step one: Table 1 and discussion; Figure 1 |
| 2 | How often the most-present nurse looks significant under the average-exposure, naive own-exposure, and maximum-adjusted tests; median deaths reviewed and median top-nurse attendance by unit type | Step two: Table 2; Figure 1 |
| 3 | How often a unit with an offender is flagged within a year; how often the rota review names her; background flagging with no offender | Step three: Table 3 and background result |
| 4 | Each base rate as a rate per nurse-year; falsely flagged unit-years per detected offender-year and national years per detection, at five base rates, with risk in proportion to staff (main case) and equal risk per unit (sensitivity) | Step three: Table 4; Figure 1 |
| 5 | Scenario-based probability that a naively flagged nurse is the offender, under both allocations | Step three: closing paragraph |
| 6 | Nurses put in the frame each year, by *q* | Step three: Table 5; The cost side; Figure 1 |
| 7 | Chance alarms with no case-mix variation and a known baseline | Step one: robustness check |
| 8 | Exactly four offender deaths instead of an expected four, at the neonatal reference | Step three: exact-count result |
| 9 | Threshold sweep for the idealised chart: false alarms against detection, at both reference rates | Step three: Figure 2 |

## Model structure

**Units.** The model simulates 175 neonatal units in England and Wales: 45 intensive care units averaging 20 deaths a year, 85 local units averaging 4, and 45 special care units averaging 1. Together these assumptions yield about 1,300 deaths a year on the simulated units. The counts and rates are not a unit-by-unit dataset.

**Deaths.** Each unit's death rate varies from year to year with a coefficient of variation of 25% (gamma-distributed), and monthly deaths are Poisson given that rate. Units have four years of history before ten years of monitoring.

**Monitoring rules.**

| Rule | Definition |
| --- | --- |
| A | Year's deaths above the 2-standard-deviation (97.7%) Poisson line, against the previous three years' average; checked once a year |
| B | The same with the 3-standard-deviation (99.87%) line |
| C | Rolling 12-month count above the 2-standard-deviation line, checked monthly |
| D | Rolling 12-month count at least double the previous three years' average, and at least 4; checked monthly. A deliberately simple heuristic |
| E10, E50 | Idealised benchmark: a Poisson CUSUM chart tuned to a doubling of deaths, with perfect risk adjustment (it knows each month's true expected deaths). Calibrated to 1 false alarm per 10 and per 50 unit-years, counting crossings, on one fixed set of 50,000 null paths per unit type |

**Rotas.** Staff numbers follow unit size: 100 nurses in an intensive care unit, 40 in a local unit, 20 in a special care unit. Half have a 21% attendance fraction, 35% have 13%, and 15% have 27%. Each nurse's presence at each death is simulated independently. Each unit keeps the same roster throughout its monitoring path, so the model counts distinct nurses as well as flagging episodes.

**Rota tests.** After an alarm, the deaths in the triggering window are matched to the rota and the most-present nurse is tested three ways:

- **Average exposure** (`careless` in the output): compare her attendance with the average nurse's assumed exposure.
- **Own exposure, naive** (`naive` in the output): compare it with her own exposure as though she had been named before looking at the rota.
- **Maximum adjusted** (`exact-correct` or `correct` in the output): under the model's independent-attendance assumption, calculate the probability that the most-present nurse on the whole roster would do at least this well: P(max X_j ≥ m) = 1 − ∏ P(X_j < m), with X_j ~ Binomial(k, f_j). Because attendance counts are whole numbers, this test is conservative at a nominal 5% level. A real rota, with fixed staffing, teams and night shifts, would need a test built on the rota itself.

The nurse-flagging episode and distinct-nurse estimates elsewhere in the output use the **naive own-exposure** test at p < 0.05. The maximum-adjusted test is exact only under the specified synthetic roster model.

**Offender.** In detection runs, one nurse on the roster has a 21% attendance fraction, causes an expected 4 (or 7) extra deaths over the first twelve monitoring months (Poisson), and is present at every death she causes. Detection means the **unit** alarms within that year, whether or not her deaths caused the alarm. Identifying the offender in the rota review is a separate outcome. Block 3 also reports how often a background unit alarms with no offender present. Detection checks stop after month 12, while retaining 48 history months; CUSUM calibration still uses full ten-year null paths.

**Base rates.** Five scenarios: 0.1, 1, 3, 10 and 30 offender-years per 10,000 unit-years. The first two are reference points anchored to the record. The national reference, 0.1, is about one offender-year in 5 million nurse-years: five UK nurses convicted of murdering two or more patients since 1990, over some 25 million nurse-years of published register totals, consistent with the rough 1 in 2 million per nurse-year of Gill, Fenton and Lagnado (2022), after Forrest (1995). The neonatal reference, 1, takes the single (disputed) neonatal case at face value. Rates of 3 to 30 are stress tests. All five are scenarios, not estimates of actual prevalence; [`MODEL.md`](MODEL.md) gives the derivation. Because the references are rates per nurse, the main results spread risk in proportion to each unit's roster; equal risk per unit is reported as a sensitivity check.

## Assumptions and limits

- The unit mix, death rates, staffing and shift patterns are modelling assumptions informed by published national totals.
- The monitoring rule the report envisages is unspecified. Rules A–D are simple choices; rule E is an idealised benchmark given the true monthly expected death count.
- Baselines are recent history, and true rates are held steady apart from year-to-year variation.
- Rotas are simplified: presence at each death is independent. Real clustering of deaths at night and on busy shifts can make chance coincidences more likely.
- Behaviour enters only through *q*, which is shown at four values rather than estimated.
- The base rate is a set of scenarios anchored to the conviction record, not an estimate. Undetected offenders would raise the true rate and wrongful convictions lower it; the national reference also rests on an approximate count of nurse-years, and the neonatal reference on a single disputed case.
- The tables compare falsely flagged unit-years with detected offender-years; the threshold sweep counts chart crossings. These are distinct measures.
- At the strictest settings of the threshold sweep, calibration rests on as few as 50 simulated crossings, so those points are approximate.
- In output block 5, the offender side counts the first flagged alarm in her year, while the background side counts every flagged episode. A check during review, using matched event definitions, found its numerical effect negligible at these base rates (a few hundredths of a percentage point).
- Paediatric wards, which the report's monitoring also covers, are not modelled.

## Sources for the inputs

- Neonatal deaths, England and Wales, 2023: [Tommy's, citing ONS](https://www.tommys.org/baby-loss-support/pregnancy-loss-statistics)
- Number of UK neonatal units: [Mother&Baby, citing Bliss](https://motherandbaby.com/baby/baby-care/neonatal-unit-nurse-baby-definition)
- Scottish units: [Scottish Perinatal Network](https://www.perinatalnetwork.nhs.scot/wp-content/uploads/2023/09/SPN-Neonatal-Care-Info_A5_2023_Digital_v3.pdf)
- Thirlwall recommendations: [Recommendations](https://thirlwall.public-inquiry.uk/final-report-chapter/volume-iii/part-three/recommendations/) and [Chapter 35](https://thirlwall.public-inquiry.uk/final-report-chapter/volume-iii/part-two/chapter-35/)
- Base-rate references: Forrest, [*Nurses Who Systematically Harm Their Patients*](https://journals.sagepub.com/doi/10.1177/096853329500100404) (Medical Law International, 1995); Gill, Fenton and Lagnado, [*Statistical Issues in Serial Killer Nurse Cases*](https://www.mdpi.com/2075-471X/11/5/65) (Laws, 2022)
- NMC register size: [March 2024](https://nmc.org.uk/news/news-and-updates/more-nurses-midwives-and-nursing-associates-in-the-uk-than-ever-before) and [2002–2006](https://data.parliament.uk/DepositedPapers/Files/DEP2007-0319/DEP2007-0319.pdf)
- Statistical background: Green, Gill, Mackenzie, Mortera and Thompson, [*Healthcare serial killer or coincidence?*](https://arxiv.org/abs/2210.00962v1) (Royal Statistical Society, 2022)

## Version history

The model was revised six times during review of the code and article draft. Working versions were named `sim.py` to `sim5.py`; version 6 is the published script itself. The published script adds command-line options, optional Numba compilation of the CUSUM loops, and a shorter checking horizon for the first-year detection runs. The longer null paths used to calibrate CUSUM are retained. The default seed remains `20261002`; [`example_output.txt`](example_output.txt) gives the published reference output.

| Version | Main changes |
| --- | --- |
| 1 | Chance alarms under four rules; separate rota model with fixed death counts; unit-level predictive value |
| 2 | Rolling rules checked from the first monitoring month; moving baselines; alarm episodes counted; rota review joined to the triggering alarm, with three tests reported separately; detection by unit type; base rates widened to 1–30 per 10,000; results conditional on *q* |
| 3 | Pooled shares weighted by unit numbers; maximum-adjusted rota test; persistent rosters; offender placed on the rota; idealised CUSUM benchmark; staff-weighted sensitivity |
| 4 | Offender effect labelled as expected deaths, with an exact-count check; 10,000 detection runs per cell; full CUSUM excursion as the review window; threshold sweep |
| 5 | CUSUM calibrated on crossings using fixed null paths; sweep extended to 1 in 10,000; background detection with no offender |
| 6 | Base rates anchored to the record: national (0.1 per 10,000) and neonatal (1 per 10,000) references added, 3 to 30 kept as stress tests; each rate printed per nurse-year; risk in proportion to staff becomes the main case, equal risk per unit the sensitivity. Simulated alarm and detection rates unchanged |

## Try another interpretation

The main inputs are near the top of the script: `TYPES`, `CV`, `EXPOSURE`, `EXP_P`, `OFFENDER_F`, `BASE_RATES`, and `Q`. Monitoring rules are implemented in `checks()` and the CUSUM calibration. A useful comparison states which assumptions changed and reports the code revision, random seed, package versions, outcome definition, and denominator. Multiple seeds help show Monte Carlo variation, especially at strict thresholds.

Alternative choices and critiques are welcome. This is one inspectable model, not a claim that its assumptions are the only reasonable ones.

## Licence

MIT. See [LICENSE](LICENSE).
