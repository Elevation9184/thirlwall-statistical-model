import { PAPER_DEFAULT } from './presets.js';
import { SWEEP } from './reference/figure2-data.js';
import { calculate, prevalenceToSlider, sliderToPrevalence } from './model.js';
import { drawTradeoff, drawUnitChart } from './charts.js';
import { deriveAll } from './derive.js';
import { simulationPlan, simulationOptions, effectiveReference, isPaperMode } from './sim/scenario.js';
import { derivedIntervals } from './sim/intervals.js';
import { TEST_NAMES, TYPE_NAMES, formatNumber, rangeControl, renderLayout } from './tabs/common.js';
import { renderTab1 } from './tabs/tab1.js';
import { renderTab2 } from './tabs/tab2.js';
import { renderTab3 } from './tabs/tab3.js';
import { renderTab4 } from './tabs/tab4.js';
import { renderTab5 } from './tabs/tab5.js';

const tabViews = [renderTab1, renderTab2, renderTab3, renderTab4, renderTab5];
const hashKeys = {
  activeTab: 'tab', rule: 'rule', rotaTest: 'test', thresholdIndex: 'threshold',
  prevalencePer10k: 'rate', unitType: 'unit', expectedExtraDeaths: 'effect',
  riskAllocation: 'allocation', q: 'q', investigationMonths: 'months',
  mechanismRoster: 'roster', mechanismDeaths: 'deaths', figureOpen: 'figure',
  worldOpen: 'world', alarmSD: 'line', significance: 'sig', seed: 'seed'
};
const numericFields = new Set(['activeTab', 'thresholdIndex', 'prevalencePer10k', 'expectedExtraDeaths', 'q', 'investigationMonths', 'mechanismRoster', 'mechanismDeaths', 'alarmSD', 'significance', 'seed']);
const allowed = {
  rule: REFERENCE.inputs.rules, rotaTest: ['avg', 'own', 'adj'],
  unitType: ['NICU', 'LNU', 'SCU'], riskAllocation: ['staff', 'equal']
};
const ranges = {
  activeTab: [1, 5], thresholdIndex: [0, SWEEP.length - 1], prevalencePer10k: [.1, 30],
  expectedExtraDeaths: [1, 15], alarmSD: [1.5, 3.5], significance: [.01, .1], seed: [0, 4294967295], q: [0, 1], investigationMonths: [1, 36],
  mechanismRoster: [20, 200], mechanismDeaths: [2, 40]
};
let state = cloneDefaults();
let plan = simulationPlan(state, REFERENCE);
let simulation = { chance: {}, detection: {}, calibration: {} };
let previousSimulation = null;
let worker = null, debounce = null, runId = 0, completed = 0, loading = false, simulationError = '';
let recalibratingType = null;
const calibrationCache = {};
let intervalCache = null, intervalCacheKey = '';

function cloneDefaults() {
  return { ...PAPER_DEFAULT, unitCounts: { ...PAPER_DEFAULT.unitCounts },
    deathsPerYear: { ...PAPER_DEFAULT.deathsPerYear }, staffPerRoster: { ...PAPER_DEFAULT.staffPerRoster } };
}

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const next = cloneDefaults();
  for (const [field, key] of Object.entries(hashKeys)) {
    if (!params.has(key)) continue;
    const raw = params.get(key);
    if (field === 'figureOpen' || field === 'worldOpen') next[field] = raw === '1';
    else if (numericFields.has(field)) {
      const value = Number(raw);
      if (Number.isFinite(value) && value >= ranges[field][0] && value <= ranges[field][1] &&
          (field !== 'seed' || Number.isInteger(value))) next[field] = value;
    } else if (allowed[field].includes(raw)) next[field] = raw;
  }
  for (const type of ['NICU', 'LNU', 'SCU']) {
    const raw = params.get(type.toLowerCase());
    const value = Number(raw);
    if (raw !== null && Number.isInteger(value) && value >= 0 && value <= 150) next.unitCounts[type] = value;
    for (const [prefix, field, min, max, integer] of [['mean', 'deathsPerYear', .5, 60, false], ['staff', 'staffPerRoster', 10, 200, true]]) {
      const text = params.get(`${prefix}-${type.toLowerCase()}`);
      const number = Number(text);
      if (text !== null && Number.isFinite(number) && number >= min && number <= max && (!integer || Number.isInteger(number))) next[field][type] = number;
    }
  }
  return next;
}

