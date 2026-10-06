// Run from interactive/: node tests/sim-worker.browser.mjs [--full]
// Install Playwright or set PLAYWRIGHT_MODULE to its local index.mjs path.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const moduleSpecifier = process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright';
const { chromium } = await import(moduleSpecifier);
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(new URL('../index.html', import.meta.url).href);
  const full = process.argv.includes('--full');
  const outcome = await page.evaluate(full => new Promise((resolveOutcome, rejectOutcome) => {
    const worker = window.ArithmeticSimulation.createWorker();
    const timer = setTimeout(() => { worker.terminate(); rejectOutcome(new Error('Worker timeout')); }, full ? 120000 : 15000);
    let progress = 0;
    worker.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'ready') {
        worker.postMessage({ type: 'run', id: 1, options: full
          ? { seed: 20261007 }
          : { seed: 17, rules: ['A'], types: ['NICU'], effects: [4], chanceReps: 10, detectionReps: 20 } });
      } else if (message.type === 'progress') progress++;
      else if (message.type === 'result') {
        clearTimeout(timer);
        worker.terminate();
        resolveOutcome({ result: message.result, elapsedMs: message.elapsedMs, progress });
      } else if (message.type === 'error') {
        clearTimeout(timer);
        worker.terminate();
        rejectOutcome(new Error(message.message));
      }
    });
    worker.addEventListener('error', event => { clearTimeout(timer); worker.terminate(); rejectOutcome(new Error(event.message)); });
  }), full);
  assert.equal(errors.length, 0, `Page errors: ${errors.join('; ')}`);
  assert.equal(outcome.progress, full ? 54 : 2);
  assert.equal(outcome.result.chance.A.NICU.counts.units, full ? 2000 : 10);
  assert.equal(outcome.result.detection[4].A.NICU.counts.units, full ? 10000 : 20);
  assert.ok(outcome.result.chance.A.NICU.alpha >= 0);
  if (full) {
    const browserName = await browser.version();
    await writeFile(new URL('../sim/browser-runtime.json', import.meta.url),
      `${JSON.stringify({ browser: `Chromium ${browserName}`, elapsedMs: outcome.elapsedMs, seed: 20261007 }, null, 2)}\n`);
  }
  console.log(`file:// worker smoke PASS: ${outcome.progress} jobs, ${outcome.elapsedMs.toFixed(0)} ms, no page errors`);
} finally {
  await browser.close();
}
