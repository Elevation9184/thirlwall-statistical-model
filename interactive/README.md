# Arithmetic of Suspicion · interactive Figure 2

This self-contained static app is the first interactive layer alongside the published model. It does **not** replace `../thirlwall_statistical_model.py`. The Python script and `../example_output.txt` remain the reference for all model outputs.

## Run locally

Double-click `index.html` in the `interactive` folder. It also works through a local server: from the parent `thirlwall-statistical-model` folder, run `python -m http.server 8000`, then open `http://localhost:8000/interactive/`. The delivered `app.js` is a classic browser script, so local-file access does not block the charts.

For regression checks, run `node --test interactive/tests/figure2.test.js` from the parent folder. The test reads the existing `example_output.txt` directly, verifies every browser sweep row, checks both published E10/E50 operating points, checks the model relationships that should remain invariant when prevalence or the displayed unit changes, and verifies that the delivered browser script matches its source files.

## What this version models

- The 11 calibrated CUSUM thresholds in Python output block 9.
- Figure 2’s horizontal coordinate: probability of an alarm within 12 months in a selected unit with an offender, on a logarithmic axis from 0.1% to 100%. The article displays local neonatal units by default.
- Figure 2’s vertical coordinate: false CUSUM crossings across 175 units per detected offender-year. This interactive version uses a logarithmic vertical axis to accommodate the 0.1–30 base-rate slider; the paper uses a linear vertical axis. The curve’s shape therefore differs from the printed figure.
- Dashed reference curves for the national and neonatal base-rate scenarios, except where the selected scenario overlaps one of them.
- A scenario prevalence from 0.1 to 30 offender-years per 10,000 unit-years. The false:true ratio and years per detection scale inversely with prevalence; sensitivity does not change.
- A companion chart showing detection chances for intensive, local, and special-care units at the chosen threshold.

The paper defaults shown on opening are E10, the neonatal reference base rate of 1 per 10,000 unit-years, and local-unit detection. E50 and the national reference rate of 0.1 are one-click presets. The underlying sweep fixes offender effect at an expected four excess deaths in 12 months and allocates offender risk in proportion to staffing.

The “Read paper PDF” link points to the PDF in the parent folder. That relative path works locally and when the same folder layout is hosted. The local PDF is newer than the PDF currently in the GitHub repository; synchronize the article before publishing the site. The interactive project does not change either PDF.

The Python output prints rounded results. The browser uses the more precise printed 0.1-reference false:true column as its arithmetic anchor; intermediate prevalence values use the same inverse-rate relationship as the Python model. The strictest estimates have higher Monte Carlo uncertainty and should not be read as exact.

## File roles

`reference/figure2-data.js` contains the transcribed, regression-checked output block 9. `model.js` performs only the deterministic arithmetic needed for this view. `presets.js` holds one explicit paper state. `ui.js` owns the single current state object; both charts read its derived results through `charts.js`. `app.js` is generated from those files by `node build.mjs` so the app also runs from `file://` without a server. Rebuild after changing any source JavaScript file.

Future stages can add other monitoring rules and offender-effect controls when supported by new Python reference sweeps. They should bring benchmark output and regression checks with them before becoming adjustable in the browser.
