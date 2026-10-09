import { PAPER_DEFAULT } from '../presets.js';
import { TEST_NAMES, compareCell, fixedList, formatNumber, formatPercent, formatPosterior, posteriorDisplay, printedQs, rangeControl, table } from './common.js';

function costPlot(state, live, intervals) {
  const base = live.flags[state.rule].base;
  if (base === null) return '<p class="unavailable-rule">not computed</p>';
  const months = state.investigationMonths;
  const upper = Math.max(base || 0, (base || 0) * months / 12, 1);
  const x = q => 58 + q * 307;
  const y = value => 215 - value / upper * 183;
  const path = factor => `M${x(0)},${y(0)} L${x(1)},${y(base * factor)}`;
  const flagRange = intervals?.[`flags|${state.rule}|${state.q}`];
  const wardsRange = intervals?.[`offWards|${state.rule}`];
  const errorBar = (range, className) => range ? `<line class="cost-error ${className}" x1="${x(state.q)}" x2="${x(state.q)}" y1="${y(range[0])}" y2="${y(range[1])}"/>` : '';
  return `<svg class="cost-plot" viewBox="0 0 390 290" role="img" aria-label="People flagged per year and off wards against share of alarms searched">
    <line class="axis" x1="58" y1="215" x2="365" y2="215"/><line class="axis" x1="58" y1="32" x2="58" y2="215"/>
    <line class="plot-grid" x1="58" y1="${y(upper / 2)}" x2="365" y2="${y(upper / 2)}"/><line class="plot-grid" x1="58" y1="32" x2="365" y2="32"/>
    <text class="axis-tick" x="49" y="219" text-anchor="end">0</text><text class="axis-tick" x="49" y="${y(upper / 2) + 4}" text-anchor="end">${formatNumber(upper / 2, 0)}</text><text class="axis-tick" x="49" y="36" text-anchor="end">${formatNumber(upper, 0)}</text>
    <text class="axis-tick" x="58" y="238" text-anchor="middle">0</text><text class="axis-tick" x="${x(.5)}" y="238" text-anchor="middle">0.5</text><text class="axis-tick" x="365" y="238" text-anchor="middle">1</text>
    <text class="axis-title" x="211" y="276" text-anchor="middle">Share of alarms searched (q)</text><text class="axis-title" x="16" y="128" text-anchor="middle" transform="rotate(-90 16 128)">People</text>
    <path class="flag-line" d="${path(1)}"/><path class="wards-line" d="${path(months / 12)}"/>
    ${errorBar(flagRange, 'flag-error')}${errorBar(wardsRange, 'wards-error')}
    <circle class="flag-point" cx="${x(state.q)}" cy="${y(base * state.q)}" r="6"/>
    <circle class="wards-point" cx="${x(state.q)}" cy="${y(base * state.q * months / 12)}" r="6"/>
  </svg>`;
}

