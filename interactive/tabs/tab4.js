import { SWEEP } from '../reference/figure2-data.js';
import { calculate, prevalenceToSlider } from '../model.js';
import { RULE_NAMES, TYPE_NAMES, choiceControl, compareCell, fixedList, formatNumber, formatRatio, printedRates, rangeControl, table } from './common.js';

function ratioBar(rule, value, years, selected, interval, yearsInterval) {
  const position = number => number ? Math.max(0, Math.min(100, (Math.log10(number) - 1) / 4 * 100)) : 0;
  const width = position(value);
  return `<div class="ratio-row ${selected ? 'highlighted' : ''}"><span>${rule}</span><div class="ratio-track"><i style="width:${width.toFixed(2)}%"></i>${interval ? `<b class="ratio-error" style="left:${position(interval[0]).toFixed(2)}%;width:${(position(interval[1]) - position(interval[0])).toFixed(2)}%"></b>` : ''}</div><strong>${formatRatio(value)}</strong><small>${years === null ? 'not computed' : `${formatNumber(years, 0)} years`}${yearsInterval ? ` (95% ${formatNumber(yearsInterval[0], 0)}–${formatNumber(yearsInterval[1], 0)})` : ''}${interval ? ` · ratio 95% ${formatRatio(interval[0])}–${formatRatio(interval[1])}` : ''}</small></div>`;
}

function figure2Markup(state, context, reference) {
  const figure = calculate(state).selected;
  const unchangedSweepNote = context.simMode && Object.keys(state.deathsPerYear)
    .some(type => state.deathsPerYear[type] !== reference.inputs.types[type].mean)
    ? '<p class="figure2-scope">Figure 2 shows the paper\'s settings; it is not recalculated in simulation mode.</p>' : '';
  return `<details class="figure2-details" id="figure2-details" ${state.figureOpen ? 'open' : ''}>
    <summary>Tune the idealised chart (Figure 2)${unchangedSweepNote ? '<small class="figure2-summary-note">Paper settings; not recalculated in simulation mode</small>' : ''}</summary>
    <div class="figure2-body">${unchangedSweepNote}<p>This reproduces the paper’s Figure 2, with +4 expected deaths, 175 units and risk in proportion to staff. It counts each time the chart crosses its threshold, not unit-years with an alarm, so its ratios are not directly comparable with Table 4.</p>
      <div class="figure2-controls">
        <div><label for="threshold-slider">Idealised chart target</label><output id="threshold-value" data-output="thresholdIndex">1 crossing in ${formatNumber(figure.interval, 0)} unit-years</output><input id="threshold-slider" data-field="thresholdIndex" type="range" min="0" max="${SWEEP.length - 1}" step="1" value="${state.thresholdIndex}"></div>
        <div><label for="figure-prevalence-slider">Base-rate scenario</label><output id="prevalence-value" data-output="prevalencePer10k">${formatNumber(state.prevalencePer10k, 2)} per 10,000</output><input id="figure-prevalence-slider" data-field="prevalencePer10k" data-log="true" type="range" min="0" max="100" step="1" value="${prevalenceToSlider(state.prevalencePer10k)}"></div>
        <div class="choice-list"><button type="button" data-set-field="unitType" data-value="NICU" aria-pressed="${state.unitType === 'NICU'}">Intensive care</button><button type="button" data-set-field="unitType" data-value="LNU" aria-pressed="${state.unitType === 'LNU'}">Local</button><button type="button" data-set-field="unitType" data-value="SCU" aria-pressed="${state.unitType === 'SCU'}">Special care</button></div>
      </div>
      <svg id="tradeoff-chart" viewBox="0 0 760 440" role="img" aria-labelledby="tradeoff-title tradeoff-desc"><title id="tradeoff-title">Figure 2 threshold trade-off</title><desc id="tradeoff-desc">One-year unit-alarm sensitivity and false-alarm crossings per detected offender-year on logarithmic axes.</desc></svg>
      <p class="graph-note">Both axes are logarithmic in this interactive view; the paper uses a linear vertical axis.</p>
      <div class="figure-foot"><span class="legend-line" aria-hidden="true"></span>Current base-rate scenario <span class="reference-legend"><span class="legend-line reference neonatal" aria-hidden="true"></span>Neonatal reference (1 in 10,000)</span><span class="reference-legend"><span class="legend-line reference national" aria-hidden="true"></span>National reference (0.1 in 10,000)</span></div>
      <div class="figure2-metrics"><div><span>False-alarm crossings : detected offender-years</span><strong id="ratio-value">${formatRatio(figure.falsePerTrue)}</strong></div><div><span>One-year unit-alarm sensitivity</span><strong id="detection-value">${formatNumber(figure.detectionProbability * 100, 1)}%</strong></div><div><span>Years between detected offender-years</span><strong id="wait-value">${formatNumber(figure.yearsPerDetection, 0)} years</strong></div></div>
      <svg id="unit-chart" viewBox="0 0 500 240" role="img" aria-labelledby="unit-title unit-desc"><title id="unit-title">One-year unit-alarm sensitivity by unit type</title><desc id="unit-desc">The three unit types at the selected Figure 2 threshold.</desc></svg>
      <p class="method-note"><strong>Detection means the unit alarms during an offender-year.</strong> The alarm may have occurred anyway, and it does not mean the offender is identified. The strictest points are noisier Monte Carlo estimates.</p>
    </div></details>`;
}

