# The Arithmetic of Suspicion · interactive explorer

The five-tab explorer follows Tables 1–5 of the paper. The Python model in `../thirlwall_statistical_model.py` and its validated `../example_output.txt` remain the reference implementation. The browser reads the full-precision export in `reference/reference.json`; `build.mjs` embeds that file in `app.js`, so `index.html` also works when opened directly from `file://`.

## Use and checks

Open `interactive/index.html` directly, or serve the repository root and open `/interactive/`. The scenario bar carries choices across tabs; the URL hash stores the whole scenario. “Reset to paper” restores rule C, own-exposure, +4 expected deaths, the neonatal reference-rate scenario, staff-proportional risk, q = 1, 18 months and the published unit counts.

From `interactive/`, run:

```text
node --test tests/*.test.js
node build.mjs --check
```

After changing source modules or the reference export, run `node build.mjs`.

## Scope

Tabs 1–5 show chance alarms, rota searches, offender-year detection, falsely flagged unit-years per detected offender-year, and nurse-flagging and off-ward burden. Every tab has a graph, live table, visible paper comparisons when printed values differ, a calculation panel and fixed assumptions. The hypothetical roster mechanism in Tab 2 is an exact independent-attendance calculation; its sliders do not change the Python Table 2 estimates. Figure 2’s original 11-point CUSUM sweep remains in a collapsed section of Tab 4 and counts chart crossings, a different quantity from Table 4’s falsely flagged unit-years.

Only controls marked “Ready” in `DEVELOPMENT.md` are enabled. Changes that require a fresh simulation remain fixed until the browser model is validated against the Python run. A posterior is available only for the own-exposure test because that is the test for which offender-identification outcomes were exported. Base rates are scenarios, not estimates of actual offender prevalence.

`derive.js` contains pure arithmetic; `tabs/` renders the five views; `ui.js` owns the single explicit state and URL hash; `presets.js` defines paper defaults; `charts.js` and `reference/figure2-data.js` preserve the Figure 2 explorer. Review screenshots can be generated in `screenshots/` at 1400 and 390 pixels; that directory is ignored by Git.

The PDF link is relative to the parent repository and works where that file exists. The local PDF is newer than the one currently in the GitHub repository; synchronize the paper before publishing the site.