function writeHash() {
  const params = new URLSearchParams();
  for (const [field, key] of Object.entries(hashKeys)) params.set(key, typeof state[field] === 'boolean' ? (state[field] ? '1' : '0') : String(state[field]));
  for (const type of ['NICU', 'LNU', 'SCU']) params.set(type.toLowerCase(), String(state.unitCounts[type]));
  for (const type of ['NICU', 'LNU', 'SCU']) {
    params.set(`mean-${type.toLowerCase()}`, String(state.deathsPerYear[type]));
    params.set(`staff-${type.toLowerCase()}`, String(state.staffPerRoster[type]));
  }
  const target = '#' + params.toString();
  if (location.hash !== target) history.replaceState(null, '', target);
}

function updateScenario() {
  const items = [
    [1, 'Rule ' + state.rule],
    [2, TEST_NAMES[state.rotaTest]],
    [3, '+' + state.expectedExtraDeaths + ' expected deaths'],
    [4, formatNumber(state.prevalencePer10k, 2) + ' in 10,000'],
    [4, state.riskAllocation === 'staff' ? 'Staff-proportional risk' : 'Equal risk'],
    [5, 'q = ' + formatNumber(state.q, 2)],
    [5, state.investigationMonths + ' months'],
    [1, formatNumber(state.alarmSD, 1) + ' SD alarm line'],
    [2, formatNumber(state.significance * 100, 1) + '% significance']
  ];
  document.querySelector('#scenario-items').innerHTML = items.map(([tab, label]) =>
    '<button type="button" data-go-tab="' + tab + '">' + label + '</button>').join('<span aria-hidden="true">·</span>');
  document.querySelector('#world-summary').textContent = `· ${['NICU', 'LNU', 'SCU'].reduce((total, type) => total + state.unitCounts[type], 0)}: ${['NICU', 'LNU', 'SCU'].map(type => `${state.unitCounts[type]} ${TYPE_NAMES[type].toLowerCase()}`).join(', ')}`;
}

function renderWorld(preserve) {
  const details = document.querySelector('#world-details');
  details.open = state.worldOpen;
  const controls = document.querySelector('#world-controls');
  if (preserve) return;
  controls.innerHTML = ['NICU', 'LNU', 'SCU'].map(type => `<div class="world-type"><h3>${TYPE_NAMES[type]}</h3>
    ${rangeControl('count-' + type, 'Units', 0, 150, 1, state.unitCounts[type], String(state.unitCounts[type]))}
    ${rangeControl('mean-' + type, 'Expected deaths a year', .5, 60, .5, state.deathsPerYear[type], formatNumber(state.deathsPerYear[type], 1))}
    ${rangeControl('staff-' + type, 'Nurses on each roster', 10, 200, 1, state.staffPerRoster[type], String(state.staffPerRoster[type]))}</div>`).join('');
}

function updateSimulationBanner() {
  const banner = document.querySelector('#simulation-banner');
  banner.hidden = plan.paperMode;
  if (plan.paperMode) return;
  const status = simulationError ? `The simulation stopped (${simulationError}). Reset to the paper’s settings or reload the page.` : loading
    ? `${recalibratingType ? `Recalibrating rule E for ${TYPE_NAMES[recalibratingType].toLowerCase()} units… · ` : 'Updating · '}${completed} of ${plan.jobs.length} estimates` : 'Estimates ready';
  banner.innerHTML = `<strong>Simulation mode</strong> · each estimate uses ${REFERENCE.inputs.reps.toLocaleString()} simulated ten-year unit histories, or ${REFERENCE.inputs.det_reps.toLocaleString()} simulated offender-years for detection · seed ${state.seed}
    <span class="simulation-progress">${status}</span><button type="button" data-sim-action="baseline">Reset to the paper’s settings</button><button type="button" data-sim-action="seed">Re-run with new random numbers</button>`;
}

