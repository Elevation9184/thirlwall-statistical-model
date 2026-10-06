import { PAPER_DEFAULT } from './presets.js';
import { SWEEP } from './reference/figure2-data.js';
import { calculate, prevalenceToSlider, sliderToPrevalence } from './model.js';
import { drawTradeoff, drawUnitChart } from './charts.js';
import { deriveAll } from './derive.js';
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
  worldOpen: 'world'
};
const numericFields = new Set(['activeTab', 'thresholdIndex', 'prevalencePer10k', 'expectedExtraDeaths', 'q', 'investigationMonths', 'mechanismRoster', 'mechanismDeaths']);
const allowed = {
  rule: REFERENCE.inputs.rules, rotaTest: ['avg', 'own', 'adj'],
  unitType: ['NICU', 'LNU', 'SCU'], riskAllocation: ['staff', 'equal']
};
const ranges = {
  activeTab: [1, 5], thresholdIndex: [0, SWEEP.length - 1], prevalencePer10k: [.1, 30],
  expectedExtraDeaths: [4, 7], q: [0, 1], investigationMonths: [1, 36],
  mechanismRoster: [20, 200], mechanismDeaths: [2, 40]
};
let state = cloneDefaults();

function cloneDefaults() {
  return { ...PAPER_DEFAULT, unitCounts: { ...PAPER_DEFAULT.unitCounts } };
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
          (field !== 'expectedExtraDeaths' || value === 4 || value === 7)) next[field] = value;
    } else if (allowed[field].includes(raw)) next[field] = raw;
  }
  for (const type of ['NICU', 'LNU', 'SCU']) {
    const raw = params.get(type.toLowerCase());
    const value = Number(raw);
    if (raw !== null && Number.isInteger(value) && value >= 0 && value <= 150) next.unitCounts[type] = value;
  }
  return next;
}

function writeHash() {
  const params = new URLSearchParams();
  for (const [field, key] of Object.entries(hashKeys)) params.set(key, typeof state[field] === 'boolean' ? (state[field] ? '1' : '0') : String(state[field]));
  for (const type of ['NICU', 'LNU', 'SCU']) params.set(type.toLowerCase(), String(state.unitCounts[type]));
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
    [5, state.investigationMonths + ' months']
  ];
  document.querySelector('#scenario-items').innerHTML = items.map(([tab, label]) =>
    '<button type="button" data-go-tab="' + tab + '">' + label + '</button>').join('<span aria-hidden="true">·</span>');
  document.querySelector('#world-summary').textContent = ['NICU', 'LNU', 'SCU'].map(type => state.unitCounts[type]).join(' / ');
}

function renderWorld(preserve) {
  const details = document.querySelector('#world-details');
  details.open = state.worldOpen;
  const controls = document.querySelector('#world-controls');
  if (preserve) return;
  controls.innerHTML = ['NICU', 'LNU', 'SCU'].map(type =>
    rangeControl('count-' + type, TYPE_NAMES[type] + ' units', 0, 150, 1, state.unitCounts[type], String(state.unitCounts[type]))).join('');
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
  const live = deriveAll(state, REFERENCE);
  const paper = deriveAll(PAPER_DEFAULT, REFERENCE);
  updateScenario();
  renderWorld(preserveField && preserveField.startsWith('count-'));
  tabViews.forEach((viewFunction, index) => {
    const tabNumber = index + 1;
    const tab = document.querySelector('#tab-' + tabNumber);
    const panel = document.querySelector('#panel-' + tabNumber);
    const active = tabNumber === state.activeTab;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    panel.hidden = !active;
    const markup = renderLayout(tabNumber, viewFunction(state, live, paper, REFERENCE));
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
  if (preserveField && preserveField.startsWith('count-')) {
    const type = preserveField.slice(6);
    const output = document.querySelector('#world-controls [data-output="' + preserveField + '"]');
    if (output) output.textContent = String(state.unitCounts[type]);
  }
  drawFigure();
}

function setState(patch, preserveField = null) {
  state = { ...state, ...patch };
  writeHash();
  render(preserveField);
}

function setField(field, raw, preserve = false, log = false) {
  if (field.startsWith('count-')) {
    const type = field.slice(6);
    if (!Object.hasOwn(state.unitCounts, type)) return;
    setState({ unitCounts: { ...state.unitCounts, [type]: Number(raw) } }, preserve ? field : null);
    return;
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
  if (event.target.closest('#reset-button')) { state = cloneDefaults(); writeHash(); render(); }
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
window.addEventListener('hashchange', () => { state = readHash(); render(); });
window.addEventListener('resize', () => { if (state.activeTab === 4) drawFigure(); });
state = readHash();
render();
