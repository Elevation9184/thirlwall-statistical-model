export const RULE_NAMES = Object.freeze({
  A: 'A · annual 2σ', B: 'B · annual 3σ', C: 'C · monthly 2σ',
  D: 'D · doubling', E10: 'E10 · idealised', E50: 'E50 · idealised'
});
export const TYPE_NAMES = Object.freeze({ NICU: 'Intensive care', LNU: 'Local', SCU: 'Special care' });
export const TEST_NAMES = Object.freeze({ avg: 'Average-exposure', own: 'Own-exposure', adj: 'Maximum-adjusted' });
export const printedRates = [.1, 1, 3, 10, 30];
export const printedQs = [1, .5, .25, .1];

export function formatNumber(value, digits = 1) {
  return value === null || !Number.isFinite(value) ? 'not computed' : new Intl.NumberFormat('en', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}
export function formatPercent(value, digits = 1) {
  return value === null || !Number.isFinite(value) ? 'not computed' : `${formatNumber(value * 100, digits)}%`;
}
export function formatRatio(value) { return value === null || !Number.isFinite(value) ? 'not computed' : `${formatNumber(value, 0)}:1`; }

export function compareCell(value, paper, formatter = value => formatNumber(value)) {
  const liveText = formatter(value);
  const paperText = formatter(paper);
  return `<td><span class="live-value">${liveText}</span>${liveText !== paperText ? `<small class="paper-value">paper ${paperText}</small>` : ''}</td>`;
}

export function rangeControl(field, title, min, max, step, value, display, help = '') {
  return `<div class="control-field"><label for="control-${field}">${title}</label>${help ? `<p>${help}</p>` : ''}<output data-output="${field}">${display}</output><input id="control-${field}" type="range" data-field="${field}" min="${min}" max="${max}" step="${step}" value="${value}"><div class="range-ends"><span>${min}</span><span>${max}</span></div></div>`;
}

export function choiceControl(field, title, options, selected, help = '') {
  return `<div class="control-field"><div class="control-title">${title}</div>${help ? `<p>${help}</p>` : ''}<div class="choice-list">${options.map(([value, label]) => `<button type="button" data-set-field="${field}" data-value="${value}" aria-pressed="${selected === value}">${label}</button>`).join('')}</div></div>`;
}

export function fixedList(items) {
  return `<h3>Fixed assumptions</h3><ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
}

export function renderLayout(id, view) {
  return `<div class="tab-intro"><div class="eyebrow">Step ${id} · ${view.kicker}</div><h2>${view.title}</h2><p>${view.question}</p></div>
    <div class="tab-layout">
      <section class="tab-controls card" data-part="controls"><h3>Controls</h3>${view.controls}</section>
      <section class="tab-graph card" data-part="graph"><h3>${view.graphTitle}</h3>${view.graph}</section>
      <section class="tab-table card" data-part="table"><h3>${view.tableTitle}</h3>${view.table}</section>
      <section class="tab-working card" data-part="working"><h3>How this number is made</h3>${view.working}</section>
      <aside class="tab-fixed card" data-part="fixed">${view.fixed}</aside>
      ${view.extra ? `<section class="tab-extra" data-part="extra">${view.extra}</section>` : ''}
    </div><p class="takeaway" data-part="takeaway"><strong>Takeaway.</strong> ${view.takeaway}</p>`;
}

export function bar(label, value, maximum, valueText, className = '') {
  const width = maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 0;
  return `<div class="bar-row ${className}"><span class="bar-label">${label}</span><div class="bar-track"><span class="bar-fill" style="width:${width.toFixed(2)}%"></span></div><strong>${valueText}</strong></div>`;
}

export function table(headers, rows, caption) {
  return `<div class="table-scroll"><table><caption>${caption}</caption><thead><tr>${headers.map(header => `<th scope="col">${header}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div><p class="table-hint">Scroll sideways to see every column →</p>`;
}