function drawFigure() {
  const details = document.querySelector('#figure2-details');
  if (!details || !details.open) return;
  const result = calculate(state);
  const svg = details.querySelector('#tradeoff-chart');
  drawTradeoff(svg, result, state, index => setState({ thresholdIndex: index }));
  drawUnitChart(details.querySelector('#unit-chart'), result.selected, state.unitType);
  details.querySelector('#ratio-value').textContent = formatNumber(result.selected.falsePerTrue, 0) + ':1';
  details.querySelector('#detection-value').textContent = formatNumber(result.selected.detectionProbability * 100, 1) + '%';
  details.querySelector('#wait-value').textContent = formatNumber(result.selected.yearsPerDetection, 0) + ' years';
}

function render(preserveField = null) {
  if (!preserveField && document.activeElement?.matches('input[type="range"][data-field]'))
    preserveField = document.activeElement.dataset.field;
  const currentReference = plan.paperMode ? REFERENCE : effectiveReference(state, REFERENCE, plan, simulation, previousSimulation);
  const adjustedPosterior = !plan.paperMode && state.rotaTest === 'adj';
  const live = deriveAll(state, currentReference, { adjustedPosterior });
  const paper = deriveAll(PAPER_DEFAULT, REFERENCE);
  const cacheKey = JSON.stringify([state, completed, loading, adjustedPosterior]);
  if (!plan.paperMode && !loading && !simulationError && cacheKey !== intervalCacheKey) {
    intervalCache = derivedIntervals(state, currentReference, live, adjustedPosterior);
    intervalCacheKey = cacheKey;
  }
  const context = { reference: currentReference, intervals: loading ? null : intervalCache,
    simMode: !plan.paperMode, loading, adjustedPosterior, plan };
  document.querySelector('.scope-note').textContent = plan.paperMode
    ? 'The tables start from the paper’s own simulation run and recalculate exactly as you change settings. Counts for hypothetical settings are scenarios, not estimates of real offender prevalence.'
    : 'Simulation estimates carry 95% intervals; paper values remain beside them. This is a hypothetical scenario, not an estimate of real offender prevalence.';
  updateScenario();
  updateSimulationBanner();
  renderWorld(preserveField && /^(count|mean|staff)-/.test(preserveField));
  tabViews.forEach((viewFunction, index) => {
    const tabNumber = index + 1;
    const tab = document.querySelector('#tab-' + tabNumber);
    const panel = document.querySelector('#panel-' + tabNumber);
    const active = tabNumber === state.activeTab;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    panel.hidden = !active;
    const view = viewFunction(state, live, paper, REFERENCE, context);
    if (!plan.paperMode) view.takeaway = view.takeaway.replace(/^(In the paper’s setting: )([A-Z])/, (_, prefix, first) => prefix + first.toLowerCase());
    if (!plan.paperMode) view.working = `<p class="source-explainer"><strong>Sources.</strong> “Simulated” values come from the simulation running in your browser. “Derived” values are calculated from them. Unlabelled values are the paper’s. Dimmed values are still updating.</p>${view.working}`;
    const markup = renderLayout(tabNumber, view);
    if (preserveField && active) {
      const temp = document.createElement('div');
      temp.innerHTML = markup;
      for (const part of ['graph', 'table', 'working', 'fixed', 'takeaway']) {
        const fresh = temp.querySelector('[data-part="' + part + '"]');
        const old = panel.querySelector('[data-part="' + part + '"]');
        if (fresh && old) old.replaceWith(fresh);
      }
      const freshOutput = temp.querySelector('[data-output="' + preserveField + '"]');
      panel.querySelectorAll('[data-output="' + preserveField + '"]').forEach(output => {
        if (freshOutput) output.textContent = freshOutput.textContent;
      });
    } else panel.innerHTML = markup;
  });
  if (preserveField && /^(count|mean|staff)-/.test(preserveField)) {
    const [kind, type] = preserveField.split('-');
    const output = document.querySelector('#world-controls [data-output="' + preserveField + '"]');
    if (output) output.textContent = String(kind === 'count' ? state.unitCounts[type]
      : kind === 'mean' ? state.deathsPerYear[type] : state.staffPerRoster[type]);
  }
  document.querySelectorAll('[role="tabpanel"]').forEach(panel => panel.classList.toggle('sim-updating', loading));
  drawFigure();
}

