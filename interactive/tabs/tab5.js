import { TEST_NAMES, choiceControl, compareCell, fixedList, formatNumber, formatPercent, printedQs, rangeControl, table } from './common.js';

function costPlot(state, live) {
  const base = live.flags[state.rule].base;
  const months = state.investigationMonths;
  const upper = Math.max(base, base * months / 12, 1);
  const x = q => 44 + q * 356;
  const y = value => 180 - value / upper * 140;
  const path = factor => `M${x(0)},${y(0)} L${x(1)},${y(base * factor)}`;
  return `<svg class="cost-plot" viewBox="0 0 430 225" role="img" aria-label="Nurses flagged per year and off wards against share of alarms searched">
    <line class="axis" x1="44" y1="180" x2="400" y2="180"/><line class="axis" x1="44" y1="40" x2="44" y2="180"/>
    <text x="42" y="202">0</text><text x="366" y="202">q = 1</text><text x="3" y="43">${formatNumber(upper, 0)}</text>
    <path class="flag-line" d="${path(1)}"/><path class="wards-line" d="${path(months / 12)}"/>
    <circle class="flag-point" cx="${x(state.q)}" cy="${y(base * state.q)}" r="6"/>
    <circle class="wards-point" cx="${x(state.q)}" cy="${y(base * state.q * months / 12)}" r="6"/>
  </svg>`;
}

export function renderTab5(state, live, paper) {
  const selected = live.flags[state.rule];
  const details = live.posteriorDetails[state.rule];
  const posteriorAvailable = state.rotaTest === 'own';
  const posteriorText = posteriorAvailable ? formatPercent(live.posteriors[state.rule], 2) : 'not computed';
  const controls = rangeControl('q', 'Share of chance alarms searched (q)', 0, 1, .01, state.q, formatPercent(state.q, 0))
    + `<div class="preset-row">${[1, .5, .25, .1].map(q => `<button type="button" data-set-field="q" data-value="${q}" aria-pressed="${state.q === q}">q = ${q}</button>`).join('')}</div>`
    + rangeControl('investigationMonths', 'Investigation length', 1, 36, 1, state.investigationMonths, `${state.investigationMonths} months`);
  const graph = `<p class="graph-note">Rule ${state.rule} · ${TEST_NAMES[state.rotaTest]} · ${formatNumber(selected.current, 1)} nurse-flagging episodes a year at your q</p>
    ${costPlot(state, live)}<div class="graph-key"><span class="key-swatch teal"></span>flagging episodes per year <span class="key-swatch orange"></span>nurses off wards at one time</div>
    <p class="graph-note">At q = ${formatNumber(state.q, 2)}, ${formatNumber(selected.offWards, 1)} nurses are off wards at any one time if each investigation lasts ${state.investigationMonths} months.</p>`;
  const rows = live.rules.map(rule => {
    const now = live.flags[rule];
    const baseline = paper.flags[rule];
    const qCells = printedQs.map(q => {
      const liveText = formatNumber(now.byQ[q], 1);
      const liveDistinct = posteriorAvailable ? `${formatNumber(live.chance[rule].distinctOwn * q, 1)} distinct` : 'distinct not computed';
      const paperText = `${formatNumber(baseline.byQ[q], 1)} (${formatNumber(paper.chance[rule].distinctOwn * q, 1)} distinct)`;
      const same = posteriorAvailable && `${liveText} (${liveDistinct})` === paperText;
      return `<td><span class="live-value">${liveText}</span><small class="distinct-value">${liveDistinct}</small>${same ? '' : `<small class="paper-value">paper ${paperText}</small>`}</td>`;
    }).join('');
    return `<tr class="${rule === state.rule ? 'selected-row' : ''}"><th scope="row">${rule}</th>${qCells}${compareCell(now.current, baseline.current, value => formatNumber(value, 1))}${compareCell(now.offWards, baseline.offWards, value => formatNumber(value, 1))}${posteriorAvailable ? compareCell(live.posteriors[rule], paper.posteriors[rule], value => formatPercent(value, 2)) : '<td>not computed</td>'}</tr>`;
  });
  const liveTable = table(['Rule', 'q = 1', 'q = 0.5', 'q = 0.25', 'q = 0.1', 'Your q', 'Off wards', 'Posterior'], rows,
    'Table 5 · nurse-flagging episodes per year with distinct nurses underneath; posterior for own-exposure test only');
  const working = `<p><strong>Flagging episodes / yr</strong> = ${formatNumber(selected.base, 3)} × ${formatNumber(state.q, 2)} = <strong>${formatNumber(selected.current, 3)}</strong>.</p>
    <p><strong>Off wards at one time</strong> = ${formatNumber(selected.current, 3)} × ${state.investigationMonths} ÷ 12 = <strong>${formatNumber(selected.offWards, 3)}</strong>.</p>
    ${posteriorAvailable ? `<p><strong>Chance a flagged nurse is the offender</strong> = offender correctly identified ÷ all flags = ${formatNumber(details.offenderFlagged, 6)} ÷ (${formatNumber(details.anyFlaggedWithOffender, 6)} + ${formatNumber(details.backgroundFlags, 6)}) = <strong>${posteriorText}</strong>. The factor q cancels from numerator and denominator.</p>` : `<p><strong>Chance a flagged nurse is the offender: not computed.</strong> The reference run exported offender-identification and any-flag rates for the own-exposure test only; a ${TEST_NAMES[state.rotaTest].toLowerCase()} posterior is unavailable.</p>`}`;
  return { kicker: 'Human cost', title: 'What happens after an alarm', question: 'How many people are flagged, and how likely is a flagged nurse to be the offender?', controls,
    graphTitle: 'People affected as searches change', graph, tableTitle: 'Live Table 5', table: liveTable, working,
    fixed: fixedList(['The chance-alarm and rota-test rates come from the Python reference run.', 'The model assumes every searched alarm receives the selected rota test.', 'Posterior estimates use the own-exposure test and count both background and offender-year flags.', 'A flagged nurse is off wards for the full investigation period in this scenario.']),
    takeaway: `With q = ${formatNumber(state.q, 2)}, rule ${state.rule} produces ${formatNumber(selected.current, 1)} nurse-flagging episodes a year and ${formatNumber(selected.offWards, 1)} nurses off wards at one time. The offender posterior is ${posteriorText}${posteriorAvailable ? ' and does not depend on q' : ''}.` };
}
