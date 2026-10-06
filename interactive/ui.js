import { PAPER_DEFAULT, UNIT_NAMES } from './presets.js';
import { SWEEP } from './reference/figure2-data.js';
import { calculate, prevalenceToSlider, sliderToPrevalence } from './model.js';
import { drawTradeoff, drawUnitChart } from './charts.js';

let state = { ...PAPER_DEFAULT };
const $ = selector => document.querySelector(selector);
const number = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

function formatPrevalence(value) {
  return new Intl.NumberFormat('en', { maximumSignificantDigits: 2 }).format(value);
}

function render() {
  const result = calculate(state);
  const selected = result.selected;
  $('#threshold-slider').value = String(state.thresholdIndex);
  $('#prevalence-slider').value = String(prevalenceToSlider(state.prevalencePer10k));
  $(`input[name="unit-type"][value="${state.unitType}"]`).checked = true;
  $('#threshold-value').textContent = `1 in ${number.format(selected.interval)} unit-years`;
  $('#prevalence-value').textContent = `${formatPrevalence(state.prevalencePer10k)} per 10,000 unit-years`;
  $('#ratio-value').textContent = `${number.format(Math.round(selected.falsePerTrue))} : 1`;
  $('#detection-value').textContent = `${(selected.detectionProbability * 100).toFixed(1)}%`;
  $('#selected-unit-label').textContent = `In a ${UNIT_NAMES[state.unitType]}, within 12 months`;
  $('#wait-value').textContent = `${number.format(Math.round(selected.yearsPerDetection))} years`;

  document.querySelectorAll('[data-threshold]').forEach(button => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.threshold) === state.thresholdIndex));
  });
  document.querySelectorAll('[data-prevalence]').forEach(button => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.prevalence) === state.prevalencePer10k));
  });
  $('.reference-legend').hidden = state.prevalencePer10k === 1;
  drawTradeoff($('#tradeoff-chart'), result, state, thresholdIndex => setState({ thresholdIndex }));
  drawUnitChart($('#unit-chart'), selected, state.unitType);
}

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

$('#threshold-slider').addEventListener('input', event => setState({ thresholdIndex: Number(event.target.value) }));
$('#prevalence-slider').addEventListener('input', event => setState({ prevalencePer10k: sliderToPrevalence(event.target.value) }));
document.querySelectorAll('input[name="unit-type"]').forEach(input => {
  input.addEventListener('change', event => setState({ unitType: event.target.value }));
});
document.querySelectorAll('[data-threshold]').forEach(button => {
  button.addEventListener('click', () => setState({ thresholdIndex: Number(button.dataset.threshold) }));
});
document.querySelectorAll('[data-prevalence]').forEach(button => {
  button.addEventListener('click', () => setState({ prevalencePer10k: Number(button.dataset.prevalence) }));
});
$('#reset-button').addEventListener('click', () => { state = { ...PAPER_DEFAULT }; render(); });

// Keep the source dataset's 11 settings in the slider's accessible range.
$('#threshold-slider').max = String(SWEEP.length - 1);
window.addEventListener('resize', render);
render();