function stopSimulation() {
  if (debounce) clearTimeout(debounce);
  debounce = null;
  if (worker) worker.terminate();
  worker = null;
  runId++;
  loading = false;
  completed = 0;
  simulationError = '';
  recalibratingType = null;
  if (plan.paperMode) simulation = { chance: {}, detection: {}, calibration: {} };
  if (plan.paperMode) previousSimulation = null;
  intervalCache = null;
  intervalCacheKey = '';
}

function scheduleSimulation() {
  previousSimulation = simulation;
  stopSimulation();
  simulation = { chance: {}, detection: {}, calibration: {} };
  loading = true;
  const id = runId;
  debounce = setTimeout(() => {
    debounce = null;
    if (id !== runId || plan.paperMode) return;
    if (!plan.jobs.length) { loading = false; render(); return; }
    try {
      worker = createSimulationWorker();
      worker.addEventListener('message', event => {
        const message = event.data;
        if (id !== runId) return;
        if (message.type === 'ready') {
          worker.postMessage({ type: 'run', id, options: simulationOptions(state, REFERENCE, plan, calibrationCache) });
        } else if (message.id === id && message.type === 'progress') {
          const job = message.progress;
          if (job.kind === 'calibration') {
            recalibratingType = job.stage === 'start' ? job.type : null;
            if (job.stage === 'done') {
              simulation.calibration[job.type] = job.value;
              for (const [rule, key] of Object.entries(job.value.keys)) calibrationCache[key] = job.value.thresholds[rule];
            }
          } else {
            if (job.kind === 'chance') (simulation.chance[job.rule] ||= {})[job.type] = job.value;
            else ((simulation.detection[job.effect] ||= {})[job.rule] ||= {})[job.type] = job.value;
            completed = job.completed;
          }
          render();
        } else if (message.id === id && message.type === 'result') {
          simulation = message.result;
          previousSimulation = null;
          completed = plan.jobs.length;
          loading = false;
          recalibratingType = null;
          worker.terminate();
          worker = null;
          render();
        } else if (message.id === id && message.type === 'error') {
          simulationError = message.message;
          loading = false;
          worker.terminate();
          worker = null;
          render();
        }
      });
      worker.addEventListener('error', event => {
        if (id !== runId) return;
        simulationError = event.message || 'Worker failed';
        loading = false;
        worker.terminate(); worker = null; render();
      });
    } catch (error) {
      simulationError = error.message;
      loading = false;
      render();
    }
  }, 300);
}

function setState(patch, preserveField = null) {
  const previousPlan = plan;
  state = { ...state, ...patch };
  plan = simulationPlan(state, REFERENCE);
  writeHash();
  const simInputChanged = ['deathsPerYear', 'staffPerRoster', 'alarmSD', 'significance', 'expectedExtraDeaths', 'seed'].some(key => Object.hasOwn(patch, key));
  const priorityChanged = loading && ['activeTab', 'rule', 'unitType'].some(key => Object.hasOwn(patch, key));
  const adjChanged = !plan.paperMode && state.rotaTest === 'adj' && patch.rotaTest === 'adj';
  if (plan.paperMode) stopSimulation();
  else if (simInputChanged || priorityChanged || adjChanged || previousPlan.paperMode) scheduleSimulation();
  render(preserveField);
}