export function renderTab4(state, live, paper, reference, context = {}) {
  const selected = live.ratio[state.rule].current;
  const controls = rangeControl('prevalencePer10k', 'Offender base rate', 0, 100, 1, prevalenceToSlider(state.prevalencePer10k),
    `${formatNumber(state.prevalencePer10k, 2)} per 10,000 unit-years`, 'Offender-years per 10,000 unit-years, on a logarithmic slider. 0.1 matches the national conviction record; 1 takes the single neonatal case at face value. Both are scenarios, not estimates.')
    + `<div class="preset-row">${printedRates.map(rate => `<button type="button" data-set-field="prevalencePer10k" data-value="${rate}" aria-pressed="${state.prevalencePer10k === rate}">${rate}</button>`).join('')}</div>`
    + choiceControl('riskAllocation', 'Risk allocation', [['staff', 'In proportion to staff'], ['equal', 'Equal per unit']], state.riskAllocation);
  const graph = `<p class="graph-note">Falsely flagged unit-years per detected offender-year · log scale · current base rate ${formatNumber(state.prevalencePer10k, 2)} per 10,000</p>${live.rules.map(rule => ratioBar(rule, live.ratio[rule].current.ratio, live.ratio[rule].current.years, rule === state.rule, context.intervals?.[`ratio|${rule}|${state.prevalencePer10k}`], context.intervals?.[`years|${rule}|${state.prevalencePer10k}`])).join('')}`;
  const ratioCell = (rule, rate, current) => compareCell(current.ratio, rate === 'current' ? paper.ratio[rule].current.ratio : paper.ratio[rule].printedRates[rate].ratio, formatRatio, {
    interval: context.intervals?.[`ratio|${rule}|${rate === 'current' ? state.prevalencePer10k : rate}`], intervalBelow: true });
  const rows = live.rules.map(rule => `<tr class="${rule === state.rule ? 'selected-row' : ''} ${rule.startsWith('E') && (Object.values(live.chance[rule].byType).some(cell => cell._pending) || Object.values(live.detection[rule]).some(cell => cell._pending)) ? 'pending-rule' : ''}"><th scope="row">${rule}</th>${printedRates.map(rate => ratioCell(rule, rate, live.ratio[rule].printedRates[rate])).join('')}${ratioCell(rule, 'current', live.ratio[rule].current)}</tr>`);
  const liveTable = table(['Rule', ...printedRates.map(rate => `${rate} per 10,000`), 'Your rate'], rows, 'Table 4 · falsely flagged unit-years per detected offender-year; paper baseline is staff-proportional, +4');
  const weights = selected.weights;
  const working = `<p><strong>Falsely flagged unit-years a year</strong> = Σ n<sub>t</sub> × (1 − p × w<sub>t</sub>) × alarm share<sub>t</sub> = <strong>${formatNumber(selected.falseFlagged, 3)}</strong>.</p><p><strong>Detected offender-years a year</strong> = Σ n<sub>t</sub> × p × w<sub>t</sub> × detection sensitivity<sub>t</sub> = <strong>${formatNumber(selected.detected, 5)}</strong>.</p><p class="formula">${formatNumber(selected.falseFlagged, 3)} ÷ ${formatNumber(selected.detected, 5)} = <strong>${formatRatio(selected.ratio)}</strong>; 1 ÷ ${formatNumber(selected.detected, 5)} = <strong>${selected.years === null ? 'not computed' : `${formatNumber(selected.years, 0)} years`}</strong>.</p><p>For this unit mix, each unit type’s share of offender risk relative to the average unit (${state.riskAllocation === 'staff' ? 'in proportion to staff' : 'equal per unit'}) is ${Object.entries(weights).map(([type, weight]) => `${TYPE_NAMES[type].toLowerCase()} ${formatNumber(weight, 2)}`).join(' · ')}.</p>`;
  return { kicker: 'The ratio', title: 'Rare offenders change the odds', question: 'For every offender-year detected, how many unit-years are falsely flagged?', controls,
    graphTitle: 'Rule by rule', graph, tableTitle: 'Live Table 4', table: liveTable, working,
    fixed: fixedList(['A detected offender-year is any offender-year in which the unit alarms.', 'Table 4 counts falsely flagged unit-years; Figure 2 counts threshold crossings.', 'The main paper case allocates offender risk in proportion to staffing.', 'The base-rate slider is a scenario, not an estimate of actual prevalence.']),
    extra: figure2Markup(state, context, reference),
    takeaway: `${context.simMode ? 'In the paper’s setting: ' : ''}The base rate dominates: changing the rule moves the ratio about fourfold, while the base rates shown span a 300-fold range and move it in proportion. At ${formatNumber(state.prevalencePer10k, 2)} offender-years per 10,000 unit-years, rule ${state.rule} gives ${formatRatio(selected.ratio)} falsely flagged unit-years per detected offender-year and ${selected.years === null ? 'no computable waiting time' : `one detected offender-year across this system about every ${formatNumber(selected.years, 0)} years`}.` };
}
