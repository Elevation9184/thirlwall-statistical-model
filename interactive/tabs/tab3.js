import { TYPES } from '../derive.js';
import { TYPE_NAMES, choiceControl, compareCell, fixedList, formatPercent, table } from './common.js';

function detectionRow(type, cell, selected) {
  return `<div class="detection-row ${selected ? 'highlighted' : ''}"><div class="detection-heading"><strong>${TYPE_NAMES[type]}</strong><span>${formatPercent(cell.d, 1)} unit alarms</span></div><div class="detection-track"><span class="detection-fill" style="width:${(cell.d * 100).toFixed(2)}%"></span><span class="background-mark" style="left:${(cell.bg * 100).toFixed(2)}%" title="Background alarm rate ${formatPercent(cell.bg, 1)}"></span><span class="identification-mark" style="left:${(cell.flag_off * 100).toFixed(2)}%" title="Identification among alarms ${formatPercent(cell.flag_off, 1)}"></span></div></div>`;
}

export function renderTab3(state, live, paper) {
  const selected = live.detection[state.rule][state.unitType];
  const controls = choiceControl('expectedExtraDeaths', 'Offender’s expected extra deaths', [[4, '+4 in 12 months'], [7, '+7 in 12 months']], state.expectedExtraDeaths)
    + choiceControl('unitType', 'Unit type highlighted', [['NICU', 'Intensive care'], ['LNU', 'Local'], ['SCU', 'Special care']], state.unitType);
  const graph = `<p class="graph-note">Rule ${state.rule} · expected +${state.expectedExtraDeaths} deaths</p>${TYPES.map(type => detectionRow(type, live.detection[state.rule][type], type === state.unitType)).join('')}
    <div class="graph-key"><span class="key-swatch teal"></span>unit alarm <span class="key-swatch grey"></span>background alarm <span class="key-swatch orange"></span>offender identified among alarmed units</div><p class="graph-note">The orange identification marker has a different denominator from the alarm bar.</p>`;
  const rows = live.rules.map(rule => {
    const cell = live.detection[rule];
    const baseline = paper.detection[rule];
    return `<tr class="${rule === state.rule ? 'selected-row' : ''}"><th scope="row">${rule}</th>${TYPES.map(type => compareCell(cell[type].d, baseline[type].d, value => formatPercent(value, 0))).join('')}${compareCell(cell.LNU.flag_off, baseline.LNU.flag_off, value => formatPercent(value, 0))}${compareCell(cell.LNU.bg, baseline.LNU.bg, value => formatPercent(value, 0))}</tr>`;
  });
  const liveTable = table(['Rule', 'Intensive care alarm', 'Local alarm', 'Special care alarm', 'Local identification if alarmed', 'Local background alarm'], rows, `Table 3 · +${state.expectedExtraDeaths} expected deaths in one year`);
  const working = `<p><strong>One-year detection sensitivity</strong> means the unit alarms at least once while an offender is present. For ${TYPE_NAMES[state.unitType].toLowerCase()} under rule ${state.rule}, this is <strong>${formatPercent(selected.d, 1)}</strong>.</p><p>With no offender, the same unit type alarms <strong>${formatPercent(selected.bg, 1)}</strong> of the time. If the offender unit alarms, the rota review identifies the offender <strong>${formatPercent(selected.flag_off, 1)}</strong> of the time. Alarm and identification are separate outcomes.</p>`;
  return { kicker: 'Offender present', title: 'Alarm is not identification', question: 'When an offender is present, how often does the unit alarm, and how often does the rota point to them?', controls,
    graphTitle: 'Three outcomes by unit type', graph, tableTitle: 'Live Table 3', table: liveTable, working,
    fixed: fixedList(['The offender is present at every extra death they cause.', 'The effect is a Poisson mean of +4 or +7 deaths over the first 12 months.', 'The offender has a 21% shift share.', 'Ties for top attendance are shared fairly among tied nurses.', 'Detection counts any unit alarm in the offender-year, even if background deaths caused it.']),
    takeaway: `Under rule ${state.rule}, ${TYPE_NAMES[state.unitType].toLowerCase()} units with an offender alarm ${formatPercent(selected.d, 0)} of the time; conditional on an alarm, the rota identifies the offender ${formatPercent(selected.flag_off, 0)} of the time.` };
}
