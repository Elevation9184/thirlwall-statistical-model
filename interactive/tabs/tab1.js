import { TYPES } from '../derive.js';
import { RULE_NAMES, TYPE_NAMES, choiceControl, compareCell, fixedList, formatNumber, table } from './common.js';

function dotsFor(type, count, expected) {
  const full = Math.floor(expected);
  const remainder = expected - full;
  const dots = Array.from({ length: count }, (_, index) => {
    const opacity = index < full ? 1 : index === full ? remainder : 0;
    return `<i class="unit-dot" style="--lit:${opacity.toFixed(4)}"></i>`;
  }).join('');
  return `<div class="dot-group" aria-label="${TYPE_NAMES[type]}: ${formatNumber(expected, 1)} of ${count} expected to alarm"><div class="dot-label"><strong>${TYPE_NAMES[type]}</strong><span>${formatNumber(expected, 1)} of ${count}</span></div><div class="dot-field">${dots || '<span class="muted">No units selected</span>'}</div></div>`;
}

export function renderTab1(state, live, paper, reference) {
  const current = live.chance[state.rule];
  const controls = choiceControl('rule', 'Monitoring rule', live.rules.map(rule => [rule, RULE_NAMES[rule]]), state.rule)
    + '<p class="control-note">Rule E assumes perfect knowledge of each month’s expected deaths.</p>';
  const graph = `<p class="graph-note">Expected count, a typical year · ${formatNumber(current.alarmUnitYears, 1)} alarming unit-years among ${Object.values(state.unitCounts).reduce((a, b) => a + b, 0)} units</p>
    ${TYPES.map(type => dotsFor(type, state.unitCounts[type], state.unitCounts[type] * current.byType[type].alpha)).join('')}`;
  const rows = live.rules.map(rule => {
    const cell = live.chance[rule];
    const baseline = paper.chance[rule];
    return `<tr class="${rule === state.rule ? 'selected-row' : ''}"><th scope="row">${rule}</th><td class="trigger-cell">${reference.inputs.labels[rule]}</td>${compareCell(cell.alarmUnitYears, baseline.alarmUnitYears, value => formatNumber(value, 1))}${compareCell(cell.episodes, baseline.episodes, value => formatNumber(value, 1))}${TYPES.map(type => compareCell(cell.byType[type].alpha, baseline.byType[type].alpha, value => formatNumber(value, 3))).join('')}</tr>`;
  });
  const liveTable = table(['Rule', 'Alarm condition', 'Alarming unit-years / yr', 'Episodes / yr', 'Intensive care', 'Local', 'Special care'], rows, 'Table 1 · chance alarms; per-type columns are shares of unit-years');
  const terms = TYPES.map(type => `${state.unitCounts[type]} × ${formatNumber(current.byType[type].alpha, 3)}`).join(' + ');
  const working = `<p><strong>Alarming unit-years a year</strong> = Σ units of each type × chance that type alarms.</p><p class="formula">${terms} = <strong>${formatNumber(current.alarmUnitYears, 1)}</strong>.</p><p>Episodes use the separate per-unit episode rates. Figure 2’s 11-point false-crossing target can be tuned in Tab 4; it does not supply intermediate Table 1 alarm-unit-year rates.</p>`;
  return { kicker: 'Noise', title: 'Chance alarms', question: 'How many alarms does chance alone produce?', controls,
    graphTitle: 'Where the expected alarms land', graph, tableTitle: 'Live Table 1', table: liveTable, working,
    fixed: fixedList(['Mortality means: 20 / 4 / 1 deaths per year in intensive care, local and special care units.', 'Year-to-year rate variation: 25%.', 'Rules A–D use the preceding three-year average, with a 0.5-death floor.', 'Four years of history and ten years of monitoring.', 'The idealised CUSUM is tuned to a doubling of deaths.']),
    takeaway: `Chance alone produces between 3 and 34 alarms a year in England and Wales, depending on the rule. Under ${state.rule}, chance produces ${formatNumber(current.alarmUnitYears, 1)} alarming unit-years and ${formatNumber(current.episodes, 1)} episodes a year across the selected unit mix.` };
}