export function renderTab5(state, live, paper, reference, context = {}) {
  const selected = live.flags[state.rule];
  const details = live.posteriorDetails[state.rule];
  const posteriorAvailable = state.rotaTest === 'own' || (context.simMode && state.rotaTest === 'adj');
  const posteriorValue = posteriorAvailable ? live.posteriors[state.rule] : null;
  // At q = 0 no alarm is searched and no nurse is flagged, so the conditional chance has nothing to condition on.
  const noSearch = state.q === 0;
  const shownPosterior = value => noSearch ? '<span class="posterior-display unavailable">not applicable: no alarms searched</span>' : posteriorDisplay(value);
  const controls = rangeControl('q', 'Share of all alarms followed by a rota search (q)', 0, 1, .01, state.q, formatPercent(state.q, 0))
    + `<div class="preset-row">${[1, .5, .25, .1].map(q => `<button type="button" data-set-field="q" data-value="${q}" aria-pressed="${state.q === q}">q = ${q}</button>`).join('')}</div>`
    + rangeControl('investigationMonths', 'Investigation length', 1, 36, 1, state.investigationMonths, `${state.investigationMonths} months`);
  const graph = `<p class="graph-note">Rule ${state.rule} · ${TEST_NAMES[state.rotaTest]} · ${formatNumber(selected.current, 1)} nurse-flagging episodes a year at your q</p>
    ${costPlot(state, live, context.intervals)}<div class="graph-key"><span class="graph-key-item"><span class="key-swatch teal"></span>nurse-flagging episodes a year</span><span class="graph-key-item"><span class="key-swatch orange"></span>nurses off wards at one time</span></div>
    <p class="graph-note">At q = ${formatNumber(state.q, 2)}, ${formatNumber(selected.offWards, 1)} nurses are off wards at any one time if each investigation lasts ${state.investigationMonths} months.</p>
    <div class="chart-posterior"><span>Chance a flagged nurse is the offender${context.adjustedPosterior ? ' · maximum-adjusted, simulated' : ''}</span>${shownPosterior(posteriorValue)}${context.intervals?.[`posterior|${state.rule}`] ? `<small>95% ${formatPercent(context.intervals[`posterior|${state.rule}`][0], 3)}–${formatPercent(context.intervals[`posterior|${state.rule}`][1], 3)}</small>` : ''}</div>`;
  const rows = live.rules.map(rule => {
    const now = live.flags[rule];
    // Paper values for the selected rota test, at the paper's q and investigation length.
    const paperBase = paper.chance[rule].flags[state.rotaTest];
    const scaled = factor => paperBase === null ? null : paperBase * factor;
    const baseline = { current: scaled(PAPER_DEFAULT.q), offWards: scaled(PAPER_DEFAULT.q * PAPER_DEFAULT.investigationMonths / 12) };
    const own = state.rotaTest === 'own';
    const pending = rule.startsWith('E') && (Object.values(live.chance[rule].byType).some(cell => cell._pending)
      || Object.values(live.detection[rule]).some(cell => cell._pending));
    const qCells = printedQs.map(q => {
      const liveText = formatNumber(now.byQ[q], 1);
      const liveDistinct = own ? `${formatNumber(live.chance[rule].distinctOwn === null ? null : live.chance[rule].distinctOwn * q, 1)} distinct` : 'distinct not computed';
      const paperValue = formatNumber(scaled(q), 1);
      const paperDistinct = `${formatNumber(paper.chance[rule].distinctOwn * q, 1)} distinct`;
      const paperText = own ? `${paperValue} (${paperDistinct})` : paperValue;
      const same = liveText === paperValue && (!own || liveDistinct === paperDistinct);
      const interval = context.intervals?.[`flags|${rule}|${q}`];
      return `<td data-source="${interval ? 'derived' : same ? 'paper' : 'derived'}"><span class="live-value">${liveText}${interval ? ` (${formatNumber(interval[0], 1)}–${formatNumber(interval[1], 1)})` : ''}</span><small class="distinct-value">${liveDistinct}</small>${same && !interval ? '' : `<small class="paper-value">paper ${paperText}</small>`}</td>`;
    }).join('');
    const currentPosterior = posteriorAvailable ? live.posteriors[rule] : null;
    const livePosterior = formatPosterior(currentPosterior);
    const paperPosterior = formatPosterior(paper.posteriors[rule]);
    const posteriorInterval = context.intervals?.[`posterior|${rule}`];
    const paperComparison = !noSearch && posteriorAvailable && (context.simMode || livePosterior.odds !== paperPosterior.odds || livePosterior.percentage !== paperPosterior.percentage)
      ? `<small class="paper-value">paper ${context.adjustedPosterior ? 'not computed' : `${paperPosterior.odds}<br>${paperPosterior.percentage}`}</small>` : '';
    return `<tr class="${rule === state.rule ? 'selected-row' : ''} ${pending ? 'pending-rule' : ''}"><th scope="row">${rule}</th>${qCells}${compareCell(now.current, baseline.current, value => formatNumber(value, 1), { interval: context.intervals?.[`flags|${rule}|${state.q}`] })}${compareCell(now.offWards, baseline.offWards, value => formatNumber(value, 1), { interval: context.intervals?.[`offWards|${rule}`] })}<td class="posterior-cell" data-source="${posteriorInterval ? 'derived' : context.adjustedPosterior ? 'pending' : 'paper'}">${shownPosterior(currentPosterior)}${posteriorInterval ? `<small class="source-value">simulated · 95% ${formatPercent(posteriorInterval[0], 3)}–${formatPercent(posteriorInterval[1], 3)}</small>` : ''}${paperComparison}</td></tr>`;
  });
  const liveTable = table(['Rule', 'q = 1', 'q = 0.5', 'q = 0.25', 'q = 0.1', 'Your q', 'Nurses off wards at one time', 'Chance flagged nurse is offender'], rows,
    `Table 5 · nurse-flagging episodes per year with distinct nurses underneath; chance a flagged nurse is the offender, ${context.adjustedPosterior ? 'maximum-adjusted test, simulated' : 'own-exposure test'}`);
  const working = `<p><strong>Nurse-flagging episodes a year</strong> = ${formatNumber(selected.base, 3)} × ${formatNumber(state.q, 2)} = <strong>${formatNumber(selected.current, 3)}</strong>.</p>
    <p><strong>Off wards at one time</strong> = ${formatNumber(selected.current, 3)} × ${state.investigationMonths} ÷ 12 = <strong>${formatNumber(selected.offWards, 3)}</strong>.</p>
    ${posteriorAvailable ? `<p><strong>Chance a flagged nurse is the offender</strong> = offender correctly identified ÷ all flags = ${formatNumber(details.offenderFlagged, 6)} ÷ (${formatNumber(details.anyFlaggedWithOffender, 6)} + ${formatNumber(details.backgroundFlags, 6)}) = ${posteriorDisplay(posteriorValue)}. The factor q cancels from numerator and denominator.${context.adjustedPosterior ? ' This maximum-adjusted result is simulated.' : ''}${noSearch ? ' At q = 0 no nurse is flagged, so the chance does not apply; the figure above is its limit as q approaches zero.' : ''}</p>` : `<p><strong>Chance a flagged nurse is the offender: not computed.</strong> The paper’s simulation recorded the rates needed for the own-exposure test only.${state.rotaTest === 'adj' ? ' Change any simulation setting to estimate it for the maximum-adjusted test.' : ''}</p>`}`;
  return { kicker: 'Human cost', title: 'What happens after an alarm', question: 'How many people are flagged, and how likely is a flagged nurse to be the offender?', controls,
    graphTitle: 'People affected as searches change', graph, tableTitle: 'Live Table 5', table: liveTable, working,
    fixed: fixedList(['The model assumes every searched alarm receives the selected rota test.', 'This chance counts flags from years with and without an offender.', 'A flagged nurse is off wards for the full investigation period in this scenario.']),
    takeaway: `${context.simMode ? 'In the paper’s setting: ' : ''}When the same share of every kind of alarm is searched, q sets the volume of harm, not the odds: searching fewer alarms flags fewer innocent nurses and finds proportionally fewer offenders. With q = ${formatNumber(state.q, 2)}, rule ${state.rule} produces ${formatNumber(selected.current, 1)} nurse-flagging episodes a year and ${formatNumber(selected.offWards, 1)} nurses off wards at one time. ${noSearch ? 'With no alarms searched, no nurse is flagged, so the chance that a flagged nurse is the offender does not apply.' : `The chance that a flagged nurse is the offender ${posteriorAvailable ? 'does not depend on q and is' : 'is'} ${posteriorDisplay(posteriorValue)}.`}` };
}
