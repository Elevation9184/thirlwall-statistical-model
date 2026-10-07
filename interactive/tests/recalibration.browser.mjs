// Run from interactive/: node tests/recalibration.browser.mjs --screenshots
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
await page.addInitScript(() => {
  window.__calibrationLog = [];
  window.__calibrationStates = [];
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', event => {
        const message = event.data;
        if (message?.type === 'progress' && message.progress?.kind === 'calibration') {
          window.__calibrationLog.push({ stage: message.progress.stage,
            type: message.progress.type, elapsedMs: message.progress.value?.elapsedMs });
          if (message.progress.stage === 'start') setTimeout(() => {
            const rows = [...document.querySelectorAll('#panel-1 .tab-table tbody tr')];
            const ruleE = rows.find(row => row.querySelector('th')?.textContent === 'E10');
            const ruleA = rows.find(row => row.querySelector('th')?.textContent === 'A');
            window.__calibrationStates.push({ banner: document.querySelector('#simulation-banner')?.textContent,
              ruleEOpacity: ruleE ? getComputedStyle(ruleE).opacity : null,
              ordinaryRuleUpdated: Boolean(ruleA?.querySelector('td[data-source="simulated"]')) });
          }, 0);
        }
        if (message?.type === 'result') window.__calibrationLog.push({ stage: 'result', elapsedMs: message.elapsedMs });
      });
    }
  };
});
const folder = new URL('../screenshots/stage3c/', import.meta.url);
if (process.argv.includes('--screenshots')) await mkdir(folder, { recursive: true });
const pageUrl = new URL('../index.html', import.meta.url);
const ready = async () => {
  await page.waitForFunction(() => /Estimates ready|Simulation error/.test(
    document.querySelector('#simulation-banner')?.textContent || ''), null, { timeout: 120000 });
  const banner = await page.locator('#simulation-banner').innerText();
  assert.ok(banner.includes('Estimates ready'), banner);
};
async function screenshot(tab, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.locator(`#tab-${tab}`).click();
  if (process.argv.includes('--screenshots'))
    await page.screenshot({ path: fileURLToPath(new URL(`local-8-tab-${tab}-${width}.png`, folder)), fullPage: true });
}

try {
  await page.goto(`${pageUrl.href}#mean-lnu=8`);
  await ready();
  const localLog = await page.evaluate(() => window.__calibrationLog);
  assert.ok(localLog.some(item => item.stage === 'start' && item.type === 'LNU'));
  assert.ok(localLog.some(item => item.stage === 'done' && item.type === 'LNU'));
  const localStates = await page.evaluate(() => window.__calibrationStates);
  assert.ok(localStates.some(item => item.banner?.includes('Recalibrating rule E for local units')));
  assert.ok(localStates.some(item => Number(item.ruleEOpacity) < 1 && item.ordinaryRuleUpdated));
  for (const rule of ['E10', 'E50']) {
    const row = page.locator('#panel-1 .tab-table tbody tr').filter({ has: page.locator(`th:text-is("${rule}")`) });
    assert.equal(await row.locator('td[data-source="simulated"]').count(), 1);
  }
  assert.match(await page.locator('#panel-1 .tab-working').innerText(), /E10 threshold, local units: .*\(paper\) → .*\(recalibrated\)/);
  assert.match(await page.locator('#panel-1 .takeaway').innerText(), /In the paper’s setting: chance alone/);
  assert.equal(await page.locator('#panel-1 .unavailable-row').count(), 0);
  await screenshot(1, 1400);
  await screenshot(1, 390);
  await screenshot(4, 1400);
  await screenshot(4, 390);
  assert.equal(await page.locator('#panel-4 .table-hint').isVisible(), true);
  await page.locator('#figure2-details summary').click();
  assert.match(await page.locator('#figure2-details').innerText(),
    /Figure 2 shows the paper's settings; it is not recalculated in simulation mode\./);
  await page.setViewportSize({ width: 1400, height: 900 });

  await page.goto(`${pageUrl.href}#mean-nicu=25&mean-lnu=8&mean-scu=2`);
  // A changed hash can reuse the same document and its threshold cache.
  // Reload to measure all three fresh calibrations in one worker run.
  await page.reload();
  await ready();
  const allLog = await page.evaluate(() => window.__calibrationLog);
  const times = Object.fromEntries(['NICU', 'LNU', 'SCU'].map(type => {
    const event = allLog.find(item => item.stage === 'done' && item.type === type);
    assert.ok(event, `${type} recalibration completed`);
    return [type, event.elapsedMs];
  }));
  const totalMs = allLog.find(item => item.stage === 'result')?.elapsedMs;
  assert.ok(totalMs > Math.max(...Object.values(times)));
  assert.equal(errors.length, 0, errors.join('; '));
  if (process.argv.includes('--screenshots')) await writeFile(new URL('timings.json', folder),
    `${JSON.stringify({ calibrationMs: times, workerTotalMs: totalMs, localLog }, null, 2)}\n`);
  console.log('file:// Stage 3c browser PASS:', JSON.stringify({ calibrationMs: times, workerTotalMs: totalMs }));
} finally {
  await browser.close();
}
