import { TYPES } from '../derive.js';
import { directInterval } from '../sim/intervals.js';
import { TYPE_NAMES, cellSource, choiceControl, compareCell, fixedList, formatNumber, formatPercent, rangeControl, table } from './common.js';

function detectionRow(type, cell, selected) {
  if (cell.d === null) return `<div class="detection-row unavailable-rule"><strong>${TYPE_NAMES[type]}</strong><p>Rule E needs recalibration; coming in 3c.</p></div>`;
  const interval = directInterval(cell, 'd');
  return `<div class="detection-row ${selected ? 'highlighted' : ''}"><div class="detection-heading"><strong>${TYPE_NAMES[type]}</strong><span>${formatPercent(cell.d, 1)} unit alarms${interval ? ` · 95% ${formatPercent(interval[0], 1)}–${formatPercent(interval[1], 1)}` : ''}</span></div><div class="detection-track"><span class="detection-fill" style="width:${(cell.d * 100).toFixed(2)}%"></span>${interval ? `<i class="detection-error" style="left:${(interval[0] * 100).toFixed(2)}%;width:${((interval[1] - interval[0]) * 100).toFixed(2)}%"></i>` : ''}<span class="background-mark" style="left:${(cell.bg * 100).toFixed(2)}%" title="Background alarm rate ${formatPercent(cell.bg, 1)}"></span><span class="identification-mark" style="left:${(cell.flag_off * 100).toFixed(2)}%" title="Identification among alarms ${formatPercent(cell.flag_off, 1)}"></span></div></div>`;
}

export function renderTab3(state, live, paper, reference, context = {}) {
  const selected = live.detection[state.rule][state.unitType];
  const controls = rangeControl('expectedExtraDeaths', 'Offender’s expected extra deaths', 1, 15, 1, state.expectedExtraDeaths, `+${formatNumber(state.expectedExtraDeaths, 0)} in 12 months`)
    + choiceControl('expectedExtraDeaths', 'Paper presets', [[4, '+4'], [7, '+7']], state.expectedExtraDeaths)
    + choiceControl('unitType', 'Unit type highlighted', [['NICU', 'Intensive care'], ['LNU', 'Local'], ['SCU', 'Special care']], state.unitType);
  const graph = `<p class="graph-note">Rule ${state.rule} · expected +${state.expectedExtraDeaths} deaths</p>${TYPES.map(type => detectionRow(type, live.detection[state.rule][type], type === state.unitType)).join('')}
    <div class="graph-key"><span class="graph-key-item"><span class="key-swatch teal"></span>unit alarm</span><span class="graph-key-item"><span class="key-swatch grey"></span>background alarm</span><span class="graph-key-item"><span class="key-swatch orange"></span>offender identified among alarmed units</span></div><p class="graph-note">The orange identification marker has a different denominator from the alarm bar.</p>`;
  const rows = live.rules.map(rule => {
    const cell = live.detection[rule];
    const baseline = paper.detection[rule];
    return `<tr class="${rule === state.rule ? 'selected-row' : ''}"><th scope="row">${rule}</th>${TYPES.map(type => compareCell(cell[type].d, baseline[type].d, value => formatPercent(value, 0), { source: cellSource(cell[type], 'd'), interval: directInterval(cell[type], 'd') })).join('')}${compareCell(cell.LNU.flag_off, baseline.LNU.flag_off, value => formatPercent(value, 0), { source: cellSource(cell.LNU, 'flag_off'), interval: directInterval(cell.LNU, 'flag_off') })}${compareCell(cell.LNU.bg, baseline.LNU.bg, value => formatPercent(value, 0), { source: cellSource(cell.LNU, 'bg'), interval: directInterval(cell.LNU, 'bg') })}</tr>`;
  });
  const liveTable = table(['Rule', 'Intensive care alarm', 'Local alarm', 'Special care alarm', 'Local identification if alarmed', 'Local background alarm'], rows, `Table 3 · +${state.expectedExtraDeaths} expected deaths in one year`);
  const working = `<p><strong>One-year detection sensitivity</strong> means the unit alarms at least once while an offender is present. For ${TYPE_NAMES[state.unitType].toLowerCase()} under rule ${state.rule}, this is <strong>${formatPercent(selected.d, 1)}</strong>.</p><p>With no offender, the same unit type alarms <strong>${formatPercent(selected.bg, 1)}</strong> of the time. If the offender unit alarms, the rota review identifies the offender <strong>${formatPercent(selected.flag_off, 1)}</strong> of the time. Alarm and identification are separate outcomes.</p>`;
  return { kicker: 'Offender present', title: 'Alarm is not identification', question: 'When an offender is present, how often does the unit alarm, and how often does the rota point to them?', controls,
    graphTitle: 'Three outcomes by unit type', graph, tableTitle: 'Live Table 3', table: liveTable, working,
    fixed: fixedList(['The offender is present at every extra death they cause.', 'The effect is a Poisson mean over the first 12 months.', 'The offender has a 21% shift share.', 'Ties for top attendance are shared fairly among tied nurses.', 'Detection counts any unit alarm in the offender-year, even if background deaths caused it.']),
    takeaway: `No rule does both: rules that alarm often point to the wrong nurse, and rules that point correctly rarely alarm. Under rule ${state.rule}, ${TYPE_NAMES[state.unitType].toLowerCase()} units with an offender alarm ${formatPercent(selected.d, 0)} of the time; conditional on an alarm, the rota identifies the offender ${formatPercent(selected.flag_off, 0)} of the time.` };
}
