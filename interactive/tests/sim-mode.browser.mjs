// Run from interactive/: node tests/sim-mode.browser.mjs [--screenshots]
// Install Playwright or set PLAYWRIGHT_MODULE and PLAYWRIGHT_BROWSER_EXECUTABLE.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const moduleSpecifier = process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright';
const { chromium } = await import(moduleSpecifier);
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const folder = new URL('../screenshots/stage3b/', import.meta.url);
if (process.argv.includes('--screenshots')) await mkdir(folder, { recursive: true });

async function screenshot(name) {
  if (!process.argv.includes('--screenshots')) return;
  for (const width of [1400, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: fileURLToPath(new URL(`${name}-${width}.png`, folder)), fullPage: true });
  }
  await page.setViewportSize({ width: 1400, height: 900 });
}

async function change(selector, value) {
  return page.evaluate(({ selector, value }) => new Promise((resolveChange, rejectChange) => {
    const banner = document.querySelector('#simulation-banner');
    const started = performance.now();
    let first = null;
    const timeout = setTimeout(() => { observer.disconnect(); rejectChange(new Error(`Timed out: ${selector}=${value}`)); }, 120000);
    const observer = new MutationObserver(() => {
      const text = banner.textContent;
      if (first === null && /Updating\s*·\s*[1-9]\d*\s+of/.test(text)) first = performance.now() - started;
      if (text.includes('Estimates ready')) {
        clearTimeout(timeout); observer.disconnect();
        resolveChange({ firstMs: first, completeMs: performance.now() - started });
      }
      if (text.includes('Simulation error')) {
        clearTimeout(timeout); observer.disconnect(); rejectChange(new Error(text));
      }
    });
    observer.observe(banner, { subtree: true, childList: true, characterData: true });
    const input = document.querySelector(selector);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }), { selector, value: String(value) });
}

const tableText = () => page.evaluate(() => [...document.querySelectorAll('[role="tabpanel"] table')].map(table => table.textContent));
const restore = async (selector, value, baseline) => {
  await page.locator(selector).evaluate((input, next) => {
    input.value = next; input.dispatchEvent(new Event('input', { bubbles: true }));
  }, String(value));
  assert.equal(await page.locator('#simulation-banner').isHidden(), true);
  assert.deepEqual(await tableText(), baseline);
};

try {
  await page.goto(new URL('../index.html', import.meta.url).href);
  const baseline = await tableText();
  await screenshot('paper');
  await page.locator('#world-details summary').click();
  const timings = {};
  timings.deaths = await change('#control-mean-LNU', 8);
  assert.equal(await page.locator('#panel-1 .unavailable-row').count(), 2);
  await page.locator('#world-details summary').click();
  await screenshot('deaths-local-8');
  await page.locator('#tab-4').click();
  const tableFit = await page.locator('#panel-4 .tab-table').evaluate(card => {
    const scroller = card.querySelector('.table-scroll');
    const edge = scroller.getBoundingClientRect().right;
    const clippedCells = [...scroller.querySelectorAll('th,td')].filter(cell =>
      cell.getBoundingClientRect().right > edge + 1 ||
      [...cell.querySelectorAll('.live-value,.interval-value,.source-value,.paper-value')]
        .some(value => value.scrollWidth > value.clientWidth + 1));
    return { overflow: scroller.scrollWidth - scroller.clientWidth, clippedCells: clippedCells.length };
  });
  assert.ok(tableFit.overflow <= 1 && tableFit.clippedCells === 0,
    `Tab 4 Live Table clipped at 1400 px: ${JSON.stringify(tableFit)}`);
  await page.setViewportSize({ width: 390, height: 900 });
  assert.equal(await page.locator('#panel-4 .table-hint').isVisible(), true);
  assert.ok(await page.locator('#panel-4 .table-scroll').evaluate(scroller => scroller.scrollWidth > scroller.clientWidth));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('#tab-1').click();
  await page.locator('#world-details summary').click();
  await restore('#control-mean-LNU', 4, baseline);
  timings.roster = await change('#control-staff-LNU', 80);
  await restore('#control-staff-LNU', 40, baseline);
  await page.locator('#tab-1').click();
  timings.alarmLine = await change('#control-alarmSD', 2.5);
  await restore('#control-alarmSD', 2, baseline);
  await page.locator('#tab-2').click();
  timings.significance = await change('#control-significance', .01);
  await page.locator('#world-details summary').click();
  await screenshot('significance-1pct');
  await restore('#control-significance', .05, baseline);
  await page.locator('#tab-3').click();
  timings.offenderEffect = await change('#control-expectedExtraDeaths', 5);
  await restore('#control-expectedExtraDeaths', 4, baseline);
  await page.locator('[data-set-field="expectedExtraDeaths"][data-value="7"]').click();
  assert.equal(await page.locator('#simulation-banner').isHidden(), true);
  await page.locator('[data-set-field="expectedExtraDeaths"][data-value="4"]').click();
  assert.deepEqual(await tableText(), baseline);
  await page.locator('#tab-2').click();
  await change('#control-significance', .1);
  await page.locator('[data-set-field="rotaTest"][data-value="adj"]').click();
  await page.waitForFunction(() => document.querySelector('#simulation-banner').textContent.includes('Estimates ready'), null, { timeout: 120000 });
  await page.locator('#tab-5').click();
  assert.ok(!(await page.locator('#panel-5 .chart-posterior').innerText()).includes('not computed'));
  const oldSeed = new URLSearchParams(new URL(page.url()).hash.slice(1)).get('seed');
  await page.locator('[data-sim-action="seed"]').click();
  await page.waitForFunction(() => document.querySelector('#simulation-banner').textContent.includes('Estimates ready'), null, { timeout: 120000 });
  assert.notEqual(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('seed'), oldSeed);
  await page.locator('[data-sim-action="baseline"]').click();
  assert.equal(await page.locator('#simulation-banner').isHidden(), true);
  assert.deepEqual(await tableText(), baseline);
  assert.equal(errors.length, 0, errors.join('; '));
  if (process.argv.includes('--screenshots'))
    await writeFile(new URL('timings.json', folder), `${JSON.stringify(timings, null, 2)}\n`);
  console.log('file:// Stage 3b browser PASS; timings (first update / complete, ms):', JSON.stringify(timings));
} finally {
  await browser.close();
}
