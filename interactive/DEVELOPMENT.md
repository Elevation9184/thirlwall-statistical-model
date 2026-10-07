# Interactive explorer: development plan

This is the working plan for `interactive/`. It records what the explorer is for, what each tab contains, which assumptions the reader can change, how each number is produced, and what has been decided. Update it whenever a stage lands or a decision changes; the change log is at the end.

The paper ("The Arithmetic of Suspicion") and the Python model (`../thirlwall_statistical_model.py`, version 7, output in `../example_output.txt`) remain the source of truth. The explorer recreates their numbers and lets the reader see how those numbers move when assumptions change. It never replaces them.

## Status

| Stage | Scope | Owner | Status |
|---|---|---|---|
| 1 | Figure 2 explorer: threshold, base rate, unit type | Codex, reviewed by Claude | **Done** (commits df26da2, 84ce638, 404c6d5) |
| 2a | Python reference export: full-precision JSON of every per-unit-type result | Claude | **Done**: `reference/reference.json`, printed output verified identical |
| 2b | Five tabs following Tables 1–5, shared state, live tables, all "Ready" controls | Codex, reviewed | **Done**: reference arithmetic, five linked views, file-open bundle, 1400/390 px review screenshots and regression checks |
| 3a | Simulation layer: JavaScript port of the model, validated against the Python baseline; no new reader controls | Codex, reviewed | **Done**: 288/288 cells within gate, all medians and Tables 4–5 pass; file-open worker smoke passed |
| 3b | Simulation mode in the page: the five shortlisted controls | Codex, awaiting review | **Done**: selective worker results, source labels, intervals, paper round trips, file-open browser checks and six review screenshots |
| 3c | Rule E recalibration when the world changes | Codex, reviewed by Claude | Not started; after 3b |
| 4 | Optional extensions (see section 9) | — | Not planned |

## 1. Purpose and principles

The paper's tables are snapshots. Each rests on assumptions. The explorer turns each table into something the reader can take apart: change an assumption, watch the table rebuild, and follow the change through to the human cost.

1. **One idea per tab**, in the paper's order. Each tab introduces at most two new controls.
2. **Choices carry forward.** Every tab reads one shared state. A change in Tab 1 updates Tabs 2–5.
3. **Every tab shows its table.** Alongside the graph and controls, each tab shows a live version of the paper's table, recomputed under the current settings.
4. **The paper's values stay visible.** Wherever a live value differs from the paper, the paper's value is shown beside it.
5. **Show the working.** Each tab has a "How this number is made" panel with the formula and current values substituted.
6. **Honesty over polish.** A number the reference run did not compute is shown as "not computed", never estimated. Monte Carlo estimates (Stage 3) carry their uncertainty.
7. **The paper's terminology throughout** (section 7).

## 2. Architecture

- **State.** One object holding every control value, plus the active tab. It is serialised to the URL hash, so a scenario can be shared as a link. "Reset to paper" restores the paper's main case.
- **Reference data.** Stage 2b reads `reference/reference.json` (produced by Stage 2a). For `file://` use, `build.mjs` should inline it into the bundle as a constant rather than fetch it. Every value is regression-tested against `example_output.txt` at the printed precision.
- **Derivation.** `derive.js` holds pure functions that turn state plus reference data into every displayed number (section 5). There is no DOM access, and everything is unit-tested.
- **Views.** One module per tab. Each renders the controls, graph, live table and working panel from `derive.js` output only.
- **Simulation (Stage 3).** `sim/` holds a JavaScript port of the model, run in a Web Worker. It feeds the same `derive.js` functions, so the views do not change.
- **Build.** Same pattern as Stage 1: source modules bundled by `build.mjs` into `app.js` so the page works from `file://`. `--check` must pass.
- **Layout.** Desktop: tab bar and scenario bar across the top; controls on the left, graph in the centre, live table at right centre, working panel below. Phone (390 px): tab bar scrolls horizontally, and controls, graph, table and working stack in that order.