function setField(field, raw, preserve = false, log = false) {
  if (field.startsWith('count-')) {
    const type = field.slice(6);
    if (!Object.hasOwn(state.unitCounts, type)) return;
    setState({ unitCounts: { ...state.unitCounts, [type]: Number(raw) } }, preserve ? field : null);
    return;
  }
  for (const [prefix, key] of [['mean-', 'deathsPerYear'], ['staff-', 'staffPerRoster']]) {
    if (field.startsWith(prefix)) {
      const type = field.slice(prefix.length);
      if (!Object.hasOwn(state[key], type)) return;
      setState({ [key]: { ...state[key], [type]: Number(raw) } }, preserve ? field : null);
      return;
    }
  }
  if (!Object.hasOwn(hashKeys, field)) return;
  let value = log ? sliderToPrevalence(raw) : numericFields.has(field) ? Number(raw) : raw;
  if (field === 'prevalencePer10k') value = Math.min(30, Math.max(.1, value));
  setState({ [field]: value }, preserve ? field : null);
}

document.addEventListener('click', event => {
  const tab = event.target.closest('[data-tab]');
  if (tab) { setState({ activeTab: Number(tab.dataset.tab) }); tab.focus(); return; }
  const scenario = event.target.closest('[data-go-tab]');
  if (scenario) { const next = Number(scenario.dataset.goTab); setState({ activeTab: next }); document.querySelector('#tab-' + next).focus(); return; }
  const choice = event.target.closest('[data-set-field]');
  if (choice) { setField(choice.dataset.setField, choice.dataset.value); return; }
  const action = event.target.closest('[data-sim-action]');
  if (action?.dataset.simAction === 'seed') { setState({ seed: (state.seed + 1) >>> 0 }); return; }
  if (action?.dataset.simAction === 'baseline' || event.target.closest('#reset-button')) {
    state = cloneDefaults(); plan = simulationPlan(state, REFERENCE); stopSimulation(); writeHash(); render();
  }
});

document.addEventListener('input', event => {
  const input = event.target.closest('input[data-field]');
  if (input) setField(input.dataset.field, input.value, true, input.dataset.log === 'true' || input.dataset.field === 'prevalencePer10k');
});
document.addEventListener('change', event => {
  const input = event.target.closest('input[data-field]');
  if (input) render();
});
document.querySelector('.tabbar').addEventListener('keydown', event => {
  const current = Number(document.activeElement.dataset.tab);
  if (!current || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 1 : event.key === 'End' ? 5 : ((current - 1 + (event.key === 'ArrowRight' ? 1 : 4)) % 5) + 1;
  setState({ activeTab: next });
  document.querySelector('#tab-' + next).focus();
});
document.addEventListener('toggle', event => {
  if (event.target.id === 'world-details' || event.target.id === 'figure2-details') {
    const field = event.target.id === 'world-details' ? 'worldOpen' : 'figureOpen';
    if (state[field] !== event.target.open) { state = { ...state, [field]: event.target.open }; writeHash(); }
    if (field === 'figureOpen' && event.target.open) drawFigure();
  }
}, true);
window.addEventListener('hashchange', () => {
  state = readHash(); plan = simulationPlan(state, REFERENCE);
  if (plan.paperMode) stopSimulation(); else scheduleSimulation();
  render();
});
window.addEventListener('resize', () => { if (state.activeTab === 4) drawFigure(); });
state = readHash();
plan = simulationPlan(state, REFERENCE);
if (!plan.paperMode) scheduleSimulation();
render();
