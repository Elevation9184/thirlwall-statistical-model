# The Arithmetic of Suspicion · interactive explorer

The five-tab explorer follows Tables 1–5 of the paper. The Python model in `../thirlwall_statistical_model.py` and its validated `../example_output.txt` remain the reference implementation. The browser reads the full-precision export in `reference/reference.json`; `build.mjs` embeds that file in `app.js`, so `index.html` also works when opened directly from `file://`.

## Use and checks

Open `interactive/index.html` directly, or serve the repository root and open `/interactive/`. The scenario bar carries choices across tabs; the URL hash stores the whole scenario. “Reset to paper” restores rule C, own-exposure, +4 expected deaths, the neonatal reference-rate scenario, staff-proportional risk, q = 1, 18 months, the published unit counts and all five simulation controls.

From `interactive/`, run:

```text
node --test tests/*.test.js
node build.mjs --check
```

Run `npm run validate-sim` for the full fixed-seed comparison with the Python baseline. The file-open browser checks are `tests/sim-worker.browser.mjs` and `tests/sim-mode.browser.mjs`; they use Playwright, with `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_BROWSER_EXECUTABLE` available for local installations. After changing source modules, run `node build.mjs`.

## Scope

Tabs 1–5 show chance alarms, rota searches, offender-year detection, falsely flagged unit-years per detected offender-year, and nurse-flagging and off-ward burden. Every tab has a graph, live table, visible paper comparisons when printed values differ, a calculation panel and fixed assumptions. The hypothetical roster mechanism in Tab 2 is an exact independent-attendance calculation; its sliders do not change the Python Table 2 estimates. Figure 2’s original 11-point CUSUM sweep remains in a collapsed section of Tab 4 and counts chart crossings, a different quantity from Table 4’s falsely flagged unit-years.

Stage 3b enables expected deaths per year, roster size, alarm line, significance level, and offender effect. A change to any of these starts a seeded browser worker and marks simulated cells with 95% intervals while retaining the paper value. Returning every simulation control to its paper value restores the exact reference data. When mortality changes, rule E needs recalibration and is unavailable for the changed unit type until Stage 3c. A maximum-adjusted posterior is available in simulation mode; paper mode shows it as not computed. Base rates are scenarios, not estimates of actual offender prevalence.

`derive.js` contains pure arithmetic; `sim/` holds the validated engine, scenario source masks and uncertainty calculations; `tabs/` renders the five views; `ui.js` owns the single explicit state, URL hash and worker lifecycle. `presets.js` defines paper defaults; `charts.js` and `reference/figure2-data.js` preserve the Figure 2 explorer. Review screenshots can be generated in `screenshots/` at 1400 and 390 pixels; that directory is ignored by Git.

The PDF link is relative to the parent repository and works where that file exists. The local PDF is newer than the one currently in the GitHub repository; synchronize the paper before publishing the site.
