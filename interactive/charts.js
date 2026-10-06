const NS = 'http://www.w3.org/2000/svg';
const LOG_X_SPAN = Math.log10(2000); // 0.05% to 100%

function node(name, attrs = {}, text = '') {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (text) element.textContent = text;
  return element;
}

function label(value) {
  return value >= 1000 ? `${value / 1000}k` : String(value);
}

export function scales(plot) {
  return {
    x: probability => plot.left + (Math.log10(probability) + LOG_X_SPAN) / LOG_X_SPAN * (plot.right - plot.left),
    y: ratio => plot.bottom - (Math.log10(ratio) - 1) / 4 * (plot.bottom - plot.top)
  };
}

export function drawTradeoff(svg, result, state, onPointSelected) {
  const title = svg.querySelector('title');
  const desc = svg.querySelector('desc');
  const compact = window.matchMedia('(max-width:760px)').matches;
  svg.setAttribute('viewBox', compact ? '0 0 420 350' : '0 0 760 440');
  const plot = compact ? { left: 49, right: 405, top: 21, bottom: 286 } : { left: 82, right: 730, top: 25, bottom: 358 };
  // The paper uses a log sensitivity axis so the low-detection tail remains legible.
  const { x, y } = scales(plot);
  const contents = [title, desc];
  const grid = node('g', { class: 'chart-grid' });

  for (const tick of [10, 100, 1000, 10000, 100000]) {
    const yy = y(tick);
    grid.append(node('line', { x1: plot.left, x2: plot.right, y1: yy, y2: yy }));
    grid.append(node('text', { x: plot.left - 13, y: yy + 4, 'text-anchor': 'end' }, label(tick)));
  }
  for (const [tick, tickLabel] of [[.001, '0.1%'], [.01, '1%'], [.1, '10%'], [1, '100%']]) {
    const xx = x(tick);
    grid.append(node('line', { x1: xx, x2: xx, y1: plot.top, y2: plot.bottom, class: 'vertical' }));
    grid.append(node('text', { x: xx, y: plot.bottom + 26, 'text-anchor': 'middle' }, tickLabel));
  }
  contents.push(grid);

  const pathFor = curve => curve.map((point, index) =>
    `${index ? 'L' : 'M'} ${x(point.detectionProbability).toFixed(2)} ${y(point.falsePerTrue).toFixed(2)}`).join(' ');

  if (state.prevalencePer10k !== .1) contents.push(node('path', { d: pathFor(result.nationalCurve), class: 'reference-curve national' }));
  if (state.prevalencePer10k !== 1) contents.push(node('path', { d: pathFor(result.neonatalCurve), class: 'reference-curve neonatal' }));
  contents.push(node('path', { d: pathFor(result.curve), class: 'active-curve' }));

  const dots = node('g', { class: 'chart-dots' });
  result.curve.forEach((point, index) => {
    const selected = index === state.thresholdIndex;
    const group = node('g', { class: selected ? 'chart-dot selected' : 'chart-dot', tabindex: '0', role: 'button',
      'aria-label': `One false crossing per ${point.interval} unit-years; detection ${Math.round(point.detectionProbability * 1000) / 10} percent; ${Math.round(point.falsePerTrue)} false crossings per detection` });
    group.append(node('circle', { cx: x(point.detectionProbability), cy: y(point.falsePerTrue), r: selected ? 9 : 5 }));
    group.append(node('circle', { cx: x(point.detectionProbability), cy: y(point.falsePerTrue), r: 17, class: 'hit-area' }));
    group.append(node('title', {}, `1 in ${point.interval} unit-years`));
    group.addEventListener('click', () => onPointSelected(index));
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPointSelected(index); }
    });
    dots.append(group);
  });
  contents.push(dots);

  const selected = result.selected;
  const xx = x(selected.detectionProbability);
  const yy = y(selected.falsePerTrue);
  const annotation = node('g', { class: 'chart-annotation' });
  annotation.append(node('line', { x1: xx, x2: xx, y1: yy + 12, y2: plot.bottom, class: 'guide' }));
  annotation.append(node('text', { x: Math.min(xx + 13, compact ? 346 : 630), y: Math.max(yy - 16, 20) }, `1 in ${selected.interval}`));
  contents.push(annotation);

  svg.replaceChildren(...contents);
  desc.textContent = `Both axes are logarithmic. Selected target: one false crossing in ${selected.interval} unit-years. The selected unit type has a ${(selected.detectionProbability * 100).toFixed(1)} percent chance of an alarm during an offender-year. The model gives ${Math.round(selected.falsePerTrue)} false-alarm crossings per detected offender-year across 175 units.`;
}

export function drawUnitChart(svg, point, selectedType) {
  const title = svg.querySelector('title');
  const desc = svg.querySelector('desc');
  const contents = [title, desc];
  const chart = node('g', { class: 'unit-bars' });
  const left = 137;
  const width = 315;
  for (const tick of [0, .25, .5, .75, 1]) {
    const xx = left + tick * width;
    chart.append(node('line', { x1: xx, x2: xx, y1: 25, y2: 197, class: 'bar-grid' }));
    chart.append(node('text', { x: xx, y: 220, 'text-anchor': 'middle', class: 'bar-axis-label' }, `${tick * 100}%`));
  }
  const rows = [['NICU', 'Intensive care'], ['LNU', 'Local'], ['SCU', 'Special care']];
  rows.forEach(([key, name], index) => {
    const yy = 44 + index * 62;
    const value = point.byUnit[key];
    chart.append(node('text', { x: 0, y: yy + 21, class: key === selectedType ? 'bar-name selected-name' : 'bar-name' }, name));
    chart.append(node('rect', { x: left, y: yy, width, height: 30, rx: 6, class: 'bar-track' }));
    chart.append(node('rect', { x: left, y: yy, width: Math.max(value * width, 2), height: 30, rx: 6,
      class: key === selectedType ? 'bar-fill selected-bar' : 'bar-fill' }));
    chart.append(node('text', { x: Math.min(left + value * width + 9, 463), y: yy + 21, class: 'bar-value' }, `${(value * 100).toFixed(1)}%`));
  });
  contents.push(chart);
  svg.replaceChildren(...contents);
  desc.textContent = rows.map(([key, name]) => `${name}: ${(point.byUnit[key] * 100).toFixed(1)} percent`).join('; ');
}
