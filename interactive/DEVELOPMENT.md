# Interactive explorer: development plan

This is the working plan for `interactive/`. It records what the explorer is for, what each tab contains, which assumptions the reader can change, how each number is produced, and what has been decided. Update it whenever a stage lands or a decision changes; the change log is at the end.

The paper ("The Arithmetic of Suspicion") and the Python model (`../thirlwall_statistical_model.py`, version 7, output in `../example_output.txt`) remain the source of truth. The explorer recreates their numbers and lets the reader see how those numbers move when assumptions change. It never replaces them.

## Status

| Stage | Scope | Owner | Status |
|---|---|---|---|
| 1 | Figure 2 explorer: threshold, base rate, unit type | Codex, reviewed by Claude | **Done** (commits df26da2, 84ce638, 404c6d5) |
| 2a | Python reference export: full-precision JSON of every per-unit-type result | Claude | Not started; awaiting decision D1 |
| 2b | Five tabs following Tables 1–5, shared state, live tables, all "Ready" controls | Codex, reviewed by Claude | Not started |
| 3 | In-browser simulation: "Sim" controls on Tabs 1–3 and the shared world | To be decided | Not started; scope is decision D2 |
| 4 | Optional extensions (see section 8) | — | Not planned |

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
- **Reference data.** Stage 2b reads `reference/reference.json` (produced by Stage 2a) through a small loader. Every value is regression-tested against `example_output.txt` at the printed precision.
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
| Rule E false-alarm target | 1 in 10 / 1 in 50 unit-years | Slider over the 11 swept settings | Ready at the 11 points; otherwise Sim + calib |
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

Stage 2a adds an export to the Python script. At the end of a run, it writes `interactive/reference/reference.json`, containing at full precision:

- For each rule and unit type, from the chance-alarm runs: alarm share, episodes, reviewed alarms, the three test shares, flag episodes, distinct nurses, median deaths reviewed, and median top attendance.
- For each effect (+4, +7), rule and unit type, from the detection runs: detection, background, offender identification (`flag_off`), and any-nurse flag rate (`flag_any`).
- The CUSUM thresholds, the block 9 sweep, and the model inputs (unit types, shift mix, CV, base rates, q values).

Constraints for 2a: it adds a file only. The printed output and the random-number sequence must be unchanged, verified by a byte-for-byte diff of `example_output.txt` apart from the timing line. Stage 2b tests every JSON value against `example_output.txt` at the printed precision.

Without the export (if D1 is declined), Stage 2b must transcribe from the printed output. That has two costs. Unit-count sliders cannot recompute Tab 2's weighted row or flagged-nurse totals, because reviewed alarms per type are not printed. The posterior would also have to be interpolated between the five printed base rates.

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

## 8. Open decisions

| # | Question | Options | Recommendation | Decided |
|---|---|---|---|---|
| D1 | Add the reference export to the Python script? | Yes (export only, output unchanged) / No (transcribe printed output) | **Yes.** Makes the unit-count sliders and the posterior exact at no cost to the frozen results. | — |
| D2 | Stage 3 scope | All 12 Sim controls / a shortlist | **Shortlist first:** deaths a year, roster size, alarm line, significance level, offender's extra deaths. | — |
| D3 | Rule E when the world changes | Recalibrate in the browser (a few seconds) / grey out | **Recalibrate**, with a progress indicator; grey out only the 1-in-5,000 and 1-in-10,000 settings, which need too many paths. | — |
| D4 | Show paper values beside live values | Yes / No | **Yes**, small and muted, only where they differ. | — |
| D5 | Where the explorer is hosted, and the paper link | Repo only / a public page | Decide before the repo goes public. | — |

## 9. Change log

- 2026-10-06: Stage 1 complete and reviewed (log detection axis, paper terminology, follow-ups). Plan drafted for Stages 2–3: five tabs, live tables, assumption inventory, reference export proposal.