The **scenario bar** sits above the tabs and lists every current choice, for example "Rule C · own-exposure · +4 · base rate 1 in 10,000 · staff-proportional · q = 1 · 18 months". Each item links to the tab where it is set.

## 3. Tabs

Key for "Needs":
- **Ready:** exact arithmetic on the reference data. Stage 2b.
- **Sim:** needs the in-browser simulation. Stage 3.
- **Sim + calib:** as Sim, plus recalibration of rule E's threshold.
- **Fixed:** shown in the tab's "Fixed assumptions" list, not adjustable.

### Shared world (set from any tab; shown in the scenario bar)

| Assumption | Paper value | Control | Needs |
|---|---|---|---|
| Number of units by type | 45 / 85 / 45 | 3 sliders, 0–150 | Ready (system totals scale; per-unit rates unchanged) |
| Expected deaths a year per unit | 20 / 4 / 1 | 3 sliders | Sim + calib |
| Nurses on each roster | 100 / 40 / 20 | 3 sliders | Sim (risk weights in Tab 4 are Ready) |
| Year-to-year variation in death rate | 25% | Slider, 0–50% | Sim + calib |
| Baseline for rules A–D | Previous 3 years' average, floor 0.5 | — | Fixed |
| History; years monitored | 48 months; 10 years | — | Fixed |

### Tab 1 · Noise (Table 1)

**Question:** How many alarms does chance alone produce?
**Takeaway:** Chance alone produces between 3 and 34 alarms a year in England and Wales, depending on the rule.

| Assumption | Paper value | Control | Needs |
|---|---|---|---|
| Monitoring rule | A, B, C, D, E10, E50 | Six-way choice | Ready |
| Alarm line, rules A–C | 2 SD (97.7%); B uses 3 SD | Slider, 1.5–3.5 SD | Sim |
| How often checked | Yearly (A, B), monthly (C, D) | Switch | Sim |
| Rule D trigger | Deaths doubled, at least 4 | Sliders: factor 1.5–3, minimum 2–8 | Sim |
| Rule E false-alarm target | 1 in 10 / 1 in 50 unit-years | Slider over the 11 swept settings inside Tab 4's Figure 2 section | Ready at the 11 points; otherwise Sim + calib |
| Rule E tuned to detect | A doubling | — | Fixed |

**Graph:** 175 dots grouped 45 / 85 / 45, with the expected number of alarming units in a typical year lit by type. Deterministic, labelled "expected count, a typical year".
**Live table (Table 1):** rows A–E50, with columns for what triggers the rule, alarm unit-years a year, episodes a year, and the share of unit-years alarmed in intensive care, local and special care units. The selected rule's row is highlighted. Totals respond to unit counts.
**Working:** alarm unit-years = Σ units_t × share alarmed_t.

### Tab 2 · Named nurse (Table 2)

**Question:** How often does a rota search after a chance alarm produce a "significant" nurse?
**Takeaway:** About half of chance alarms produce a "significant" nurse under the own-exposure test, and about one in forty under the maximum-adjusted test.

| Assumption | Paper value | Control | Needs |
|---|---|---|---|
| Rota test | Average-exposure, own-exposure, maximum-adjusted | Three-way choice | Ready |
| Significance level | 5% | Slider, 1–10% | Sim |
| Shift shares; staff mix | 13 / 21 / 27% of shifts; 35 / 50 / 15% of staff | Sliders | Sim |
| Mechanism: roster size × deaths reviewed | — | Two sliders | Ready (exact calculation; labelled "the mechanism", not Table 2's figure) |
| Attendance independent across nurses and deaths | Yes | — | Fixed |
| Minimum deaths to review | 2 | — | Fixed |

**Graph:** alarms a year, then "significant" nurses a year, as two linked bars. The test switch visibly shrinks the second bar. The mechanism panel plots the chance that someone on the roster looks significant against roster size.
**Live table (Table 2):** for the selected rule, rows for intensive care, local, special care and all alarms weighted. Columns: deaths reviewed (median), top nurse attended (median), and the three tests' shares. A footer row gives nurses flagged a year under the selected test. (The paper's Table 2 shows rule C; the explorer generalises it to the selected rule and says so.)
**Working:** flagged a year = Σ units_t × reviewed alarms_t × share passing_t.

