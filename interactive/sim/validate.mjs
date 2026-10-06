import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { runSimulation } from './model.js';
import { falseTrue, chanceForRule, TYPES } from '../derive.js';

const reference = JSON.parse(await readFile(new URL('../reference/reference.json', import.meta.url), 'utf8'));
const counts = Object.fromEntries(TYPES.map(type => [type, reference.inputs.types[type].n]));
const started = performance.now();
const simulated = runSimulation(reference, { seed: 20261007 });
const runtimeMs = performance.now() - started;
let browserTiming = null;
try { browserTiming = JSON.parse(await readFile(new URL('browser-runtime.json', import.meta.url), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const lines = [
  '# Stage 3a simulation validation', '',
  `Seed: ${simulated.metadata.seed}. Chance units per cell: ${simulated.metadata.chanceReps.toLocaleString()}; detection units per cell: ${simulated.metadata.detectionReps.toLocaleString()}.`,
  `Node simulation run time: ${(runtimeMs / 1000).toFixed(2)} seconds.`,
  `Browser worker run time: ${browserTiming ? `${(browserTiming.elapsedMs / 1000).toFixed(2)} seconds (${browserTiming.browser}, full paper settings)` : 'not measured yet'}.`, '',
  'The Python baseline is the full-precision Stage 2a export. JS uses an independent seeded generator. z divides the difference by the combined standard errors of the two runs. Proportions use binomial errors; event rates use Poisson errors.', ''
];
const observations = [];
const medianChecks = [];

function seBinomial(value, trials) {
  return trials ? Math.sqrt(Math.max(0, value * (1 - value)) / trials) : 0;
}
function sePoisson(rate, exposure) {
  return exposure ? Math.sqrt(rate / exposure) : 0;
}
function addCell(group, key, js, py, jsSE, pySE) {
  const combined = Math.hypot(jsSE, pySE);
  const z = combined ? (js - py) / combined : (js === py ? 0 : Infinity);
  observations.push({ group, key, js, py, z });
}
for (const rule of reference.inputs.rules) for (const type of TYPES) {
  const js = simulated.chance[rule][type], py = reference.chance[rule][type];
  const unitYears = js.counts.unitYears;
  for (const key of ['alpha', 'ep', 'rev', 'flag_ep', 'flag_distinct']) {
    const error = key === 'alpha' ? seBinomial : sePoisson;
    addCell('chance', `${rule}/${type}/${key}`, js[key], py[key], error(js[key], unitYears), error(py[key], unitYears));
  }
  for (const key of ['s_avg', 's_own', 's_adj']) {
    addCell('chance', `${rule}/${type}/${key}`, js[key], py[key],
      seBinomial(js[key], js.counts.reviewedAlarms), seBinomial(py[key], Math.round(py.rev * unitYears)));
  }
  for (const key of ['med_k', 'med_top']) medianChecks.push({ key: `${rule}/${type}/${key}`, js: js[key], py: py[key], diff: Math.abs(js[key] - py[key]) });
}
for (const effect of [4, 7]) for (const rule of reference.inputs.rules) for (const type of TYPES) {
  const js = simulated.detection[effect][rule][type], py = reference.detection[effect][rule][type];
  for (const key of ['d', 'bg', 'flag_off', 'flag_any']) {
    const jsTrials = key.startsWith('flag') ? js.counts.hits : js.counts.units;
    const pyTrials = key.startsWith('flag') ? Math.round(py.d * js.counts.units) : js.counts.units;
    addCell('detection', `+${effect}/${rule}/${type}/${key}`, js[key], py[key],
      seBinomial(js[key], jsTrials), seBinomial(py[key], pyTrials));
  }
}

function decimals(value) { return value == null ? '—' : value.toPrecision(8); }
function row(obs) { return `| ${obs.key} | ${decimals(obs.js)} | ${decimals(obs.py)} | ${obs.z.toFixed(3)} |`; }
for (const group of ['chance', 'detection']) {
  lines.push(`## ${group === 'chance' ? 'Chance and rota' : 'Detection'} cells`, '', '| Cell | JS | Python | z |', '|---|---:|---:|---:|');
  lines.push(...observations.filter(item => item.group === group).map(row), '');
}
lines.push('## Medians', '', '| Cell | JS | Python | Absolute difference |', '|---|---:|---:|---:|');
lines.push(...medianChecks.map(item => `| ${item.key} | ${item.js} | ${item.py} | ${item.diff} |`), '');

// The paper baseline is itself a finite Python simulation, so compare independent
// simulation estimates with the combined delta-method uncertainty of their difference.
const simReference = { ...reference, chance: simulated.chance, detection: simulated.detection };
const tableChecks = [];
for (const allocation of ['staff', 'equal']) for (const rule of reference.inputs.rules) for (const rate of reference.inputs.base_rates) {
  const js = falseTrue(rule, rate, 4, allocation, counts, simReference);
  const py = falseTrue(rule, rate, 4, allocation, counts, reference);
  const p = rate / 10000;
  const table4Variance = (derived, source) => {
    let numeratorVar = 0, denominatorVar = 0;
    for (const type of TYPES) {
      const prevalence = p * derived.weights[type];
      const alpha = source.chance[rule][type].alpha;
      const d = source.detection[4][rule][type].d;
      numeratorVar += (counts[type] * (1 - prevalence)) ** 2 * seBinomial(alpha, reference.inputs.reps * reference.inputs.monitor_months / 12) ** 2;
      denominatorVar += (counts[type] * prevalence) ** 2 * seBinomial(d, reference.inputs.det_reps) ** 2;
    }
    return {
      ratio: numeratorVar / derived.detected ** 2 + derived.falseFlagged ** 2 * denominatorVar / derived.detected ** 4,
      years: denominatorVar / derived.detected ** 4
    };
  };
  const jsVar = table4Variance(js, simReference);
  const pyVar = table4Variance(py, reference);
  tableChecks.push({ table: 4, key: `${allocation}/${rule}/p=${rate}/ratio`, js: js.ratio, py: py.ratio,
    se: Math.sqrt(jsVar.ratio + pyVar.ratio) });
  tableChecks.push({ table: 4, key: `${allocation}/${rule}/p=${rate}/years`, js: js.years, py: py.years,
    se: Math.sqrt(jsVar.years + pyVar.years) });
}
for (const rule of reference.inputs.rules) for (const q of reference.inputs.q) {
  const js = chanceForRule(rule, counts, simReference);
  const py = chanceForRule(rule, counts, reference);
  for (const [key, resultKey] of [['flag_ep', 'own'], ['flag_distinct', 'distinctOwn']]) {
    let variance = 0;
    for (const type of TYPES) {
      const exposure = reference.inputs.reps * reference.inputs.monitor_months / 12;
      variance += (q * counts[type]) ** 2 * (
        sePoisson(simulated.chance[rule][type][key], exposure) ** 2
        + sePoisson(reference.chance[rule][type][key], exposure) ** 2);
    }
    tableChecks.push({ table: 5, key: `${rule}/q=${q}/${key}`,
      js: (resultKey === 'own' ? js.flags.own : js.distinctOwn) * q,
      py: (resultKey === 'own' ? py.flags.own : py.distinctOwn) * q, se: Math.sqrt(variance) });
  }
}
lines.push('## Recalculated Tables 4 and 5', '',
  'Each interval is JS ± 1.96 × the combined delta-method standard error of the JS and Python simulations. The comparison value is the full-precision Python-derived paper baseline; both runs have finite Monte Carlo uncertainty.', '',
  '| Table / cell | JS | Python | 95% interval | Inside? |', '|---|---:|---:|---:|:---:|');
for (const item of tableChecks) {
  item.lower = item.js - 1.96 * item.se;
  item.upper = item.js + 1.96 * item.se;
  item.inside = item.py >= item.lower && item.py <= item.upper;
  lines.push(`| ${item.table} / ${item.key} | ${decimals(item.js)} | ${decimals(item.py)} | [${decimals(item.lower)}, ${decimals(item.upper)}] | ${item.inside ? 'yes' : 'NO'} |`);
}
lines.push('');
const over3 = observations.filter(item => Math.abs(item.z) > 3);
const over4 = observations.filter(item => Math.abs(item.z) > 4);
const largest = Math.max(...observations.map(item => Math.abs(item.z)));
const medianFailures = medianChecks.filter(item => item.diff > 1);
const tableFailures = tableChecks.filter(item => !item.inside);
const passed = !over4.length && over3.length <= Math.floor(.01 * observations.length)
  && !medianFailures.length && !tableFailures.length;
lines.splice(8, 0, `Validation: **${passed ? 'PASS' : 'FAIL'}**. ${observations.length} cells checked; largest |z| ${largest.toFixed(3)}; ${over3.length} cells over 3; ${over4.length} cells over 4; ${medianFailures.length} median failures; ${tableFailures.length} Table 4/5 interval failures.`, '');
lines.push('## Summary', '',
  `- ${observations.length} proportion/rate cells; largest |z| ${largest.toFixed(3)}; ${over3.length} over 3 (${(100 * over3.length / observations.length).toFixed(2)}%); ${over4.length} over 4.`,
  `- ${medianChecks.length} medians; ${medianFailures.length} differ by more than 1.`,
  `- ${tableChecks.length} Table 4/5 derived values; ${tableFailures.length} paper baselines outside the simulated 95% interval.`,
  `- Node run time ${(runtimeMs / 1000).toFixed(2)} seconds.`,
  `- Browser worker run time ${browserTiming ? `${(browserTiming.elapsedMs / 1000).toFixed(2)} seconds` : 'not measured yet'}.`,
  `- Gate: **${passed ? 'PASS' : 'FAIL'}**.`, '');
if (over3.length) lines.push(`Cells over 3: ${over3.map(x => `${x.key} (${x.z.toFixed(3)})`).join(', ')}.`, '');
if (medianFailures.length) lines.push(`Median failures: ${medianFailures.map(x => x.key).join(', ')}.`, '');
if (tableFailures.length) lines.push(`Table failures: ${tableFailures.map(x => x.key).join(', ')}.`, '');
await writeFile(new URL('validation-report.md', import.meta.url), `${lines.join('\n').trimEnd()}\n`);
console.log(`Validation ${passed ? 'PASS' : 'FAIL'}: ${observations.length} cells, max |z| ${largest.toFixed(3)}, ${over3.length} >3, ${over4.length} >4, ${medianFailures.length} medians, ${tableFailures.length} table intervals; Node ${(runtimeMs / 1000).toFixed(2)}s`);
if (!passed) process.exitCode = 1;
