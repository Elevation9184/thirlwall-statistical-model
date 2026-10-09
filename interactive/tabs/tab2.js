import { TYPES } from '../derive.js';
import { directInterval } from '../sim/intervals.js';
import { TYPE_NAMES, TEST_NAMES, bar, cellSource, choiceControl, compareCell, fixedList, formatNumber, formatPercent, rangeControl, table } from './common.js';

function mechanismPlot(mechanism, roster) {
  const x = n => 28 + n / 200 * 306;
  const y = probability => 145 - probability * 115;
  const path = mechanism.curve.map((point, index) => `${index ? 'L' : 'M'}${x(point.roster).toFixed(1)},${y(point.probability).toFixed(1)}`).join(' ');
  return `<svg class="mechanism-plot" viewBox="0 0 360 180" role="img" aria-label="Chance of at least one nominally significant nurse as the roster grows"><line x1="28" x2="334" y1="145" y2="145"/><line x1="28" x2="28" y1="30" y2="145"/><text x="28" y="168">0</text><text x="314" y="168">200 nurses</text><text x="1" y="32">100%</text><path d="${path}"/><circle cx="${x(roster)}" cy="${y(mechanism.selected)}" r="6"/></svg>`;
}

export function renderTab2(state, live, paper, reference, context = {}) {
  const current = live.chance[state.rule];
  // The published Table 2 is rule C; other rules compare with the same reference run.
  const baseline = paper.chance[state.rule];
  const selectedFlags = current.flags[state.rotaTest];
  const pendingRule = state.rule.startsWith('E') && TYPES.some(type => current.byType[type]._pending);
  const controls = choiceControl('rotaTest', 'Rota test', [['avg', TEST_NAMES.avg], ['own', TEST_NAMES.own], ['adj', TEST_NAMES.adj]], state.rotaTest)
    + rangeControl('significance', 'Significance level', .01, .1, .005, state.significance, `${formatPercent(state.significance, 1)}`)
    + '<h4>The mechanism</h4><p class="control-note">Test enough nurses and one will look “significant” by chance. These sliders show how often; they do not change Table 2.</p>'
    + rangeControl('mechanismRoster', 'Nurses on a hypothetical roster', 20, 200, 1, state.mechanismRoster, `${state.mechanismRoster} nurses`)
    + rangeControl('mechanismDeaths', 'Deaths reviewed', 2, 40, 1, state.mechanismDeaths, `${state.mechanismDeaths} deaths`);
  const graph = `<p class="graph-note">Selected rule ${state.rule} · ${TEST_NAMES[state.rotaTest]} test</p>
    ${bar('Chance alarming unit-years', current.alarmUnitYears, Math.max(current.alarmUnitYears || 0, selectedFlags || 0), formatNumber(current.alarmUnitYears, 1), '', context.intervals?.[`alarmUnitYears|${state.rule}`])}
    ${bar('Nurse-flagging episodes', selectedFlags, Math.max(current.alarmUnitYears || 0, selectedFlags || 0), formatNumber(selectedFlags, 1), 'accent-bar', context.intervals?.[`baseFlags|${state.rule}|${state.rotaTest}`])}
    <div class="mechanism-panel"><h4>The mechanism, not Table 2</h4><p>With ${state.mechanismDeaths} deaths and the model’s shift mix, a roster of ${state.mechanismRoster} has a <strong>${formatPercent(live.mechanism.selected, 0)}</strong> chance that at least one nurse passes an unadjusted own-exposure test at ${formatPercent(state.significance, 1)} by chance.</p>${mechanismPlot(live.mechanism, state.mechanismRoster)}</div>`;
  const rows = TYPES.map(type => {
    const cell = current.byType[type];
    const prior = baseline.byType[type];
    const display = (key, formatter) => compareCell(cell[key], prior[key], formatter,
      { source: cellSource(cell, key), interval: directInterval(cell, key) });
    return `<tr class="${state.rule.startsWith('E') && cell._pending ? 'pending-rule' : ''}"><th scope="row">${TYPE_NAMES[type]}</th>${display('med_k', value => formatNumber(value, 0))}${display('med_top', value => formatNumber(value, 0))}${display('s_avg', value => formatPercent(value, 0))}${display('s_own', value => formatPercent(value, 0))}${display('s_adj', value => formatPercent(value, 1))}</tr>`;
  });
  rows.push(`<tr class="selected-row ${pendingRule ? 'pending-rule' : ''}"><th scope="row">All reviewed alarms</th><td>—</td><td>—</td>${compareCell(current.shares.avg, baseline.shares.avg, value => formatPercent(value, 0), { interval: context.intervals?.[`share|${state.rule}|avg`] })}${compareCell(current.shares.own, baseline.shares.own, value => formatPercent(value, 0), { interval: context.intervals?.[`share|${state.rule}|own`] })}${compareCell(current.shares.adj, baseline.shares.adj, value => formatPercent(value, 1), { interval: context.intervals?.[`share|${state.rule}|adj`] })}</tr>`);
  rows.push(`<tr class="footer-row ${pendingRule ? 'pending-rule' : ''}"><th scope="row" colspan="5">Nurse-flagging episodes a year · selected test</th>${compareCell(selectedFlags, baseline.flags[state.rotaTest], value => formatNumber(value, 1), { interval: context.intervals?.[`baseFlags|${state.rule}|${state.rotaTest}`] })}</tr>`);
  const liveTable = table(['Unit type', 'Deaths reviewed, median', 'Deaths attended by top nurse, median', 'Average-exposure', 'Own-exposure', 'Maximum-adjusted'], rows, `Table 2 · rule ${state.rule}${state.rule === 'C' ? '' : ' (the paper prints rule C)'}; shares among reviewed chance alarms`);
  const formula = state.rotaTest === 'own' ? 'Σ units × own-exposure flag episodes per unit-year' : `Σ units × reviewed alarms per unit-year × ${TEST_NAMES[state.rotaTest].toLowerCase()} share`;
  const working = `<p><strong>Nurse-flagging episodes a year</strong> = ${formula}.</p><p class="formula">${TYPES.map(type => `${state.unitCounts[type]} × ${formatNumber(current.byType[type].rev, 3)} × ${formatNumber(current.byType[type][`s_${state.rotaTest}`], 3)}`).join(' + ')} ≈ <strong>${formatNumber(selectedFlags, 1)}</strong>.</p><p>The mechanism curve instead tests every nurse on a hypothetical roster independently; it is an exact calculation under the model’s shift mix, not the simulated Table 2 result.</p>`;
  return { kicker: 'Named nurse', title: 'The rota selection step', question: 'How often does a rota search after a chance alarm produce a “significant” nurse?', controls,
    graphTitle: 'From alarms to names', graph, tableTitle: 'Live Table 2', table: liveTable, working,
    fixed: fixedList(['Each nurse’s presence at each death is independent of everyone else’s.', 'Nurses work 13%, 21% or 27% of shifts (35%, 50% and 15% of nurses respectively).', 'At least two deaths are required for rota review.']),
    takeaway: `${context.simMode ? 'In the paper’s setting: ' : ''}About half of chance alarms produce a “significant” nurse under the own-exposure test, and about one in forty under the maximum-adjusted test. ${formatPercent(current.shares[state.rotaTest], 0)} of reviewed chance alarms pass the ${TEST_NAMES[state.rotaTest].toLowerCase()} test under rule ${state.rule}, giving ${formatNumber(selectedFlags, 1)} nurse-flagging episodes a year.` };
}