Mechanism check values (independent attendance, the model's shift mix, 5%, every nurse tested): roster 20 and 3 deaths gives 38%; 40 and 8 gives 49%; 100 and 28 gives 89%; 200 and 28 gives 99%.

### Tab 3 · Offender present (Table 3)

**Question:** When an offender is present, how often does the unit alarm, and how often does the rota point to them?
**Takeaway:** No rule does both: rules that alarm often point to the wrong nurse, and rules that point correctly rarely alarm.

| Assumption | Paper value | Control | Needs |
|---|---|---|---|
| Offender's extra deaths | +4 or +7 expected | Switch | Ready; continuous 1–15 is Sim |
| Unit type highlighted | Local | Switch | Ready |
| Offender's shift share | 21% | Slider | Sim |
| Length of offending | 12 months | Slider, 3–24 | Sim |
| Present at every extra death; fair tie-break | Yes | — | Fixed |

**Graph:** detection by unit type for the selected rule, each bar marked with the background (no-offender) rate and with identification.
**Live table (Table 3):** rows A–E50; columns for detection in intensive care, local and special care units at the selected effect, the local-unit identification rate, and the background rate.
**Working:** detection includes alarms that would have happened anyway; the background column shows how much.

### Tab 4 · The ratio (Table 4)

**Question:** For every offender-year detected, how many unit-years are falsely flagged?
**Takeaway:** The base rate dominates: changing the rule moves the ratio about fourfold, while the rarity of offenders moves it by hundreds.

| Assumption | Paper value | Control | Needs |
|---|---|---|---|
| Base rate | 0.1 and 1 (reference); 3, 10, 30 (stress tests) | Log slider 0.1–30, presets | Ready |
| Risk allocation | In proportion to staff; equal as a check | Switch | Ready |
| Tune the idealised chart (Figure 2) | 11 settings | The Stage 1 explorer, collapsed by default | Ready |
| Detection counts any alarm in an offender-year | Yes | — | Fixed (background shown in Tab 3) |

**Graph:** the ratio for each rule at the current base rate, as a bar chart on a log scale with the selected rule highlighted. Years between detections is shown as the secondary number.
**Live table (Table 4):** rows A–E50; columns for the five printed base rates plus a "your rate" column. It responds to allocation and unit counts.
**Working:** the formula in section 5, with the selected rule's values substituted.
**Rule:** never plot rules A–D on the Figure 2 axes. Figure 2 counts chart crossings, while Table 4 counts falsely flagged unit-years.

### Tab 5 · Human cost (Table 5 and closing paragraph)

**Question:** What does this cost in people, and how likely is a flagged nurse to be the offender?
**Takeaway:** q sets the volume of harm, not the odds: searching fewer alarms flags fewer innocent nurses and finds proportionally fewer offenders.

| Assumption | Paper value | Control | Needs |
|---|---|---|---|
| Share of alarms searched (q) | 1, 0.5, 0.25, 0.1 | Slider 0–1, presets | Ready |
| Investigation length | 18 months | Slider, 1–36 | Ready |
| When a nurse is flagged | Own-exposure test passes | Follows Tab 2 | Ready |
| Chance a flagged nurse is the offender | Own-exposure test | Display | Ready with the D1 export (exact, any base rate, +4 or +7); "not computed" for the maximum-adjusted test |

**Graph:** nurses flagged a year and nurses off the wards at any one time, against q.
**Live table (Table 5):** rows A–E50; columns for q = 1, 0.5, 0.25, 0.1 plus a "your q" column, and off-ward and posterior columns for the current settings.
**Working:** flagged = Tab 2 flags × q; off wards = flagged × months ÷ 12; posterior as in section 5.

## 4. Reference data

Stage 2a added an optional `--export PATH` to the Python script. `reference/reference.json` was produced by the full default run (`python thirlwall_statistical_model.py --export interactive/reference/reference.json`). It contains, at full precision:

- For each rule and unit type, from the chance-alarm runs: alarm share, episodes, reviewed alarms, the three test shares, flag episodes, distinct nurses, median deaths reviewed, and median top attendance.
- For each effect (+4, +7), rule and unit type, from the detection runs: detection, background, offender identification (`flag_off`), and any-nurse flag rate (`flag_any`).
- The CUSUM thresholds, the block 9 sweep, and the model inputs (unit types, shift mix, CV, base rates, q values).

The export uses no random numbers and writes values already computed. A full run with `--export` produced output identical to `example_output.txt` apart from the timing line.

JSON keys:
- `inputs`: model inputs (unit types with `n`, `mean` and `staff`; `cv`; exposure shares and mix; `offender_f`; rules; base rates; q).
- `weights`: `staff` and `equal` risk weights by unit type.
- `cusum_h`: thresholds keyed `"E10|NICU"` and so on.
- `chance[rule][type]`: `alpha` (share of unit-years alarmed), `ep` (episodes per unit-year), `rev` (reviewed alarms per unit-year), `s_avg`, `s_own` and `s_adj` (test shares among reviewed alarms), `flag_ep` and `flag_distinct` (own-exposure flags per unit-year), `med_k`, `med_top`.
- `detection["4"|"7"][rule][type]`: `d` (detection), `bg` (background), `flag_off` (offender identified, per detection), `flag_any` (any nurse flagged, per detection).
- `exact_count_ratio_p1`: block 8.
- `sweep`: block 9, with per-type thresholds.

Verification already done: the section 5 formulas applied to this file reproduce every line of blocks 4, 5 and 6 of `example_output.txt` character for character (30 of 30 lines).

## 5. Derived arithmetic (`derive.js`)

With unit counts n_t, staff s_t, base rate p (per unit-year, the slider value ÷ 10,000), and reference values from section 4:

```text
risk weight w_t      = s_t × Σn ÷ Σ(n × s)            (or 1 if equal allocation)
false flagged/yr     = Σ n_t (1 − p w_t) alpha_t
detected/yr          = Σ n_t p w_t d_t                (d_t at +4 or +7)
ratio                = false flagged/yr ÷ detected/yr
years per detection  = 1 ÷ detected/yr
alarm unit-years/yr  = Σ n_t alpha_t
flags/yr (own-exp)   = Σ n_t flag_ep_t
flags/yr (max-adj)   = Σ n_t rev_t s_adj_t
flags/yr at q        = flags/yr × q
off wards            = flags/yr at q × months ÷ 12
posterior            = Σ n_t p w_t d_t flag_off_t
                       ÷ [Σ n_t p w_t d_t flag_any_t + Σ n_t (1 − p w_t) flag_ep_t]
```

These match `false_true()` and `posterior()` in the Python script. Note that q cancels out of the posterior, which is the point of Tab 5.

## 6. Validation and tests

- **Transcription:** every reference value matches `example_output.txt` at the printed precision.
- **Recreation:** at the paper's settings, the derived Tables 1–5 reproduce the printed tables. This covers Table 4 for all rules, all five base rates and both allocations; Table 5 for all q; and block 5's posteriors. Tolerance is printed rounding only.
- **Propagation:** switching rule, test or effect changes the dependent cells in later tabs, and only those.
- **Invariants:** q does not change the posterior; base rate does not change detection; unit counts do not change per-unit rates.
- **Stage 3:** at the paper's settings, JavaScript estimates must agree with the reference within 3 standard errors on every Table 1–3 cell before any Sim control is enabled.
- **Visual:** screenshots of each tab at 1400 px and 390 px at the paper defaults. No overlapping labels.

## 7. Terminology

Use the paper's terms:
- falsely flagged unit-years (Table 4); false-alarm crossings (Figure 2 only);
- detected offender-year; one-year detection sensitivity;
- identification (never "detection" for the rota result);
- own-exposure, maximum-adjusted and average-exposure tests;
- intensive care, local and special care units;
- national reference rate (0.1 per 10,000) and neonatal reference rate (1 per 10,000); stress tests (3, 10, 30).

"Detection" always means the unit alarms in an offender-year. It never means the offender is identified.

## 8. Stage 3: the simulation layer

### 8.1 Two modes

- **Paper mode** (default, and after "Reset to paper"). Every number comes from `reference/reference.json` and the section 5 arithmetic. It is exact and test-guaranteed to match the paper. All "Ready" controls stay in paper mode.
- **Simulation mode** begins when the reader changes a "Sim" control. Affected numbers come from the in-browser simulation. They are shown with a 95% interval and labelled "simulated"; the paper's value stays beside each one. A banner states the mode, the number of simulated units and the seed, with a "Return to paper baseline" button.
- The two modes never mix silently. Each displayed number knows its source (`paper`, `derived`, `simulated`), and the "How this number is made" panel names it.

### 8.2 The port must be faithful

`sim/` reimplements `thirlwall_statistical_model.py` sections 1–3 exactly as written, not approximately. The behaviour to reproduce (Python names in brackets):

- **Unit path** (`sim_unit`): one gamma draw per year, mean `mean`, shape K = 1/CV², scale 1/K; monthly mean = annual rate ÷ 12 for all 12 months of that year; deaths ~ Poisson(monthly mean); 48 months of history plus 120 monitored. With an offender, months 48–59 add Poisson(extra ÷ 12) offender deaths.
- **Rules A and B**: one check per monitored year. The count is the year's deaths; the baseline is max(total deaths in the previous 36 months ÷ 3, 0.5). The rule alarms when count > Poisson quantile(q, baseline) with q = 0.977 (A) or 0.9987 (B). "Quantile" means scipy's `ppf`: the smallest k with CDF(k) ≥ q. The review window is that year.
- **Rules C and D**: one check per monitored month, on the rolling 12-month count, with the same baseline (the three years before the window). C alarms when count > Poisson quantile(0.977, baseline); D when count ≥ 2 × baseline and count ≥ 4. The review window is those 12 months.
- **Rule E** (`checks`, CUSUM branch): S = max(0, S + deaths × ln 2 − true monthly mean); the window starts the month after S was last 0; alarm when S ≥ h; then S = 0. In 3a and 3b, h comes from `cusum_h` in the reference file.
- **Episodes and unit-years**: consecutive alarmed checks form one episode, reviewed over the first alarmed check's window. A unit-year counts once if any check in that year alarms.
- **Rota review, chance runs**: one persistent roster per unit (shift shares drawn from 0.21 / 0.13 / 0.27 with probabilities 0.5 / 0.35 / 0.15). Per episode with k ≥ 2 deaths: each nurse's attendance ~ Binomial(k, own share); the top nurse is the first maximum (as numpy `argmax`); the three tests as in MODEL.md at 5%; a nurse is flagged by the own-exposure test.
- **Detection runs**: checks for the first 12 monitored months only (rules A and B: the first annual check). Hit if the first alarm falls in those months. The roster has staff − 1 drawn nurses plus the offender (share 0.21) last. The offender's attendance is Binomial(background deaths, 0.21) plus all offender deaths; the others' is Binomial(background, share) + Binomial(offender deaths, share). Ties for the top count use the fair rule (MODEL.md). The background rate comes from separate no-offender units.
- **Counts per cell**: 2,000 units per rule and type (chance), 10,000 (detection), as in Python.

### 8.3 Validation against the Python baseline (the gate for 3b)

With the paper's inputs, the JavaScript simulation must agree with `reference.json`:
- For every proportion or rate cell in `chance` and `detection` (alpha, ep, rev, test shares, flag_ep, flag_distinct, d, bg, flag_off, flag_any): z = (JS − Python) ÷ √(SE_JS² + SE_Python²), using binomial or Poisson standard errors from each run's own counts.
- Pass: no |z| > 4, and no more than 1% of cells with |z| > 3.
- Medians (`med_k`, `med_top`) within 1.
- Recalculated Tables 4 and 5 from the simulated values fall inside their simulated 95% intervals of the paper's values.
- The validation runs as `npm run validate-sim` (slow; not part of the quick test suite) and writes a report, `sim/validation-report.md`, listing every cell with JS value, Python value and z. The report is committed.

Exact equality with Python is impossible (different random generators) and is not a goal. The Python baseline is the guarantee; the simulation shows direction and size.

### 8.4 Engineering

- **Random numbers**: a seeded, fast generator (for example sfc32 or xoshiro128**). The same seed and inputs give the same results in the browser. Show the seed in the banner.
- **Samplers**: gamma (Marsaglia–Tsang), Poisson (inversion for means below 30; a standard method above), binomial (inversion for small k; a standard method above). Each sampler gets its own distribution test.
- **Poisson quantile and binomial tails**: exact, by summing probabilities, as scipy defines them.
- **Worker**: the simulation runs in a Web Worker. Under `file://`, create it from a Blob URL of inlined source, because a worker file cannot be loaded from `file://`.
- **Output shape**: the worker returns objects shaped like `reference.json`'s `chance` and `detection`, plus the counts behind each value. `derive.js` then works unchanged.
- **Speed**: compute what the visible tab needs first (the selected rule and effect), then fill the rest in the background. Report progress. A full Tables 1–3 run should take seconds, not minutes, on a laptop. Measure it and record it in the change log.

### 8.5 Stage 3b controls (from D2) and what they change

| Control | Range | Simulation inputs changed | Tables affected |
|---|---|---|---|
| Expected deaths a year, by unit type | 0.5–60 | `mean` per type | 1–5 |
| Nurses on each roster, by type | 10–200 | `staff` per type; risk weights | 2–5 |
| Alarm line, rules A–C | 1.5–3.5 SD, converted to the quantile q = Φ(SD), except that 2 SD and 3 SD use the paper's exact 0.977 and 0.9987 (Φ gives 0.97725 and 0.99865) | the quantile q | 1–5 for A–C |
| Significance level | 1–10% | the rota tests' threshold | 2, 3 (identification), 5 |
| Offender's extra deaths | 1–15 expected | `extra` | 3–5 |

Changing deaths a year changes rule E's thresholds. Until 3c, rule E is greyed out in simulation mode when deaths a year differ from the paper, with the note "rule E needs recalibration (coming)".

Simulation mode can also compute what paper mode cannot: the chance that a flagged nurse is the offender under the maximum-adjusted test. Show it there, labelled simulated.

## 9. Open decisions

| # | Question | Options | Recommendation | Decided |
|---|---|---|---|---|
| D1 | Add the reference export to the Python script? | Yes / No | Yes | **Yes**, 2026-10-06; done |
| D2 | Stage 3 scope | All 12 Sim controls / a shortlist | Shortlist first | **Shortlist**, 2026-10-06: deaths a year, roster size, alarm line, significance level, offender's extra deaths |
| D3 | Rule E when the world changes | Recalibrate in the browser (a few seconds) / grey out | Recalibrate | **Recalibrate**, 2026-10-06, with a progress indicator; grey out the 1-in-5,000 and 1-in-10,000 settings |
| D4 | Show paper values beside live values | Yes / No | Yes | **Yes**, 2026-10-06: small and muted, only where they differ |
| D5 | Where the explorer is hosted, and the paper link | Repo only / a public page | Decide before the repo goes public. | — |

## 10. Change log

- 2026-10-07: Stage 3b presentation follow-ups. Simulation takeaways now mark the fixed finding as the paper’s setting. Tab 4 places simulation intervals beneath ratio values; a browser check confirms every Live Table 4 cell is visible at 1400 px and the sideways-scroll cue remains visible at 390 px. Mortality-dependent Rule E cells and the Tab 4 chart say “Needs recalibration (Stage 3c)”; the paper-mode maximum-adjusted posterior still says “not computed”. Paper-value tests, the file-open browser check and the bundle check pass.
- 2026-10-07: Stage 3b enabled mortality, roster size, alarm line, significance and offender effect in one URL-backed state. Selective worker jobs update the visible scenario first, with progress, stale-value dimming, 95% intervals and paper comparisons. At exact +4 or +7 with the other simulation controls at their defaults, the page uses the Python paper values. Rule E is unavailable only where mortality changes, pending Stage 3c recalibration. Simulation mode computes the maximum-adjusted posterior from deterministic additional rota counts. The 288 Stage 3a validation cell values remain byte-identical to the committed report; all Stage 3b direction, source, interval and paper round-trip checks passed. Six desktop/phone review screenshots are Git-ignored under `screenshots/stage3b/`.

  Browser timings from the project’s `file://` page in Chrome at paper defaults, excluding screenshot time (milliseconds, input to first updated cell / full completion):

  | Control change | First update | Complete |
  |---|---:|---:|
  | Local-unit expected deaths, 4 → 8/year | 449 | 1,968 |
  | Local-unit roster, 40 → 80 nurses | 454 | 2,677 |
  | Alarm line, 2 → 2.5 SD | 413 | 3,264 |
  | Significance, 5% → 1% | 429 | 6,927 |
  | Offender effect, +4 → +5 | 776 | 6,004 |

- 2026-10-07: Stage 3a engine added under `sim/`, leaving paper mode and reader controls unchanged. Seeded gamma, Poisson and binomial samplers have distribution checks; chance, rota and detection paths cover all six rules and return raw counts. A Blob worker runs from `file://`, prioritises the selected cell and reports progress. Full validation (2,000/10,000 units per cell) passed: 288 cells, largest |z| 2.917, none over 3 or 4, all 36 medians within 1, and all 168 recalculated Table 4/5 values within combined simulation 95% intervals. Actual project run: 8.04 s in Node and 11.17 s in Chrome worker. See `sim/validation-report.md`.
- 2026-10-07: Stage 2 complete after review. Stage 3 planned (section 8): paper and simulation modes, a faithful JavaScript port validated against the Python baseline before any simulation control goes live (3a), the five shortlisted controls (3b), rule E recalibration (3c).
- 2026-10-06: Stage 2b review follow-ups. Posterior displays now lead with reciprocal odds and retain the three-decimal percentage beneath. All numeric display rounding follows Python's fixed-point formatting of the binary value, checked against rendered Tables 1–5 at paper defaults. The Figure 2 target slider lives only in Tab 4, takeaway panels lead with the paper's finding, and Tab 3/5 chart labels were improved. Screenshots remain a review artifact in a Git-ignored directory.
- 2026-10-06: Stage 2b implemented. Added one URL-backed model state, the five Table 1–5 tabs, scenario bar, paper comparisons, fixed assumptions and calculation panels. The exact roster mechanism, maximum-adjusted flag count, posterior and all Table 4–5 arithmetic use the Stage 2a export. The original Figure 2 explorer sits in a collapsed Tab 4 section. All Ready controls are active; simulation-dependent assumptions remain fixed. The full regression suite, bundle check, file-open browser interaction check and ten desktop/phone screenshots passed.
- 2026-10-06: Decisions D1–D4 agreed. Stage 2a done: `--export` added to the Python script; `reference/reference.json` generated; output verified identical; Tables 4, 5 and posteriors recreated exactly from the export.
- 2026-10-06: Stage 1 complete and reviewed (log detection axis, paper terminology, follow-ups). Plan drafted for Stages 2–3: five tabs, live tables, assumption inventory, reference export proposal.
