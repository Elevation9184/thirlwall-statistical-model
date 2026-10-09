import { TYPES } from '../derive.js';
import { directInterval } from '../sim/intervals.js';
import { RULE_NAMES, TYPE_NAMES, cellSource, choiceControl, compareCell, fixedList, formatNumber, rangeControl, table } from './common.js';

function dotsFor(type, count, expected, interval) {
  if (expected === null) return `<div class="dot-group unavailable-rule"><div class="dot-label"><strong>${TYPE_NAMES[type]}</strong><span>not computed</span></div></div>`;
  const full = Math.floor(expected);
  const remainder = expected - full;
  const dots = Array.from({ length: count }, (_, index) => {
    const opacity = index < full ? 1 : index === full ? remainder : 0;
    return `<i class="unit-dot" style="--lit:${opacity.toFixed(4)}"></i>`;
  }).join('');
  return `<div class="dot-group" aria-label="${TYPE_NAMES[type]}: ${formatNumber(expected, 1)} of ${count} expected to trigger an alarm"><div class="dot-label"><strong>${TYPE_NAMES[type]}</strong><span>${formatNumber(expected, 1)} of ${count}</span></div><div class="dot-field">${dots || '<span class="muted">No units selected</span>'}</div>${interval ? `<div class="chart-interval" role="img" aria-label="95% interval ${formatNumber(interval[0], 1)} to ${formatNumber(interval[1], 1)} expected alarms"><i></i><span>95% ${formatNumber(interval[0], 1)}–${formatNumber(interval[1], 1)}</span></div>` : ''}</div>`;
}

function conditionLabel(rule, sd, reference) {
  const line = value => `${formatNumber(value, 1)} SD`;
  if (rule === 'A') return `Annual check, ${line(sd)}`;
  if (rule === 'B') return `Annual check, ${line(sd + 1)}`;
  if (rule === 'C') return `Rolling 12 months, checked monthly, ${line(sd)}`;
  if (rule === 'D') return 'Rolling 12 months, checked monthly, deaths doubled (at least 4)';
  return reference.inputs.labels[rule];
}

export function renderTab1(state, live, paper, reference, context = {}) {
  const current = live.chance[state.rule];
  const controls = choiceControl('rule', 'Monitoring rule', live.rules.map(rule => [rule, RULE_NAMES[rule]]), state.rule)
    + rangeControl('alarmSD', 'Alarm line for rules A and C, in standard deviations (SD) above expected deaths', 1.5, 3.5, .1, state.alarmSD, `${formatNumber(state.alarmSD, 1)} SD`, 'SD is shorthand: each line is a one-sided Poisson cut-off at the matching normal percentile (2 SD = 97.7th). Rule B sits one SD higher. Rules D and E do not use this line.')
    + '<p class="control-note">Rule E assumes perfect knowledge of each month’s expected deaths.</p>';
  const graph = `<p class="graph-note">Expected count, a typical year · ${formatNumber(current.alarmUnitYears, 1)} unit-years with an alarm among ${Object.values(state.unitCounts).reduce((a, b) => a + b, 0)} units</p>
    ${TYPES.map(type => {
      const cell = current.byType[type];
      const interval = directInterval(cell, 'alpha');
      return dotsFor(type, state.unitCounts[type], cell.alpha === null ? null : state.unitCounts[type] * cell.alpha,
        interval ? interval.map(value => value * state.unitCounts[type]) : null);
    }).join('')}`;
  const rows = live.rules.map(rule => {
    const cell = live.chance[rule];
    const baseline = paper.chance[rule];
    const pending = rule.startsWith('E') && TYPES.some(type => cell.byType[type]._pending);
    return `<tr class="${rule === state.rule ? 'selected-row' : ''} ${pending ? 'pending-rule' : ''}"><th scope="row">${rule}</th><td class="trigger-cell">${conditionLabel(rule, state.alarmSD, reference)}</td>${compareCell(cell.alarmUnitYears, baseline.alarmUnitYears, value => formatNumber(value, 1), { source: context.simMode && cell.alarmUnitYears !== baseline.alarmUnitYears ? 'derived' : undefined, interval: context.intervals?.[`alarmUnitYears|${rule}`] })}${compareCell(cell.episodes, baseline.episodes, value => formatNumber(value, 1), { interval: context.intervals?.[`episodes|${rule}`] })}${TYPES.map(type => compareCell(cell.byType[type].alpha, baseline.byType[type].alpha, value => formatNumber(value, 3), { source: cellSource(cell.byType[type], 'alpha'), interval: directInterval(cell.byType[type], 'alpha') })).join('')}</tr>`;
  });
  const liveTable = table(['Rule', 'Alarm condition', 'Unit-years with an alarm, a year', 'Alarm episodes a year', 'Intensive care', 'Local', 'Special care'], rows, 'Table 1 · chance alarms; per-type columns are shares of unit-years');
  const terms = TYPES.map(type => `${state.unitCounts[type]} × ${formatNumber(current.byType[type].alpha, 3)}`).join(' + ');
  const thresholdRows = context.simMode ? TYPES.filter(type => state.deathsPerYear[type] !== reference.inputs.types[type].mean)
    .flatMap(type => ['E10', 'E50'].map(rule => {
      const recalibrated = context.reference?.calibration?.[type]?.thresholds?.[rule];
      return `<li>${rule} threshold, ${TYPE_NAMES[type].toLowerCase()} units: ${formatNumber(reference.cusum_h[`${rule}|${type}`], 2)} (paper) → ${recalibrated ? `${formatNumber(recalibrated, 2)} (recalibrated)` : 'recalibrating…'}</li>`;
    })) : [];
  const working = `<p><strong>Unit-years with an alarm, a year</strong> = Σ units of each type × chance that an alarm is triggered on that type.</p><p class="formula">${terms} = <strong>${formatNumber(current.alarmUnitYears, 1)}</strong>.</p><p>An alarm episode is a run of back-to-back alarmed checks. The Figure 2 slider in Tab 4 does not change this table.</p>${thresholdRows.length ? `<p><strong>Rule E’s threshold is reset</strong> for each unit type whose deaths you changed, using 50,000 simulated ten-year histories with no offender.</p><ul class="threshold-list">${thresholdRows.join('')}</ul>` : ''}`;
  return { kicker: 'Noise', title: 'Chance alarms', question: 'How many alarms does chance alone produce?', controls,
    graphTitle: 'Where the expected alarms land', graph, tableTitle: 'Live Table 1', table: liveTable, working,
    fixed: fixedList(['Each unit’s death rate varies by about 25% from year to year.', 'Rules A–D compare with the preceding three-year average, never below half a death a year.', 'Four years of history and ten years of monitoring.', 'Rule E is an idealised cumulative-sum (CUSUM) chart: it keeps a running score of the evidence that deaths have doubled, and is triggered when that score crosses a threshold.']),
    takeaway: `${context.simMode ? 'In the paper’s setting: ' : ''}Chance alone produces between 3 and 34 alarms a year in England and Wales, depending on the rule. Under rule ${state.rule}, chance produces ${formatNumber(current.alarmUnitYears, 1)} unit-years with an alarm and ${formatNumber(current.episodes, 1)} episodes a year across the selected unit mix.` };
}
