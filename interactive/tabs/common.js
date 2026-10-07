export const RULE_NAMES = Object.freeze({
  A: 'A · annual 2σ', B: 'B · annual 3σ', C: 'C · monthly 2σ',
  D: 'D · doubling', E10: 'E10 · idealised', E50: 'E50 · idealised'
});
export const TYPE_NAMES = Object.freeze({ NICU: 'Intensive care', LNU: 'Local', SCU: 'Special care' });
export const TEST_NAMES = Object.freeze({ avg: 'Average-exposure', own: 'Own-exposure', adj: 'Maximum-adjusted' });
export const printedRates = [.1, 1, 3, 10, 30];
export const printedQs = [1, .5, .25, .1];
export const RECALIBRATION_LABEL = 'Needs recalibration (Stage 3c)';

const roundingView = new DataView(new ArrayBuffer(8));

// Python's fixed-point format rounds the exact binary float, with ties to even.
// Intl.NumberFormat rounds decimal ties differently (0.0185 becomes 0.019).
function pythonFixed(value, digits) {
  roundingView.setFloat64(0, Math.abs(value));
  const bits = roundingView.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const mantissa = exponent ? (1n << 52n) | fraction : fraction;
  const binaryPower = exponent ? exponent - 1075 : -1074;
  let numerator = mantissa * 10n ** BigInt(digits);
  let denominator = 1n;
  if (binaryPower >= 0) numerator <<= BigInt(binaryPower);
  else denominator <<= BigInt(-binaryPower);
  let rounded = numerator / denominator;
  const remainder = numerator % denominator;
  if (2n * remainder > denominator || (2n * remainder === denominator && rounded % 2n === 1n)) rounded++;
  const fixed = rounded.toString().padStart(digits + 1, '0');
  const integer = (digits ? fixed.slice(0, -digits) : fixed).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${value < 0 || Object.is(value, -0) ? '-' : ''}${integer}${digits ? `.${fixed.slice(-digits)}` : ''}`;
}

export function formatNumber(value, digits = 1) {
  return value === null || !Number.isFinite(value) ? 'not computed' : pythonFixed(value, digits);
}
export function formatPercent(value, digits = 1) {
  return value === null || !Number.isFinite(value) ? 'not computed' : `${formatNumber(value * 100, digits)}%`;
}
export function formatRatio(value) { return value === null || !Number.isFinite(value) ? 'not computed' : `${formatNumber(value, 0)}:1`; }

export function formatPosterior(value) {
  if (value === 0) return { odds: '0 observed', percentage: '0.000%' };
  if (value === null || !Number.isFinite(value) || value < 0) return { odds: 'not computed', percentage: null };
  const reciprocal = 1 / value;
  const decimalPlaces = 1 - Math.floor(Math.log10(reciprocal));
  const scale = 10 ** Math.max(0, -decimalPlaces);
  const rounded = Number(pythonFixed(reciprocal / scale, Math.max(0, decimalPlaces)).replaceAll(',', '')) * scale;
  return { odds: `1 in ${formatNumber(rounded, Math.max(0, decimalPlaces))}`, percentage: formatPercent(value, 3) };
}

export function posteriorDisplay(value) {
  const formatted = formatPosterior(value);
  return formatted.percentage
    ? `<span class="posterior-display"><strong>${formatted.odds}</strong><small>${formatted.percentage}</small></span>`
    : '<span class="posterior-display unavailable">not computed</span>';
}

export function compareCell(value, paper, formatter = value => formatNumber(value), options = {}) {
  const liveText = options.source === 'unavailable' && value === null ? RECALIBRATION_LABEL : formatter(value);
  const paperText = formatter(paper);
  const source = options.source || (liveText === paperText ? 'paper' : 'derived');
  const interval = options.interval && source !== 'paper'
    ? `${options.intervalBelow ? '' : ' '}<span class="interval-value${options.intervalBelow ? ' interval-below' : ''}">(${formatter(options.interval[0])}–${formatter(options.interval[1])})</span>` : '';
  const paperComparison = source === 'simulated' || source === 'pending' || (source === 'derived' && options.interval) || liveText !== paperText;
  return `<td data-source="${source}"><span class="live-value">${liveText}${options.intervalBelow ? '' : interval}</span>${options.intervalBelow ? interval : ''}${source === 'simulated' || source === 'pending' || interval ? `<small class="source-value">${source === 'pending' ? 'updating' : source === 'derived' ? 'derived · 95% interval' : 'simulated · 95% interval'}</small>` : ''}${paperComparison ? `<small class="paper-value">paper ${paperText}</small>` : ''}</td>`;
}

export function cellSource(cell, key) { return cell?._source?.[key] || 'paper'; }

export function estimateText(value, formatter, interval) {
  return `${formatter(value)}${interval ? ` (${formatter(interval[0])}–${formatter(interval[1])})` : ''}`;
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
    <div class="tab-layout tab-layout-${id}">
      <section class="tab-controls card" data-part="controls"><h3>Controls</h3>${view.controls}</section>
      <section class="tab-graph card" data-part="graph"><h3>${view.graphTitle}</h3>${view.graph}</section>
      <section class="tab-table card" data-part="table"><h3>${view.tableTitle}</h3>${view.table}</section>
      <section class="tab-working card" data-part="working"><h3>How this number is made</h3>${view.working}</section>
      <aside class="tab-fixed card" data-part="fixed">${view.fixed}</aside>
      ${view.extra ? `<section class="tab-extra" data-part="extra">${view.extra}</section>` : ''}
    </div><p class="takeaway" data-part="takeaway"><strong>Takeaway.</strong> ${view.takeaway}</p>`;
}

export function bar(label, value, maximum, valueText, className = '', interval = null) {
  const width = maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 0;
  const low = interval && maximum > 0 ? Math.max(0, Math.min(100, interval[0] / maximum * 100)) : 0;
  const high = interval && maximum > 0 ? Math.max(0, Math.min(100, interval[1] / maximum * 100)) : 0;
  return `<div class="bar-row ${className}"><span class="bar-label">${label}</span><div class="bar-track"><span class="bar-fill" style="width:${width.toFixed(2)}%"></span>${interval ? `<i class="bar-error" style="left:${low.toFixed(2)}%;width:${(high - low).toFixed(2)}%"></i>` : ''}</div><strong>${valueText}</strong></div>`;
}

export function table(headers, rows, caption) {
  return `<div class="table-scroll"><table><caption>${caption}</caption><thead><tr>${headers.map(header => `<th scope="col">${header}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div><p class="table-hint">Scroll sideways to see every column →</p>`;
}
